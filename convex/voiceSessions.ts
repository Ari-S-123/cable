import { ConvexError, v } from "convex/values";

import { internalMutation, mutation } from "./_generated/server";
import { assertCareAuthorization } from "./policy/authorization";

const toolName = v.union(
  v.literal("start_checkin"),
  v.literal("save_private_turn"),
  v.literal("extract_event_draft"),
  v.literal("confirm_event_facts"),
  v.literal("prepare_consent_prompt"),
  v.literal("record_consent_response"),
  v.literal("revoke_consent"),
  v.literal("get_workflow_status"),
  v.literal("transfer_to_caregiver"),
  v.literal("end_checkin"),
);

/** Reserves one short-lived nonce for the currently authenticated elder. */
export const reserve = mutation({
  args: {
    careCircleId: v.id("careCircles"),
    nonceHash: v.string(),
    locale: v.union(v.literal("en-US"), v.literal("hi-IN")),
  },
  handler: async (ctx, args) => {
    const authorization = await assertCareAuthorization(
      ctx,
      args.careCircleId,
      "elder",
    );
    if (!/^[a-f0-9]{64}$/u.test(args.nonceHash)) {
      throw new ConvexError({
        code: "INVALID_REQUEST",
        message: "The voice-session nonce hash is invalid.",
      });
    }
    const duplicate = await ctx.db
      .query("voiceSessionNonces")
      .withIndex("by_nonce_hash", (queryBuilder) =>
        queryBuilder.eq("nonceHash", args.nonceHash),
      )
      .unique();
    if (duplicate !== null) {
      throw new ConvexError({
        code: "INVALID_REQUEST",
        message: "The voice-session nonce is already reserved.",
      });
    }
    const now = Date.now();
    const voiceSessionId = await ctx.db.insert("voiceSessionNonces", {
      nonceHash: args.nonceHash,
      careCircleId: args.careCircleId,
      elderUserId: authorization.user._id,
      locale: args.locale,
      expiresAt: now + 5 * 60 * 1_000,
      createdAt: now,
    });
    return { voiceSessionId, expiresAt: now + 5 * 60 * 1_000 };
  },
});

/** Applies one signed, replay-protected voice tool to its private conversation. */
export const executeTool = internalMutation({
  args: {
    nonceHash: v.string(),
    toolName,
    externalConversationId: v.optional(v.string()),
    correlationId: v.string(),
    text: v.optional(v.string()),
    locale: v.optional(v.union(v.literal("en-US"), v.literal("hi-IN"))),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("voiceSessionNonces")
      .withIndex("by_nonce_hash", (queryBuilder) =>
        queryBuilder.eq("nonceHash", args.nonceHash),
      )
      .unique();
    const now = Date.now();
    if (session === null || session.expiresAt <= now) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "The voice session is invalid or expired.",
      });
    }
    if (
      session.externalConversationId !== undefined &&
      args.externalConversationId !== undefined &&
      session.externalConversationId !== args.externalConversationId
    ) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "The voice conversation binding does not match.",
      });
    }
    let conversation =
      session.conversationId === undefined
        ? null
        : await ctx.db.get(session.conversationId);
    if (args.toolName === "start_checkin" && conversation === null) {
      const conversationId = await ctx.db.insert("conversations", {
        careCircleId: session.careCircleId,
        elderUserId: session.elderUserId,
        channel: "browser_voice",
        ...(args.externalConversationId === undefined
          ? {}
          : { elevenLabsConversationId: args.externalConversationId }),
        locale: args.locale ?? session.locale,
        status: "active",
        visibility: "private",
        startedAt: now,
        retentionExpiresAt: now + 24 * 60 * 60 * 1_000,
      });
      await ctx.db.patch(session._id, {
        conversationId,
        ...(args.externalConversationId === undefined
          ? {}
          : { externalConversationId: args.externalConversationId }),
      });
      conversation = await ctx.db.get(conversationId);
    }
    if (conversation === null || conversation.status !== "active") {
      throw new ConvexError({
        code: "INVALID_REQUEST",
        message: "The private check-in must be started first.",
      });
    }
    if (args.toolName === "save_private_turn") {
      const text = args.text?.trim().normalize("NFC");
      if (text === undefined || text.length === 0 || text.length > 2_000) {
        throw new ConvexError({
          code: "INVALID_REQUEST",
          message: "The private voice turn is invalid.",
        });
      }
      const previous = await ctx.db
        .query("conversationTurns")
        .withIndex("by_conversation_and_sequence", (queryBuilder) =>
          queryBuilder.eq("conversationId", conversation._id),
        )
        .order("desc")
        .first();
      const turnId = await ctx.db.insert("conversationTurns", {
        conversationId: conversation._id,
        careCircleId: session.careCircleId,
        source: "elder",
        normalizedText: text,
        locale: args.locale ?? session.locale,
        sequence: (previous?.sequence ?? 0) + 1,
        createdAt: now,
        retentionExpiresAt: Math.min(
          conversation.retentionExpiresAt,
          now + 24 * 60 * 60 * 1_000,
        ),
      });
      return {
        status: "stored" as const,
        conversationId: conversation._id,
        turnId,
        correlationId: args.correlationId,
      };
    }
    if (args.toolName === "end_checkin") {
      await ctx.db.patch(conversation._id, {
        status: "completed",
        endedAt: now,
        retentionExpiresAt: Math.min(
          conversation.retentionExpiresAt,
          now + 60 * 60 * 1_000,
        ),
      });
      return {
        status: "completed" as const,
        conversationId: conversation._id,
        correlationId: args.correlationId,
      };
    }
    const storedTurns = await ctx.db
      .query("conversationTurns")
      .withIndex("by_conversation_and_sequence", (queryBuilder) =>
        queryBuilder.eq("conversationId", conversation._id),
      )
      .take(100);
    return {
      status:
        args.toolName === "transfer_to_caregiver"
          ? ("offered_not_started" as const)
          : ("accepted" as const),
      conversationId: conversation._id,
      privateTurnCount: storedTurns.length,
      correlationId: args.correlationId,
    };
  },
});
