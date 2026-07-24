import { ConvexError, v } from "convex/values";

import { internalMutation } from "./_generated/server";
import { appendAuditEvent } from "./audit";

/** Delays for bounded email retries; SMS ambiguous results never use this schedule. */
const retryDelays = [30_000, 120_000, 600_000, 1_800_000] as const;

/** Acquires one transactionally exclusive outbox lease. */
export const leaseNext = internalMutation({
  args: { nowEpochMs: v.number(), leaseTokenHash: v.string() },
  handler: async (ctx, args) => {
    const job = await ctx.db
      .query("outboxJobs")
      .withIndex("by_status_and_available_at", (queryBuilder) =>
        queryBuilder
          .eq("status", "pending")
          .lte("availableAt", args.nowEpochMs),
      )
      .first();
    if (job === null) return undefined;
    const notification = await ctx.db.get(job.notificationId);
    if (notification === null || notification.status !== "queued") {
      await ctx.db.patch(job._id, {
        status: "canceled",
        updatedAt: args.nowEpochMs,
      });
      return undefined;
    }
    await ctx.db.patch(job._id, {
      status: "leased",
      leaseTokenHash: args.leaseTokenHash,
      leaseExpiresAt: args.nowEpochMs + 60_000,
      updatedAt: args.nowEpochMs,
    });
    return { jobId: job._id, notificationId: notification._id };
  },
});

/** Rechecks consent, approval, version, recipient, and kill switches immediately before I/O. */
export const authorizeLease = internalMutation({
  args: {
    jobId: v.id("outboxJobs"),
    leaseTokenHash: v.string(),
    nowEpochMs: v.number(),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (
      job === null ||
      job.status !== "leased" ||
      job.leaseTokenHash !== args.leaseTokenHash ||
      job.leaseExpiresAt === undefined ||
      job.leaseExpiresAt <= args.nowEpochMs
    ) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "The outbox lease is invalid.",
      });
    }
    const notification = await ctx.db.get(job.notificationId);
    if (
      notification === null ||
      notification.status !== "queued" ||
      notification.actionProposalId === undefined ||
      notification.actionVersion === undefined ||
      notification.consentId === undefined
    ) {
      await ctx.db.patch(job._id, {
        status: "canceled",
        updatedAt: args.nowEpochMs,
      });
      return { allowed: false as const };
    }
    const [proposal, consent] = await Promise.all([
      ctx.db.get(notification.actionProposalId),
      ctx.db.get(notification.consentId),
    ]);
    const version =
      proposal === null
        ? null
        : await ctx.db
            .query("actionProposalVersions")
            .withIndex("by_proposal_and_version", (queryBuilder) =>
              queryBuilder
                .eq("actionProposalId", proposal._id)
                .eq("version", notification.actionVersion as number),
            )
            .unique();
    const approval =
      proposal === null
        ? null
        : await ctx.db
            .query("approvals")
            .withIndex("by_action_and_version", (queryBuilder) =>
              queryBuilder
                .eq("actionProposalId", proposal._id)
                .eq("actionVersion", notification.actionVersion as number),
            )
            .order("desc")
            .first();
    const circle = await ctx.db.get(notification.careCircleId);
    if (
      proposal === null ||
      proposal.currentVersion !== notification.actionVersion ||
      !["queued", "approved"].includes(proposal.status) ||
      version === null ||
      version.payloadHash !== notification.payloadHash ||
      consent === null ||
      consent.status !== "granted" ||
      consent.expiresAt === undefined ||
      consent.expiresAt <= args.nowEpochMs ||
      consent.outboundPayloadHash !== version.disclosureAggregateHash ||
      approval === null ||
      approval.decision !== "approved" ||
      approval.invalidatedAt !== undefined ||
      approval.payloadHash !== notification.payloadHash ||
      circle === null ||
      !circle.externalActionsEnabled ||
      process.env.EXTERNAL_ACTIONS_ENABLED !== "true"
    ) {
      await ctx.db.patch(job._id, {
        status: "canceled",
        updatedAt: args.nowEpochMs,
      });
      await ctx.db.patch(notification._id, {
        status: "canceled",
        updatedAt: args.nowEpochMs,
      });
      return { allowed: false as const };
    }
    const providerId = ctx.db.normalizeId(
      "providerContacts",
      notification.recipientRef.id,
    );
    const provider = providerId === null ? null : await ctx.db.get(providerId);
    const destination =
      notification.channel === "email" ? provider?.email : provider?.phoneE164;
    if (
      provider === null ||
      provider.status !== "active" ||
      provider.careCircleId !== notification.careCircleId ||
      destination === undefined
    ) {
      await ctx.db.patch(job._id, {
        status: "canceled",
        updatedAt: args.nowEpochMs,
      });
      await ctx.db.patch(notification._id, {
        status: "permanent_failure",
        lastErrorCode: "CONTACT_UNVERIFIED",
        updatedAt: args.nowEpochMs,
      });
      return { allowed: false as const };
    }
    await ctx.db.patch(notification._id, {
      status: "sending",
      attemptCount: notification.attemptCount + 1,
      updatedAt: args.nowEpochMs,
    });
    return {
      allowed: true as const,
      notificationId: notification._id,
      channel: notification.channel,
      destination,
      payload: notification.payloadSnapshot,
      payloadHash: notification.payloadHash,
      idempotencyKey: notification.idempotencyKey,
    };
  },
});

