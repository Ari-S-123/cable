import { internalMutation } from "./_generated/server";
import { appendAuditEvent } from "./audit";

const retainedWebhookMs = 7 * 24 * 60 * 60 * 1_000;

/** Expires consent, removes temporary data, and recovers abandoned leases in bounded batches. */
export const run = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const expiringConsents = await ctx.db
      .query("consents")
      .withIndex("by_expiry", (queryBuilder) =>
        queryBuilder.lte("expiresAt", now),
      )
      .take(100);
    let expiredConsents = 0;
    let canceledNotifications = 0;
    for (const consent of expiringConsents) {
      if (!["requested", "granted"].includes(consent.status)) continue;
      await ctx.db.patch(consent._id, { status: "expired" });
      expiredConsents += 1;
      const proposals = await ctx.db
        .query("actionProposals")
        .withIndex("by_event_and_status", (queryBuilder) =>
          queryBuilder.eq("careEventId", consent.careEventId),
        )
        .take(100);
      for (const proposal of proposals) {
        if (
          [
            "completed",
            "rejected",
            "invalidated",
            "permanent_failure",
            "delivery_unknown",
          ].includes(proposal.status)
        ) {
          continue;
        }
        const version = await ctx.db
          .query("actionProposalVersions")
          .withIndex("by_proposal_and_version", (queryBuilder) =>
            queryBuilder
              .eq("actionProposalId", proposal._id)
              .eq("version", proposal.currentVersion),
          )
          .unique();
        if (version?.consentId === consent._id) {
          await ctx.db.patch(proposal._id, {
            status: "invalidated",
            updatedAt: now,
          });
        }
      }
      const notifications = await ctx.db
        .query("notifications")
        .filter((queryBuilder) =>
          queryBuilder.eq(queryBuilder.field("consentId"), consent._id),
        )
        .take(100);
      for (const notification of notifications) {
        if (
          !["queued", "sending", "retryable_failure"].includes(
            notification.status,
          )
        ) {
          continue;
        }
        await ctx.db.patch(notification._id, {
          status: "canceled",
          updatedAt: now,
        });
        const job = await ctx.db
          .query("outboxJobs")
          .withIndex("by_notification_id", (queryBuilder) =>
            queryBuilder.eq("notificationId", notification._id),
          )
          .unique();
        if (job !== null && job.status !== "completed") {
          await ctx.db.patch(job._id, { status: "canceled", updatedAt: now });
        }
        canceledNotifications += 1;
      }
      await appendAuditEvent(ctx, {
        careCircleId: consent.careCircleId,
        actor: { kind: "system", opaqueId: "maintenance" },
        eventType: "consent.expired",
        resourceType: "consent",
        resourceId: consent._id,
        resourceVersion: consent.eventVersion,
        metadataRedacted: { status: "expired" },
        createdAt: now,
      });
    }

    const expiredTurns = await ctx.db
      .query("conversationTurns")
      .withIndex("by_retention_expiry", (queryBuilder) =>
        queryBuilder.lte("retentionExpiresAt", now),
      )
      .take(200);
    for (const turn of expiredTurns) await ctx.db.delete(turn._id);

    const expiredBuckets = await ctx.db
      .query("rateLimitBuckets")
      .withIndex("by_expiry", (queryBuilder) =>
        queryBuilder.lte("expiresAt", now),
      )
      .take(200);
    for (const bucket of expiredBuckets) await ctx.db.delete(bucket._id);

    const expiredVoiceSessions = await ctx.db
      .query("voiceSessionNonces")
      .withIndex("by_expiry", (queryBuilder) =>
        queryBuilder.lte("expiresAt", now),
      )
      .take(200);
    for (const session of expiredVoiceSessions)
      await ctx.db.delete(session._id);

    const oldReceipts = await ctx.db
      .query("webhookReceipts")
      .withIndex("by_received_at", (queryBuilder) =>
        queryBuilder.lt("receivedAt", now - retainedWebhookMs),
      )
      .take(200);
    for (const receipt of oldReceipts) await ctx.db.delete(receipt._id);

    const leasedJobs = await ctx.db
      .query("outboxJobs")
      .filter((queryBuilder) =>
        queryBuilder.eq(queryBuilder.field("status"), "leased"),
      )
      .take(200);
    let recoveredLeases = 0;
    for (const job of leasedJobs) {
      if (job.leaseExpiresAt === undefined || job.leaseExpiresAt > now)
        continue;
      const notification = await ctx.db.get(job.notificationId);
      const recoverable =
        notification !== null &&
        notification.status === "queued" &&
        notification.channel === "email" &&
        job.attemptCount < job.maxAttempts;
      await ctx.db.patch(job._id, {
        status: recoverable ? "pending" : "dead_letter",
        ...(recoverable ? { availableAt: now } : {}),
        leaseTokenHash: undefined,
        leaseExpiresAt: undefined,
        updatedAt: now,
      });
      if (recoverable) recoveredLeases += 1;
      if (!recoverable && notification !== null) {
        await ctx.db.patch(notification._id, {
          status:
            notification.channel === "sms"
              ? "delivery_unknown"
              : "permanent_failure",
          lastErrorCode: "LEASE_EXPIRED",
          updatedAt: now,
        });
      }
    }

    return {
      expiredConsents,
      canceledNotifications,
      deletedTurns: expiredTurns.length,
      deletedRateLimitBuckets: expiredBuckets.length,
      deletedVoiceSessions: expiredVoiceSessions.length,
      deletedWebhookReceipts: oldReceipts.length,
      recoveredLeases,
    };
  },
});
