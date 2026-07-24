import { ConvexError, v } from "convex/values";

import { mutation } from "./_generated/server";
import { appendAuditEvent } from "./audit";
import { assertCareAuthorization } from "./policy/authorization";

/** Updates the authenticated member's locale, timezone, and accessibility preferences. */
export const updatePreferences = mutation({
  args: {
    careCircleId: v.id("careCircles"),
    preferredLocale: v.union(v.literal("en-US"), v.literal("hi-IN")),
    timeZone: v.string(),
    accessibility: v.object({
      textScale: v.number(),
      highContrast: v.boolean(),
      reducedMotion: v.boolean(),
      captions: v.boolean(),
    }),
  },
  handler: async (ctx, args) => {
    const authorization = await assertCareAuthorization(ctx, args.careCircleId);
    let validTimeZone = false;
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: args.timeZone }).format();
      validTimeZone = true;
    } catch {
      validTimeZone = false;
    }
    if (
      !validTimeZone ||
      args.timeZone.length > 100 ||
      !Number.isFinite(args.accessibility.textScale) ||
      args.accessibility.textScale < 1 ||
      args.accessibility.textScale > 2
    ) {
      throw new ConvexError({
        code: "INVALID_REQUEST",
        message: "The accessibility preferences are invalid.",
      });
    }
    const now = Date.now();
    await ctx.db.patch(authorization.user._id, {
      preferredLocale: args.preferredLocale,
      timeZone: args.timeZone,
      accessibility: args.accessibility,
      updatedAt: now,
    });
    await appendAuditEvent(ctx, {
      careCircleId: args.careCircleId,
      actor: { kind: "user", opaqueId: authorization.user._id },
      eventType: "user.preferences_updated",
      resourceType: "user",
      resourceId: authorization.user._id,
      metadataRedacted: { status: "updated" },
      createdAt: now,
    });
    return { updatedAt: now };
  },
});
