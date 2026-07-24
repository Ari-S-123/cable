import { ConvexError, v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { appendAuditEvent } from "./audit";
import { assertCareAuthorization } from "./policy/authorization";

/** Returns current check-in schedules without care-event or transcript content. */
export const listSchedules = query({
  args: { careCircleId: v.id("careCircles") },
  handler: async (ctx, args) => {
    await assertCareAuthorization(ctx, args.careCircleId);
    return ctx.db
      .query("checkinSchedules")
      .filter((queryBuilder) =>
        queryBuilder.eq(queryBuilder.field("careCircleId"), args.careCircleId),
      )
      .take(100);
  },
});

/** Creates a bounded check-in schedule for the care circle's elder. */
export const createSchedule = mutation({
  args: {
    careCircleId: v.id("careCircles"),
    locale: v.union(v.literal("en-US"), v.literal("hi-IN")),
    timeZone: v.string(),
    localTime: v.string(),
    recurrence: v.union(
      v.literal("once"),
      v.literal("daily"),
      v.literal("weekly"),
    ),
    nextRunAt: v.number(),
  },
  handler: async (ctx, args) => {
    const authorization = await assertCareAuthorization(
      ctx,
      args.careCircleId,
      "caregiver",
    );
    let validTimeZone = false;
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: args.timeZone }).format();
      validTimeZone = true;
    } catch {
      validTimeZone = false;
    }
    if (
      !validTimeZone ||
      !/^([01]\d|2[0-3]):[0-5]\d$/u.test(args.localTime) ||
      !Number.isSafeInteger(args.nextRunAt) ||
      args.nextRunAt <= Date.now() ||
      args.nextRunAt > Date.now() + 366 * 24 * 60 * 60 * 1_000
    ) {
      throw new ConvexError({
        code: "INVALID_REQUEST",
        message: "The check-in schedule is invalid.",
      });
    }
    const now = Date.now();
    const scheduleId = await ctx.db.insert("checkinSchedules", {
      careCircleId: args.careCircleId,
      elderUserId: authorization.circle.elderUserId,
      createdByUserId: authorization.user._id,
      locale: args.locale,
      timeZone: args.timeZone,
      localTime: args.localTime,
      recurrence: args.recurrence,
      nextRunAt: args.nextRunAt,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    await appendAuditEvent(ctx, {
      careCircleId: args.careCircleId,
      actor: { kind: "user", opaqueId: authorization.user._id },
      eventType: "checkin_schedule.created",
      resourceType: "checkinSchedule",
      resourceId: scheduleId,
      metadataRedacted: { status: "active" },
      createdAt: now,
    });
    return { scheduleId };
  },
});

/** Pauses or reactivates one owned check-in schedule. */
export const setScheduleStatus = mutation({
  args: {
    careCircleId: v.id("careCircles"),
    scheduleId: v.id("checkinSchedules"),
    status: v.union(v.literal("active"), v.literal("paused")),
  },
  handler: async (ctx, args) => {
    const authorization = await assertCareAuthorization(
      ctx,
      args.careCircleId,
      "caregiver",
    );
    const schedule = await ctx.db.get(args.scheduleId);
    if (schedule === null || schedule.careCircleId !== args.careCircleId) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Check-in schedule is unavailable.",
      });
    }
    const now = Date.now();
    await ctx.db.patch(schedule._id, { status: args.status, updatedAt: now });
    await appendAuditEvent(ctx, {
      careCircleId: args.careCircleId,
      actor: { kind: "user", opaqueId: authorization.user._id },
      eventType: `checkin_schedule.${args.status}`,
      resourceType: "checkinSchedule",
      resourceId: schedule._id,
      metadataRedacted: { status: args.status },
      createdAt: now,
    });
    return { status: args.status };
  },
});
