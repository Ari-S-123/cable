import { ConvexError, v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { appendAuditEvent } from "./audit";
import { auditHash } from "./policy/canonicalize";
import {
  assertCareAuthorization,
  assertResourceOwnership,
} from "./policy/authorization";

/** Creates a new immutable provider action version from exact consented English text. */
export const saveForReview = mutation({
  args: {
    careCircleId: v.id("careCircles"),
    careEventId: v.id("careEvents"),
    consentId: v.id("consents"),
    actionProposalId: v.optional(v.id("actionProposals")),
    expectedActionVersion: v.optional(v.number()),
    actionType: v.union(
      v.literal("send_provider_email"),
      v.literal("send_provider_sms"),
      v.literal("request_caregiver_call"),
      v.literal("retry_checkin"),
      v.literal("mark_resolved"),
    ),
    providerContactId: v.id("providerContacts"),
    channel: v.union(v.literal("email"), v.literal("sms")),
    purpose: v.union(
      v.literal("caregiver_review"),
      v.literal("provider_callback"),
      v.literal("appointment_coordination"),
      v.literal("family_checkin"),
      v.literal("operational_alert"),
    ),
    subject: v.optional(v.string()),
    callbackPreference: v.optional(v.string()),
    opaqueReference: v.string(),
    explanation: v.string(),
    limitations: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const authorization = await assertCareAuthorization(
      ctx,
      args.careCircleId,
      "caregiver",
    );
    const [event, consent, provider] = await Promise.all([
      ctx.db.get(args.careEventId),
      ctx.db.get(args.consentId),
      ctx.db.get(args.providerContactId),
    ]);
    if (
      (args.channel === "sms" &&
        process.env.INTEGRATION_MODE === "live" &&
        process.env.TWILIO_ENABLED !== "true") ||
      (args.channel === "email" && args.actionType !== "send_provider_email") ||
      (args.channel === "sms" && args.actionType !== "send_provider_sms")
    ) {
      throw new ConvexError({
        code: "LIVE_CONFIGURATION_REQUIRED",
        message: "The requested delivery channel is not enabled.",
      });
    }
    if (event === null || consent === null || provider === null) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "The proposed action resources are unavailable.",
      });
    }
    assertResourceOwnership(event.careCircleId, args.careCircleId);
    assertResourceOwnership(consent.careCircleId, args.careCircleId);
    assertResourceOwnership(provider.careCircleId, args.careCircleId);
    const eventVersion = await ctx.db
      .query("careEventVersions")
      .withIndex("by_event_and_version", (queryBuilder) =>
        queryBuilder
          .eq("careEventId", event._id)
          .eq("version", event.currentVersion),
      )
      .unique();
    const now = Date.now();
    const recipientCovered = consent.recipientRefs.some(
      (recipient) =>
        recipient.kind === "provider_contact" && recipient.id === provider._id,
    );
    if (
      eventVersion === null ||
      eventVersion.disclosureSnapshot === undefined ||
      consent.careEventId !== event._id ||
      consent.eventVersion !== event.currentVersion ||
      consent.status !== "granted" ||
      consent.expiresAt === undefined ||
      consent.expiresAt <= now ||
      consent.outboundPayloadHash !==
        eventVersion.disclosureSnapshot.aggregateHash ||
      !recipientCovered ||
      !consent.channels.includes(args.channel) ||
      consent.purpose !== args.purpose ||
      provider.status !== "active" ||
      !provider.verifiedChannels.includes(args.channel)
    ) {
      throw new ConvexError({
        code: "CONSENT_REQUIRED",
        message: "Current recipient- and channel-specific consent is required.",
      });
    }
    const subject = args.subject?.trim().normalize("NFC");
    const callbackPreference = args.callbackPreference?.trim().normalize("NFC");
    const opaqueReference = args.opaqueReference.trim().normalize("NFC");
    const explanation = args.explanation.trim().normalize("NFC");
    const limitations = args.limitations.map((value) =>
      value.trim().normalize("NFC"),
    );
    if (
      (subject !== undefined &&
        (subject.length === 0 || subject.length > 200)) ||
      (callbackPreference !== undefined &&
        (callbackPreference.length === 0 || callbackPreference.length > 300)) ||
      !/^[A-Z0-9-]{6,40}$/u.test(opaqueReference) ||
      explanation.length === 0 ||
      explanation.length > 800 ||
      limitations.length > 10 ||
      limitations.some((value) => value.length === 0 || value.length > 300)
    ) {
      throw new ConvexError({
        code: "INVALID_REQUEST",
        message: "The proposed action content is invalid.",
      });
    }
    const payloadSnapshot = {
      ...(subject === undefined ? {} : { subject }),
      body: eventVersion.disclosureSnapshot.providerDisclosure.text,
      ...(callbackPreference === undefined ? {} : { callbackPreference }),
      opaqueReference,
    };
    const payloadHash = await auditHash({
      actionType: args.actionType,
      recipientId: provider._id,
      channel: args.channel,
      purpose: args.purpose,
      payloadSnapshot,
    });
    const existing =
      args.actionProposalId === undefined
        ? null
        : await ctx.db.get(args.actionProposalId);
    if (
      existing !== null &&
      (existing.careCircleId !== args.careCircleId ||
        existing.careEventId !== event._id ||
        existing.currentVersion !== args.expectedActionVersion ||
        ["queued", "executing", "completed"].includes(existing.status))
    ) {
      throw new ConvexError({
        code: "STALE_VERSION",
        message: "The action can no longer be edited.",
      });
    }
    if (existing === null && args.actionProposalId !== undefined) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Action proposal is unavailable.",
      });
    }
    const actionVersion = (existing?.currentVersion ?? 0) + 1;
    const actionProposalId =
      existing === null
        ? await ctx.db.insert("actionProposals", {
            careCircleId: args.careCircleId,
            careEventId: event._id,
            consentId: consent._id,
            currentVersion: actionVersion,
            status: "awaiting_approval",
            createdAt: now,
            updatedAt: now,
          })
        : existing._id;
    await ctx.db.insert("actionProposalVersions", {
      actionProposalId,
      careCircleId: args.careCircleId,
      careEventId: event._id,
      eventVersion: event.currentVersion,
      consentId: consent._id,
      version: actionVersion,
      actionType: args.actionType,
      recipientRef: {
        kind: "provider_contact",
        id: provider._id,
        displayLabel: provider.displayName,
      },
      channel: args.channel,
      purpose: args.purpose,
      payloadSnapshot,
      payloadHash,
      disclosureAggregateHash: eventVersion.disclosureSnapshot.aggregateHash,
      explanation,
      limitations,
      expiresAt: Math.min(consent.expiresAt, now + 24 * 60 * 60 * 1_000),
      createdBy: "caregiver",
      createdByUserId: authorization.user._id,
      createdAt: now,
    });
    await ctx.db.patch(actionProposalId, {
      consentId: consent._id,
      currentVersion: actionVersion,
      status: "awaiting_approval",
      updatedAt: now,
    });
    if (existing !== null) {
      const approvals = await ctx.db
        .query("approvals")
        .withIndex("by_action_and_version", (queryBuilder) =>
          queryBuilder
            .eq("actionProposalId", existing._id)
            .eq("actionVersion", existing.currentVersion),
        )
        .collect();
      for (const approval of approvals) {
        if (approval.invalidatedAt === undefined) {
          await ctx.db.patch(approval._id, {
            invalidatedAt: now,
            invalidationReason: "action_version_changed",
          });
        }
      }
    } else {
      const competing = await ctx.db
        .query("actionProposals")
        .filter((queryBuilder) =>
          queryBuilder.and(
            queryBuilder.eq(queryBuilder.field("careEventId"), event._id),
            queryBuilder.neq(queryBuilder.field("_id"), actionProposalId),
          ),
        )
        .take(100);
      for (const proposal of competing) {
        if (!["completed", "queued", "executing"].includes(proposal.status)) {
          await ctx.db.patch(proposal._id, {
            status: "invalidated",
            updatedAt: now,
          });
        }
      }
    }
    await appendAuditEvent(ctx, {
      careCircleId: args.careCircleId,
      actor: { kind: "user", opaqueId: authorization.user._id },
      eventType: existing === null ? "action.proposed" : "action.edited",
      resourceType: "actionProposal",
      resourceId: actionProposalId,
      resourceVersion: actionVersion,
      metadataRedacted: {
        status: "awaiting_approval",
        channel: args.channel,
      },
      createdAt: now,
    });
    return { actionProposalId, actionVersion, payloadHash };
  },
});

