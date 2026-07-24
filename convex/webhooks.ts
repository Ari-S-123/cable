import { ConvexError, v } from "convex/values";

import { mutation } from "./_generated/server";
import { appendAuditEvent } from "./audit";

const provider = v.union(
  v.literal("workos"),
  v.literal("elevenlabs"),
  v.literal("twilio"),
  v.literal("resend"),
);

/** Atomically reserves a provider event ID for replay protection. */
export const recordReceipt = mutation({
  args: {
    provider,
    eventId: v.string(),
    eventType: v.string(),
    payloadHash: v.string(),
    signatureTimestamp: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("webhookReceipts")
      .withIndex("by_provider_and_event_id", (queryBuilder) =>
        queryBuilder.eq("provider", args.provider).eq("eventId", args.eventId),
      )
      .unique();
    if (existing !== null) return { replay: true, receiptId: existing._id };
    const receiptId = await ctx.db.insert("webhookReceipts", {
      provider: args.provider,
      eventId: args.eventId,
      eventType: args.eventType,
      payloadHash: args.payloadHash,
      ...(args.signatureTimestamp === undefined
        ? {}
        : { signatureTimestamp: args.signatureTimestamp }),
      receivedAt: Date.now(),
      status: "accepted",
    });
    return { replay: false, receiptId };
  },
});

/** Reconciles one WorkOS membership against local tenant and role records. */
export const reconcileWorkOSMembership = mutation({
  args: {
    workosUserId: v.string(),
    workosOrganizationId: v.string(),
    workosMembershipId: v.string(),
    role: v.union(v.literal("elder"), v.literal("caregiver")),
    status: v.union(
      v.literal("active"),
      v.literal("suspended"),
      v.literal("ended"),
    ),
    displayName: v.string(),
    email: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    let user = await ctx.db
      .query("users")
      .withIndex("by_workos_user_id", (queryBuilder) =>
        queryBuilder.eq("workosUserId", args.workosUserId),
      )
      .unique();
    if (user === null) {
      const userId = await ctx.db.insert("users", {
        workosUserId: args.workosUserId,
        displayName: args.displayName.slice(0, 160),
        ...(args.email === undefined
          ? {}
          : { email: args.email.trim().toLocaleLowerCase("en-US") }),
        preferredLocale: "en-US",
        timeZone: "UTC",
        accessibility: {
          textScale: 1,
          highContrast: false,
          reducedMotion: false,
          captions: true,
        },
        createdAt: now,
        updatedAt: now,
      });
      user = await ctx.db.get(userId);
    }
    if (user === null)
      throw new ConvexError({
        code: "TEMPORARILY_UNAVAILABLE",
        message: "User reconciliation failed.",
      });
    let circle = await ctx.db
      .query("careCircles")
      .withIndex("by_workos_organization_id", (queryBuilder) =>
        queryBuilder.eq("workosOrganizationId", args.workosOrganizationId),
      )
      .unique();
    if (circle === null && args.role === "elder") {
      const circleId = await ctx.db.insert("careCircles", {
        workosOrganizationId: args.workosOrganizationId,
        elderUserId: user._id,
        displayName: `${args.displayName}'s care circle`,
        status: "active",
        externalActionsEnabled: false,
        createdAt: now,
        updatedAt: now,
      });
      circle = await ctx.db.get(circleId);
    }
    if (circle === null)
      return {
        reconciled: false,
        reason: "ELDER_MEMBERSHIP_REQUIRED" as const,
      };
    if (args.role === "elder" && circle.elderUserId !== user._id) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "A care circle can have only one elder.",
      });
    }
    const existing = await ctx.db
      .query("memberships")
      .withIndex("by_workos_membership_id", (queryBuilder) =>
        queryBuilder.eq("workosMembershipId", args.workosMembershipId),
      )
      .unique();
    const membershipStatus = args.status;
    if (existing === null) {
      await ctx.db.insert("memberships", {
        careCircleId: circle._id,
        userId: user._id,
        workosMembershipId: args.workosMembershipId,
        role: args.role,
        status: membershipStatus,
        canManageProviderContacts: args.role === "caregiver",
        ...(membershipStatus === "active" ? { joinedAt: now } : {}),
        ...(membershipStatus === "ended" ? { endedAt: now } : {}),
      });
    } else {
      if (
        existing.careCircleId !== circle._id ||
        existing.userId !== user._id ||
        existing.role !== args.role
      ) {
        throw new ConvexError({
          code: "FORBIDDEN",
          message: "Membership identity cannot be reassigned.",
        });
      }
      await ctx.db.patch(existing._id, {
        status: membershipStatus,
        ...(membershipStatus === "ended" ? { endedAt: now } : {}),
      });
    }
    return { reconciled: true, reason: undefined };
  },
});

