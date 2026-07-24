import { ConvexError, v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { appendAuditEvent } from "./audit";
import {
  assertCareAuthorization,
  assertResourceOwnership,
} from "./policy/authorization";

/** Normalizes and validates one provider email destination. */
function normalizeEmail(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim().normalize("NFC").toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(normalized)) {
    throw new ConvexError({
      code: "INVALID_REQUEST",
      message: "The provider email address is invalid.",
    });
  }
  return normalized;
}

/** Normalizes and validates one provider E.164 phone destination. */
function normalizePhone(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const normalized = value.replace(/[\s().-]/gu, "");
  if (!/^\+[1-9]\d{7,14}$/u.test(normalized)) {
    throw new ConvexError({
      code: "INVALID_REQUEST",
      message: "The provider phone number must use E.164 format.",
    });
  }
  return normalized;
}

/** Parses a comma-delimited destination allow-list into normalized values. */
function allowList(value: string | undefined): ReadonlySet<string> {
  return new Set(
    (value ?? "")
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry) => entry.length > 0),
  );
}

/** Produces a stable redacted email label suitable for role-filtered queries. */
function maskEmail(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const at = value.indexOf("@");
  if (at <= 0) return "•••";
  return `${value.slice(0, 1)}•••${value.slice(at)}`;
}

/** Produces a stable redacted phone label suitable for role-filtered queries. */
function maskPhone(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  return `•••${value.slice(-4)}`;
}

/** Returns active provider view models without exposing full destinations. */
export const list = query({
  args: { careCircleId: v.id("careCircles") },
  handler: async (ctx, args) => {
    await assertCareAuthorization(ctx, args.careCircleId);
    const contacts = await ctx.db
      .query("providerContacts")
      .withIndex("by_circle_and_status", (queryBuilder) =>
        queryBuilder
          .eq("careCircleId", args.careCircleId)
          .eq("status", "active"),
      )
      .take(100);
    return contacts.map((contact) => ({
      id: contact._id,
      displayName: contact.displayName,
      organizationName: contact.organizationName,
      ...(contact.specialty === undefined
        ? {}
        : { specialty: contact.specialty }),
      ...(maskEmail(contact.email) === undefined
        ? {}
        : { emailLabel: maskEmail(contact.email) }),
      ...(maskPhone(contact.phoneE164) === undefined
        ? {}
        : { phoneLabel: maskPhone(contact.phoneE164) }),
      verifiedChannels: contact.verifiedChannels,
      verificationMethod: contact.verificationMethod,
      verifiedAt: contact.verifiedAt,
      isSynthetic: contact.isSynthetic,
    }));
  },
});