/** Returns consent-filtered proposal cards with immutable current payload previews. */
export const listForReview = query({
  args: { careCircleId: v.id("careCircles") },
  handler: async (ctx, args) => {
    await assertCareAuthorization(ctx, args.careCircleId, "caregiver");
    const proposals = await ctx.db
      .query("actionProposals")
      .withIndex("by_circle_and_updated_at", (queryBuilder) =>
        queryBuilder.eq("careCircleId", args.careCircleId),
      )
      .order("desc")
      .take(50);
    return Promise.all(
      proposals.map(async (proposal) => {
        const version = await ctx.db
          .query("actionProposalVersions")
          .withIndex("by_proposal_and_version", (queryBuilder) =>
            queryBuilder
              .eq("actionProposalId", proposal._id)
              .eq("version", proposal.currentVersion),
          )
          .unique();
        if (version === null) return undefined;
        const consent = await ctx.db.get(version.consentId);
        if (
          consent === null ||
          consent.status !== "granted" ||
          consent.expiresAt === undefined ||
          consent.expiresAt <= Date.now() ||
          consent.eventVersion !== version.eventVersion ||
          consent.outboundPayloadHash !== version.disclosureAggregateHash
        ) {
          return {
            id: proposal._id,
            version: proposal.currentVersion,
            status: "waiting_for_elder" as const,
            updatedAt: proposal.updatedAt,
          };
        }
        const validation = await ctx.db
          .query("policyValidations")
          .withIndex("by_action_version_and_hash", (queryBuilder) =>
            queryBuilder
              .eq("actionProposalId", proposal._id)
              .eq("actionVersion", proposal.currentVersion)
              .eq("payloadHash", version.payloadHash),
          )
          .order("desc")
          .first();
        return {
          id: proposal._id,
          version: proposal.currentVersion,
          status: proposal.status,
          actionType: version.actionType,
          recipient: version.recipientRef.displayLabel,
          channel: version.channel,
          purpose: version.purpose,
          payload: version.payloadSnapshot,
          payloadHash: version.payloadHash,
          explanation: version.explanation,
          limitations: version.limitations,
          validation:
            validation === null
              ? undefined
              : {
                  decision: validation.decision,
                  failedRules: validation.failedRules,
                  expiresAt: validation.expiresAt,
                },
          updatedAt: proposal.updatedAt,
        };
      }),
    );
  },
});