/** Commits a provider outcome and schedules only provably safe retries. */
export const completeLease = internalMutation({
  args: {
    jobId: v.id("outboxJobs"),
    leaseTokenHash: v.string(),
    outcome: v.union(
      v.literal("accepted"),
      v.literal("retryable_failure"),
      v.literal("permanent_failure"),
      v.literal("delivery_unknown"),
    ),
    externalMessageId: v.optional(v.string()),
    errorCode: v.optional(v.string()),
    nowEpochMs: v.number(),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (
      job === null ||
      job.status !== "leased" ||
      job.leaseTokenHash !== args.leaseTokenHash
    ) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "The outbox lease is invalid.",
      });
    }
    const notification = await ctx.db.get(job.notificationId);
    if (notification === null)
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Notification is unavailable.",
      });
    const retryIndex = Math.min(job.attemptCount, retryDelays.length - 1);
    const mayRetry =
      args.outcome === "retryable_failure" &&
      notification.channel === "email" &&
      job.attemptCount + 1 < job.maxAttempts;
    await ctx.db.patch(notification._id, {
      status: args.outcome,
      ...(args.externalMessageId === undefined
        ? {}
        : { externalMessageId: args.externalMessageId }),
      ...(args.errorCode === undefined
        ? {}
        : { lastErrorCode: args.errorCode }),
      updatedAt: args.nowEpochMs,
    });
    await ctx.db.patch(
      job._id,
      mayRetry
        ? {
            status: "pending",
            availableAt: args.nowEpochMs + retryDelays[retryIndex]!,
            attemptCount: job.attemptCount + 1,
            leaseTokenHash: undefined,
            leaseExpiresAt: undefined,
            updatedAt: args.nowEpochMs,
          }
        : {
            status: args.outcome === "accepted" ? "completed" : "dead_letter",
            attemptCount: job.attemptCount + 1,
            updatedAt: args.nowEpochMs,
          },
    );
    await ctx.db.insert("deliveryStateEvents", {
      notificationId: notification._id,
      provider:
        process.env.INTEGRATION_MODE === "live"
          ? notification.channel === "email"
            ? "resend"
            : "twilio"
          : "deterministic",
      previousStatus: "sending",
      nextStatus: args.outcome,
      ...(args.externalMessageId === undefined
        ? {}
        : { externalMessageId: args.externalMessageId }),
      metadataRedacted:
        args.errorCode === undefined ? {} : { providerCode: args.errorCode },
      occurredAt: args.nowEpochMs,
      recordedAt: args.nowEpochMs,
    });
    await appendAuditEvent(ctx, {
      careCircleId: notification.careCircleId,
      actor: { kind: "system", opaqueId: "outbox-worker" },
      eventType:
        args.outcome === "accepted"
          ? "notification.accepted"
          : "notification.failed",
      resourceType: "notification",
      resourceId: notification._id,
      ...(notification.actionVersion === undefined
        ? {}
        : { resourceVersion: notification.actionVersion }),
      metadataRedacted: { status: args.outcome, channel: notification.channel },
      createdAt: args.nowEpochMs,
    });
    return { status: args.outcome, retryScheduled: mayRetry };
  },
});