/** Creates or updates only allow-listed provider destinations. */
export const upsertAllowListed = mutation({
  args: {
    careCircleId: v.id("careCircles"),
    displayName: v.string(),
    organizationName: v.string(),
    specialty: v.optional(v.string()),
    email: v.optional(v.string()),
    phoneE164: v.optional(v.string()),
    verificationMethod: v.union(
      v.literal("seeded_demo"),
      v.literal("otp"),
      v.literal("manual_callback"),
    ),
  },
  handler: async (ctx, args) => {
    const authorization = await assertCareAuthorization(
      ctx,
      args.careCircleId,
      "caregiver",
    );
    if (!authorization.membership.canManageProviderContacts) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Provider-contact management is not permitted.",
      });
    }
    const displayName = args.displayName.trim().normalize("NFC");
    const organizationName = args.organizationName.trim().normalize("NFC");
    const specialty = args.specialty?.trim().normalize("NFC");
    if (
      displayName.length < 2 ||
      displayName.length > 120 ||
      organizationName.length < 2 ||
      organizationName.length > 160 ||
      (specialty !== undefined && specialty.length > 120)
    ) {
      throw new ConvexError({
        code: "INVALID_REQUEST",
        message: "The provider contact details are invalid.",
      });
    }
    const email = normalizeEmail(args.email);
    const phoneE164 = normalizePhone(args.phoneE164);
    if (email === undefined && phoneE164 === undefined) {
      throw new ConvexError({
        code: "INVALID_REQUEST",
        message: "At least one provider destination is required.",
      });
    }
    const deterministic = process.env.INTEGRATION_MODE !== "live";
    const emailAllowed =
      email === undefined ||
      (deterministic
        ? email.endsWith(".invalid")
        : allowList(process.env.APPROVED_PROVIDER_EMAILS).has(email));
    const phoneAllowed =
      phoneE164 === undefined ||
      (deterministic
        ? /^\+155501\d{4}$/u.test(phoneE164)
        : allowList(process.env.APPROVED_PROVIDER_PHONES).has(
            phoneE164.toLowerCase(),
          ));
    if (
      !emailAllowed ||
      !phoneAllowed ||
      (deterministic && args.verificationMethod !== "seeded_demo") ||
      (!deterministic && args.verificationMethod === "seeded_demo")
    ) {
      throw new ConvexError({
        code: "CONTACT_UNVERIFIED",
        message: "The destination is not on the approved provider allow-list.",
      });
    }
    const existingByEmail =
      email === undefined
        ? null
        : await ctx.db
            .query("providerContacts")
            .withIndex("by_circle_and_email", (queryBuilder) =>
              queryBuilder
                .eq("careCircleId", args.careCircleId)
                .eq("email", email),
            )
            .unique();
    const existingByPhone =
      phoneE164 === undefined
        ? null
        : await ctx.db
            .query("providerContacts")
            .withIndex("by_circle_and_phone", (queryBuilder) =>
              queryBuilder
                .eq("careCircleId", args.careCircleId)
                .eq("phoneE164", phoneE164),
            )
            .unique();
    if (
      existingByEmail !== null &&
      existingByPhone !== null &&
      existingByEmail._id !== existingByPhone._id
    ) {
      throw new ConvexError({
        code: "INVALID_REQUEST",
        message: "The destinations belong to different provider contacts.",
      });
    }
    const existing = existingByEmail ?? existingByPhone;
    const now = Date.now();
    const verifiedChannels = [
      ...(email === undefined ? [] : (["email"] as const)),
      ...(phoneE164 === undefined ? [] : (["sms"] as const)),
    ];
    const values = {
      displayName,
      organizationName,
      ...(specialty === undefined ? {} : { specialty }),
      ...(email === undefined ? {} : { email }),
      ...(phoneE164 === undefined ? {} : { phoneE164 }),
      verifiedChannels,
      verificationMethod: args.verificationMethod,
      verifiedAt: now,
      status: "active" as const,
      isSynthetic: deterministic,
      updatedAt: now,
    };
    let contactId;
    if (existing === null) {
      contactId = await ctx.db.insert("providerContacts", {
        careCircleId: args.careCircleId,
        ...values,
        createdBy: authorization.user._id,
        createdAt: now,
      });
    } else {
      await ctx.db.patch(existing._id, values);
      contactId = existing._id;
    }
    await appendAuditEvent(ctx, {
      careCircleId: args.careCircleId,
      actor: { kind: "user", opaqueId: authorization.user._id },
      eventType:
        existing === null
          ? "provider_contact.created"
          : "provider_contact.updated",
      resourceType: "providerContact",
      resourceId: contactId,
      metadataRedacted: { status: "active" },
      createdAt: now,
    });
    return { contactId, verifiedChannels };
  },
});

/** Disables one owned provider destination and prevents future execution. */
export const disable = mutation({
  args: {
    careCircleId: v.id("careCircles"),
    providerContactId: v.id("providerContacts"),
  },
  handler: async (ctx, args) => {
    const authorization = await assertCareAuthorization(
      ctx,
      args.careCircleId,
      "caregiver",
    );
    if (!authorization.membership.canManageProviderContacts) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Provider-contact management is not permitted.",
      });
    }
    const contact = await ctx.db.get(args.providerContactId);
    if (contact === null) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Provider contact is unavailable.",
      });
    }
    assertResourceOwnership(contact.careCircleId, args.careCircleId);
    const now = Date.now();
    await ctx.db.patch(contact._id, { status: "disabled", updatedAt: now });
    await appendAuditEvent(ctx, {
      careCircleId: args.careCircleId,
      actor: { kind: "user", opaqueId: authorization.user._id },
      eventType: "provider_contact.disabled",
      resourceType: "providerContact",
      resourceId: contact._id,
      metadataRedacted: { status: "disabled" },
      createdAt: now,
    });
    return { status: "disabled" as const };
  },
});
