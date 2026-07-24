import { ConvexError, v } from "convex/values";

import { mutation } from "./_generated/server";
import { appendAuditEvent } from "./audit";
import {
  assertCareAuthorization,
  assertResourceOwnership,
} from "./policy/authorization";

const explicitYes = new Set([
  "yes",
  "yes share this",
  "i consent",
  "i clearly agree",
  "हाँ",
  "हां",
  "हाँ साझा करें",
  "मैं स्पष्ट रूप से सहमत हूँ",
]);
const explicitNo = new Set([
  "no",
  "do not share",
  "keep this private",
  "stop",
  "नहीं",
  "साझा न करें",
  "इसे निजी रखें",
  "रुकिए",
]);

const allowedFieldPaths = new Set([
  "canonicalEnglishSummary",
  "confirmedFacts",
  "requestedOutcome",
  "providerDisclosure",
  "callbackPreference",
]);

/** Creates one exact, version-bound disclosure request from authoritative event content. */
export const prepareRequest = mutation({
  args: {
    careCircleId: v.id("careCircles"),
    careEventId: v.id("careEvents"),
    expectedEventVersion: v.number(),
    allowedFieldPaths: v.array(v.string()),
    recipientRefs: v.array(
      v.object({
        kind: v.union(v.literal("user"), v.literal("provider_contact")),
        id: v.string(),
        displayLabel: v.string(),
      }),
    ),
    channels: v.array(
      v.union(
        v.literal("in_app"),
        v.literal("email"),
        v.literal("sms"),
        v.literal("voice"),
      ),
    ),
    purpose: v.union(
      v.literal("caregiver_review"),
      v.literal("provider_callback"),
      v.literal("appointment_coordination"),
      v.literal("family_checkin"),
      v.literal("operational_alert"),
    ),
    promptText: v.string(),
    locale: v.union(v.literal("en-US"), v.literal("hi-IN")),
    templateVersion: v.string(),
    sourceTurnId: v.string(),
  },
  handler: async (ctx, args) => {
    const authorization = await assertCareAuthorization(
      ctx,
      args.careCircleId,
      "elder",
    );
    const event = await ctx.db.get(args.careEventId);
    if (event === null) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Care event is unavailable.",
      });
    }
    assertResourceOwnership(event.careCircleId, args.careCircleId);
    const version = await ctx.db
      .query("careEventVersions")
      .withIndex("by_event_and_version", (queryBuilder) =>
        queryBuilder
          .eq("careEventId", event._id)
          .eq("version", args.expectedEventVersion),
      )
      .unique();
    if (
      event.elderUserId !== authorization.user._id ||
      event.currentVersion !== args.expectedEventVersion ||
      event.status !== "facts_confirmed" ||
      version === null ||
      version.disclosureSnapshot === undefined
    ) {
      throw new ConvexError({
        code: "STALE_VERSION",
        message: "The confirmed disclosure is no longer current.",
      });
    }
    const sourceTurnId = ctx.db.normalizeId(
      "conversationTurns",
      args.sourceTurnId,
    );
    const sourceTurn =
      sourceTurnId === null ? null : await ctx.db.get(sourceTurnId);
    if (
      sourceTurn === null ||
      sourceTurn.conversationId !== event.conversationId ||
      sourceTurn.careCircleId !== args.careCircleId
    ) {
      throw new ConvexError({
        code: "INVALID_REQUEST",
        message: "The consent source turn is unavailable.",
      });
    }
    const uniqueFields = [...new Set(args.allowedFieldPaths)];
    const uniqueChannels = [...new Set(args.channels)];
    if (
      uniqueFields.length === 0 ||
      uniqueFields.length > 5 ||
      uniqueFields.some((path) => !allowedFieldPaths.has(path)) ||
      uniqueChannels.length === 0 ||
      uniqueChannels.length > 4 ||
      args.recipientRefs.length === 0 ||
      args.recipientRefs.length > 20 ||
      args.promptText.length < 40 ||
      args.promptText.length > 4_000 ||
      args.templateVersion !== "cable-consent-2026-07-24.1" ||
      !args.promptText.includes("C.A.B.L.E") ||
      !args.promptText.includes(version.disclosureSnapshot.elderPreview.text)
    ) {
      throw new ConvexError({
        code: "INVALID_REQUEST",
        message: "The disclosure request is incomplete or unsupported.",
      });
    }
    const normalizedRecipients = [];
    for (const recipient of args.recipientRefs) {
      if (recipient.kind === "provider_contact") {
        const providerId = ctx.db.normalizeId("providerContacts", recipient.id);
        const provider =
          providerId === null ? null : await ctx.db.get(providerId);
        if (
          provider === null ||
          provider.careCircleId !== args.careCircleId ||
          provider.status !== "active" ||
          (uniqueChannels.includes("email") &&
            !provider.verifiedChannels.includes("email")) ||
          (uniqueChannels.includes("sms") &&
            !provider.verifiedChannels.includes("sms"))
        ) {
          throw new ConvexError({
            code: "CONTACT_UNVERIFIED",
            message: "A disclosure recipient is not verified.",
          });
        }
        normalizedRecipients.push({
          kind: "provider_contact" as const,
          id: provider._id,
          displayLabel: provider.displayName,
        });
      } else {
        const userId = ctx.db.normalizeId("users", recipient.id);
        const user = userId === null ? null : await ctx.db.get(userId);
        const membership =
          user === null
            ? null
            : await ctx.db
                .query("memberships")
                .withIndex("by_circle_and_user", (queryBuilder) =>
                  queryBuilder
                    .eq("careCircleId", args.careCircleId)
                    .eq("userId", user._id),
                )
                .unique();
        if (
          user === null ||
          membership === null ||
          membership.status !== "active"
        ) {
          throw new ConvexError({
            code: "INACTIVE_RELATIONSHIP",
            message: "A disclosure recipient is not active.",
          });
        }
        normalizedRecipients.push({
          kind: "user" as const,
          id: user._id,
          displayLabel: user.displayName,
        });
      }
    }
    const existing = await ctx.db
      .query("consents")
      .filter((queryBuilder) =>
        queryBuilder.and(
          queryBuilder.eq(queryBuilder.field("careEventId"), event._id),
          queryBuilder.or(
            queryBuilder.eq(queryBuilder.field("status"), "requested"),
            queryBuilder.eq(queryBuilder.field("status"), "granted"),
          ),
        ),
      )
      .take(100);
    for (const consent of existing) {
      await ctx.db.patch(consent._id, { status: "superseded" });
    }
    const now = Date.now();
    const consentId = await ctx.db.insert("consents", {
      careCircleId: args.careCircleId,
      elderUserId: authorization.user._id,
      careEventId: event._id,
      eventVersion: version.version,
      status: "requested",
      allowedFieldPaths: uniqueFields,
      canonicalPayloadHash:
        version.disclosureSnapshot.canonicalEnglish.contentHash,
      outboundPayloadHash: version.disclosureSnapshot.aggregateHash,
      elderPreviewHash: version.disclosureSnapshot.elderPreview.contentHash,
      recipientRefs: normalizedRecipients,
      channels: uniqueChannels,
      purpose: args.purpose,
      promptText: args.promptText,
      responseText: "",
      locale: args.locale,
      templateVersion: args.templateVersion,
      sourceTurnId: sourceTurn._id,
      requestedAt: now,
      expiresAt: now + 24 * 60 * 60 * 1_000,
    });
    await ctx.db.patch(event._id, {
      status: "consent_pending",
      updatedAt: now,
    });
    await appendAuditEvent(ctx, {
      careCircleId: args.careCircleId,
      actor: { kind: "user", opaqueId: authorization.user._id },
      eventType: "consent.requested",
      resourceType: "consent",
      resourceId: consentId,
      resourceVersion: version.version,
      metadataRedacted: { status: "requested" },
      createdAt: now,
    });
    return {
      consentId,
      eventVersion: version.version,
      expiresAt: now + 24 * 60 * 60 * 1_000,
    };
  },
});