/** Approves or rejects exactly one current immutable proposal version. */
export const decide = mutation({
  args: {
    careCircleId: v.id("careCircles"),
    actionProposalId: v.id("actionProposals"),
    expectedVersion: v.number(),
    expectedPayloadHash: v.string(),
    decision: v.union(v.literal("approved"), v.literal("rejected")),
    comment: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const authorization = await assertCareAuthorization(
      ctx,
      args.careCircleId,
      "caregiver",
    );
    const proposal = await ctx.db.get(args.actionProposalId);
    if (proposal === null) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Action proposal is unavailable.",
      });
    }
    assertResourceOwnership(proposal.careCircleId, args.careCircleId);
    if (
      proposal.currentVersion !== args.expectedVersion ||
      proposal.status !== "awaiting_approval"
    ) {
      throw new ConvexError({
        code: "STALE_VERSION",
        message: "A newer action version exists.",
      });
    }
    const version = await ctx.db
      .query("actionProposalVersions")
      .withIndex("by_proposal_and_version", (queryBuilder) =>
        queryBuilder
          .eq("actionProposalId", proposal._id)
          .eq("version", args.expectedVersion),
      )
      .unique();
    if (version === null || version.payloadHash !== args.expectedPayloadHash) {
      throw new ConvexError({
        code: "STALE_VERSION",
        message: "The approved content has changed.",
      });
    }
    const consent = await ctx.db.get(version.consentId);
    if (
      consent === null ||
      consent.status !== "granted" ||
      consent.expiresAt === undefined ||
      consent.expiresAt <= Date.now() ||
      consent.eventVersion !== version.eventVersion ||
      consent.outboundPayloadHash !== version.disclosureAggregateHash
    ) {
      throw new ConvexError({
        code: "CONSENT_REQUIRED",
        message: "Current elder consent is required.",
      });
    }
    const now = Date.now();
    await ctx.db.insert("approvals", {
      careCircleId: args.careCircleId,
      actionProposalId: proposal._id,
      actionVersion: args.expectedVersion,
      caregiverUserId: authorization.user._id,
      decision: args.decision,
      payloadHash: args.expectedPayloadHash,
      decidedAt: now,
      ...(args.comment === undefined
        ? {}
        : { comment: args.comment.slice(0, 500) }),
    });
    await ctx.db.patch(proposal._id, {
      status: args.decision === "approved" ? "approved" : "rejected",
      updatedAt: now,
    });
    await appendAuditEvent(ctx, {
      careCircleId: args.careCircleId,
      actor: { kind: "user", opaqueId: authorization.user._id },
      eventType: `approval.${args.decision}`,
      resourceType: "actionProposal",
      resourceId: proposal._id,
      resourceVersion: args.expectedVersion,
      metadataRedacted: { status: args.decision, channel: version.channel },
      createdAt: now,
    });
    return { status: args.decision, version: args.expectedVersion };
  },
});
