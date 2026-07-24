import { ConvexError, v } from "convex/values";

import { internal } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import { appendAuditEvent } from "./audit";
import {
  assertCareAuthorization,
  assertResourceOwnership,
} from "./policy/authorization";

/** Creates the stable C.A.B.L.E idempotency key after validating each segment. */
function idempotencyKey(
  input: Readonly<{
    actionProposalId: string;
    actionVersion: number;
    channel: string;
    payloadHash: string;
  }>,
): string {
  const environment = process.env.VERCEL_ENV ?? "development";
  const values = [
    "cable",
    environment,
    input.actionProposalId,
    String(input.actionVersion),
    input.channel,
    input.payloadHash,
  ];
  if (values.some((value) => !/^[a-zA-Z0-9_-]+$/u.test(value))) {
    throw new ConvexError({
      code: "INVALID_REQUEST",
      message: "Invalid idempotency material.",
    });
  }
  const key = values.join(":");
  if (key.length > 255) {
    throw new ConvexError({
      code: "INVALID_REQUEST",
      message: "Idempotency key is too long.",
    });
  }
  return key;
}

/** Returns a bounded, redacted delivery feed for the authenticated care circle. */
export const listVisible = query({
  args: { careCircleId: v.id("careCircles") },
  handler: async (ctx, args) => {
    await assertCareAuthorization(ctx, args.careCircleId, "caregiver");
    const notifications = await ctx.db
      .query("notifications")
      .withIndex("by_circle_and_created_at", (queryBuilder) =>
        queryBuilder.eq("careCircleId", args.careCircleId),
      )
      .order("desc")
      .take(50);
    return notifications.map((notification) => ({
      id: notification._id,
      actionProposalId: notification.actionProposalId,
      channel: notification.channel,
      category: notification.category,
      recipientLabel: notification.recipientRef.displayLabel,
      status: notification.status,
      attemptCount: notification.attemptCount,
      lastErrorCode: notification.lastErrorCode,
      createdAt: notification.createdAt,
      updatedAt: notification.updatedAt,
    }));
  },
});

/**
 * Atomically rechecks authorization bindings, reserves idempotency, and creates
 * an immutable notification plus leaseable outbox job.
 */