const deliveryRank: Readonly<Record<string, number>> = {
  queued: 0,
  sending: 1,
  accepted: 2,
  delivered: 3,
  retryable_failure: 2,
  permanent_failure: 3,
  delivery_unknown: 3,
  canceled: 3,
};

/** Applies a verified delivery event without allowing terminal-state regression. */
export const applyDeliveryEvent = mutation({
  args: {
    provider: v.union(v.literal("resend"), v.literal("twilio")),
    providerEventId: v.string(),
    externalMessageId: v.string(),
    nextStatus: v.union(
      v.literal("accepted"),
      v.literal("delivered"),
      v.literal("retryable_failure"),
      v.literal("permanent_failure"),
      v.literal("delivery_unknown"),
    ),
    providerCode: v.optional(v.string()),
    occurredAt: v.number(),
  },
  handler: async (ctx, args) => {
    const duplicate = await ctx.db
      .query("deliveryStateEvents")
      .withIndex("by_provider_event_id", (queryBuilder) =>
        queryBuilder.eq("providerEventId", args.providerEventId),
      )
      .unique();
    if (duplicate !== null) return { duplicate: true, applied: false };
    const notification = await ctx.db
      .query("notifications")
      .withIndex("by_external_message_id", (queryBuilder) =>
        queryBuilder.eq("externalMessageId", args.externalMessageId),
      )
      .unique();
    if (notification === null) return { duplicate: false, applied: false };
    const currentRank = deliveryRank[notification.status] ?? 0;
    const nextRank = deliveryRank[args.nextStatus] ?? 0;
    const applied =
      nextRank >= currentRank && notification.status !== "canceled";
    await ctx.db.insert("deliveryStateEvents", {
      notificationId: notification._id,
      provider: args.provider,
      previousStatus: notification.status,
      nextStatus: args.nextStatus,
      providerEventId: args.providerEventId,
      externalMessageId: args.externalMessageId,
      metadataRedacted:
        args.providerCode === undefined
          ? {}
          : { providerCode: args.providerCode },
      occurredAt: args.occurredAt,
      recordedAt: Date.now(),
    });
    if (applied) {
      await ctx.db.patch(notification._id, {
        status: args.nextStatus,
        ...(args.providerCode === undefined
          ? {}
          : { lastErrorCode: args.providerCode }),
        updatedAt: Date.now(),
      });
      if (
        notification.actionProposalId !== undefined &&
        ["delivered", "permanent_failure", "delivery_unknown"].includes(
          args.nextStatus,
        )
      ) {
        const proposalStatus =
          args.nextStatus === "delivered"
            ? "completed"
            : args.nextStatus === "permanent_failure"
              ? "permanent_failure"
              : "delivery_unknown";
        await ctx.db.patch(notification.actionProposalId, {
          status: proposalStatus,
          updatedAt: args.occurredAt,
        });
      }
      await appendAuditEvent(ctx, {
        careCircleId: notification.careCircleId,
        actor: { kind: "webhook", opaqueId: args.provider },
        eventType:
          args.nextStatus === "delivered"
            ? "notification.delivered"
            : "notification.failed",
        resourceType: "notification",
        resourceId: notification._id,
        ...(notification.actionVersion === undefined
          ? {}
          : { resourceVersion: notification.actionVersion }),
        metadataRedacted: {
          status: args.nextStatus,
          channel: notification.channel,
        },
        createdAt: Date.now(),
      });
    }
    return { duplicate: false, applied };
  },
});