/** Performs the same conservative exact-phrase normalization as the shared policy. */
function classifyResponse(
  response: string,
): "granted" | "denied" | "ambiguous" {
  const normalized = response
    .normalize("NFC")
    .toLocaleLowerCase()
    .replace(/[.,!?;:"'“”‘’।]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  if (explicitNo.has(normalized)) return "denied";
  if (explicitYes.has(normalized)) return "granted";
  return "ambiguous";
}

/** Records an elder's exact response and grants only a reviewed unqualified yes. */
export const recordResponse = mutation({
  args: {
    careCircleId: v.id("careCircles"),
    consentId: v.id("consents"),
    expectedEventVersion: v.number(),
    exactResponse: v.string(),
  },
  handler: async (ctx, args) => {
    const authorization = await assertCareAuthorization(
      ctx,
      args.careCircleId,
      "elder",
    );
    const consent = await ctx.db.get(args.consentId);
    if (consent === null) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Consent request is unavailable.",
      });
    }
    assertResourceOwnership(consent.careCircleId, args.careCircleId);
    if (
      consent.elderUserId !== authorization.user._id ||
      consent.status !== "requested" ||
      consent.eventVersion !== args.expectedEventVersion
    ) {
      throw new ConvexError({
        code: "STALE_VERSION",
        message: "Consent request is no longer current.",
      });
    }
    if (args.exactResponse.length === 0 || args.exactResponse.length > 500) {
      throw new ConvexError({
        code: "INVALID_REQUEST",
        message: "Consent response is invalid.",
      });
    }
    const classification = classifyResponse(args.exactResponse);
    if (classification === "ambiguous") {
      return { status: "requested" as const, requiresClearAnswer: true };
    }
    const now = Date.now();
    if (
      classification === "granted" &&
      consent.locale === "hi-IN" &&
      process.env.INTEGRATION_MODE === "live" &&
      process.env.HINDI_CONSENT_TEMPLATE_APPROVED !== "true"
    ) {
      throw new ConvexError({
        code: "LIVE_CONFIGURATION_REQUIRED",
        message:
          "Live Hindi consent is disabled until the static template is approved.",
      });
    }
    const status = classification === "granted" ? "granted" : "denied";
    const expiresAt = Math.min(
      consent.expiresAt ?? now + 24 * 60 * 60 * 1_000,
      now + 24 * 60 * 60 * 1_000,
    );
    await ctx.db.patch(consent._id, {
      status,
      responseText: args.exactResponse,
      ...(status === "granted" ? { grantedAt: now, expiresAt } : {}),
    });
    await ctx.db.patch(consent.careEventId, {
      status: status === "granted" ? "shared" : "facts_confirmed",
      updatedAt: now,
    });
    await appendAuditEvent(ctx, {
      careCircleId: args.careCircleId,
      actor: { kind: "user", opaqueId: authorization.user._id },
      eventType: `consent.${status}`,
      resourceType: "consent",
      resourceId: consent._id,
      resourceVersion: consent.eventVersion,
      metadataRedacted: { status },
      createdAt: now,
    });
    return { status, requiresClearAnswer: false };
  },
});