export const queueApproved = mutation({
  args: {
    careCircleId: v.id("careCircles"),
    actionProposalId: v.id("actionProposals"),
    expectedVersion: v.number(),
    expectedPayloadHash: v.string(),
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
      proposal.status !== "approved" ||
      proposal.currentVersion !== args.expectedVersion ||
      !authorization.circle.externalActionsEnabled ||
      process.env.EXTERNAL_ACTIONS_ENABLED !== "true"
    ) {
      throw new ConvexError({
        code: "POLICY_VALIDATION_FAILED",
        message: "The approved action is not currently executable.",
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
    if (
      version.channel === "sms" &&
      process.env.INTEGRATION_MODE === "live" &&
      process.env.TWILIO_ENABLED !== "true"
    ) {
      throw new ConvexError({
        code: "LIVE_CONFIGURATION_REQUIRED",
        message: "SMS delivery is disabled for this deployment.",
      });
    }
    const now = Date.now();
    if (version.expiresAt <= now) {
      throw new ConvexError({
        code: "STALE_VERSION",
        message: "The approved action has expired.",
      });
    }
    const [consent, approval, validation] = await Promise.all([
      ctx.db.get(version.consentId),
      ctx.db
        .query("approvals")
        .withIndex("by_action_and_version", (queryBuilder) =>
          queryBuilder
            .eq("actionProposalId", proposal._id)
            .eq("actionVersion", args.expectedVersion),
        )
        .order("desc")
        .first(),
      ctx.db
        .query("policyValidations")
        .withIndex("by_action_version_and_hash", (queryBuilder) =>
          queryBuilder
            .eq("actionProposalId", proposal._id)
            .eq("actionVersion", args.expectedVersion)
            .eq("payloadHash", args.expectedPayloadHash),
        )
        .order("desc")
        .first(),
    ]);
    if (
      consent === null ||
      consent.status !== "granted" ||
      consent.expiresAt === undefined ||
      consent.expiresAt <= now ||
      consent.eventVersion !== version.eventVersion ||
      consent.outboundPayloadHash !== version.disclosureAggregateHash
    ) {
      throw new ConvexError({
        code: "CONSENT_REQUIRED",
        message: "Current elder consent is required.",
      });
    }
    if (
      consent.locale === "hi-IN" &&
      process.env.INTEGRATION_MODE === "live" &&
      process.env.HINDI_CONSENT_TEMPLATE_APPROVED !== "true"
    ) {
      throw new ConvexError({
        code: "LIVE_CONFIGURATION_REQUIRED",
        message: "The live Hindi consent template is not approved.",
      });
    }
    if (
      approval === null ||
      approval.decision !== "approved" ||
      approval.invalidatedAt !== undefined ||
      approval.payloadHash !== args.expectedPayloadHash
    ) {
      throw new ConvexError({
        code: "APPROVAL_REQUIRED",
        message: "Current approval is required.",
      });
    }
    if (
      validation === null ||
      validation.decision !== "pass" ||
      validation.expiresAt <= now ||
      validation.payloadHash !== args.expectedPayloadHash
    ) {
      throw new ConvexError({
        code: "POLICY_VALIDATION_FAILED",
        message: "A current isolated policy validation is required.",
      });
    }
    if (version.recipientRef.kind !== "provider_contact") {
      throw new ConvexError({
        code: "CONTACT_UNVERIFIED",
        message: "A verified contact is required.",
      });
    }
    const providerId = ctx.db.normalizeId(
      "providerContacts",
      version.recipientRef.id,
    );
    const provider = providerId === null ? null : await ctx.db.get(providerId);
    if (
      provider === null ||
      provider.careCircleId !== args.careCircleId ||
      provider.status !== "active" ||
      !provider.verifiedChannels.includes(
        version.channel === "email" ? "email" : "sms",
      )
    ) {
      throw new ConvexError({
        code: "CONTACT_UNVERIFIED",
        message: "A verified contact is required.",
      });
    }
    const key = idempotencyKey({
      actionProposalId: proposal._id,
      actionVersion: version.version,
      channel: version.channel,
      payloadHash: version.payloadHash,
    });
    const existing = await ctx.db
      .query("notifications")
      .withIndex("by_idempotency_key", (queryBuilder) =>
        queryBuilder.eq("idempotencyKey", key),
      )
      .unique();
    if (existing !== null)
      return { notificationId: existing._id, duplicate: true };

    const notificationId = await ctx.db.insert("notifications", {
      careCircleId: args.careCircleId,
      actionProposalId: proposal._id,
      actionVersion: version.version,
      consentId: consent._id,
      recipientRef: version.recipientRef,
      channel: version.channel,
      category: "provider_message",
      payloadSnapshot: version.payloadSnapshot,
      payloadHash: version.payloadHash,
      status: "queued",
      idempotencyKey: key,
      attemptCount: 0,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("outboxJobs", {
      notificationId,
      status: "pending",
      availableAt: now,
      attemptCount: 0,
      maxAttempts: version.channel === "sms" ? 1 : 4,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(proposal._id, { status: "queued", updatedAt: now });
    await appendAuditEvent(ctx, {
      careCircleId: args.careCircleId,
      actor: { kind: "user", opaqueId: authorization.user._id },
      eventType: "notification.queued",
      resourceType: "notification",
      resourceId: notificationId,
      resourceVersion: version.version,
      metadataRedacted: { status: "queued", channel: version.channel },
      createdAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.outboxWorker.processNext, {});
    return { notificationId, duplicate: false };
  },
});