/** Revokes an active grant and atomically cancels every non-executing queued job. */
export const revoke = mutation({
  args: { careCircleId: v.id("careCircles"), consentId: v.id("consents") },
  handler: async (ctx, args) => {
    const authorization = await assertCareAuthorization(
      ctx,
      args.careCircleId,
      "elder",
    );
    const consent = await ctx.db.get(args.consentId);
    if (consent === null) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Consent is unavailable.",
      });
    }
    assertResourceOwnership(consent.careCircleId, args.careCircleId);
    if (
      consent.elderUserId !== authorization.user._id ||
      consent.status !== "granted"
    ) {
      throw new ConvexError({
        code: "CONSENT_REQUIRED",
        message: "No active consent can be revoked.",
      });
    }
    const now = Date.now();
    await ctx.db.patch(consent._id, { status: "revoked", revokedAt: now });
    await ctx.db.patch(consent.careEventId, {
      status: "facts_confirmed",
      updatedAt: now,
    });
    const notifications = await ctx.db
      .query("notifications")
      .withIndex("by_status_and_updated_at", (queryBuilder) =>
        queryBuilder.eq("status", "queued"),
      )
      .filter((queryBuilder) =>
        queryBuilder.eq(queryBuilder.field("consentId"), consent._id),
      )
      .collect();
    for (const notification of notifications) {
      await ctx.db.patch(notification._id, {
        status: "canceled",
        updatedAt: now,
      });
      const jobs = await ctx.db
        .query("outboxJobs")
        .withIndex("by_notification_id", (queryBuilder) =>
          queryBuilder.eq("notificationId", notification._id),
        )
        .collect();
      for (const job of jobs) {
        if (job.status === "pending")
          await ctx.db.patch(job._id, { status: "canceled", updatedAt: now });
      }
    }
    await appendAuditEvent(ctx, {
      careCircleId: args.careCircleId,
      actor: { kind: "user", opaqueId: authorization.user._id },
      eventType: "consent.revoked",
      resourceType: "consent",
      resourceId: consent._id,
      resourceVersion: consent.eventVersion,
      metadataRedacted: { status: "revoked" },
      createdAt: now,
    });
    return {
      status: "revoked" as const,
      canceledNotifications: notifications.length,
    };
  },
});
