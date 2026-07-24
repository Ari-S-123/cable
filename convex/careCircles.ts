import { ConvexError, v } from "convex/values";
import { z } from "zod";

import { mutation, query } from "./_generated/server";
import { appendAuditEvent } from "./audit";
import { assertCareAuthorization } from "./policy/authorization";

const CurrentIdentitySchema = z
  .object({
    subject: z.string().min(1),
    org_id: z.string().min(1).optional(),
    organization_id: z.string().min(1).optional(),
    role: z.enum(["elder", "caregiver"]),
  })
  .passthrough();

/** Returns the minimum active care context reconciled against WorkOS claims. */
export const getCareContext = query({
  args: { careCircleId: v.id("careCircles") },
  handler: async (ctx, args) => {
    const authorization = await assertCareAuthorization(ctx, args.careCircleId);
    return {
      careCircleId: authorization.circle._id,
      displayName: authorization.circle.displayName,
      externalActionsEnabled: authorization.circle.externalActionsEnabled,
      user: {
        id: authorization.user._id,
        displayName: authorization.user.displayName,
        role: authorization.role,
        preferredLocale: authorization.user.preferredLocale,
        timeZone: authorization.user.timeZone,
      },
    };
  },
});

/** Resolves the caller's active care circle without accepting a client-supplied resource ID. */
export const getCurrentCareContext = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    const claims = CurrentIdentitySchema.safeParse(identity);
    const organizationId = claims.success
      ? (claims.data.org_id ?? claims.data.organization_id)
      : undefined;
    if (!claims.success || organizationId === undefined) {
      throw new ConvexError({
        code: "AUTH_REQUIRED",
        message: "An active care-circle session is required.",
      });
    }
    const [user, circle] = await Promise.all([
      ctx.db
        .query("users")
        .withIndex("by_workos_user_id", (queryBuilder) =>
          queryBuilder.eq("workosUserId", claims.data.subject),
        )
        .unique(),
      ctx.db
        .query("careCircles")
        .withIndex("by_workos_organization_id", (queryBuilder) =>
          queryBuilder.eq("workosOrganizationId", organizationId),
        )
        .unique(),
    ]);
    if (user === null || circle === null) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "The care-circle request was denied.",
      });
    }
    const authorization = await assertCareAuthorization(ctx, circle._id);
    return {
      careCircleId: authorization.circle._id,
      displayName: authorization.circle.displayName,
      externalActionsEnabled: authorization.circle.externalActionsEnabled,
      user: {
        id: authorization.user._id,
        displayName: authorization.user.displayName,
        role: authorization.role,
        preferredLocale: authorization.user.preferredLocale,
        timeZone: authorization.user.timeZone,
      },
    };
  },
});

/** Changes the care-circle external-action kill switch with manager authorization. */
export const setExternalActionsEnabled = mutation({
  args: {
    careCircleId: v.id("careCircles"),
    enabled: v.boolean(),
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
        message: "Care-circle action controls are not permitted.",
      });
    }
    const now = Date.now();
    await ctx.db.patch(args.careCircleId, {
      externalActionsEnabled: args.enabled,
      updatedAt: now,
    });
    await appendAuditEvent(ctx, {
      careCircleId: args.careCircleId,
      actor: { kind: "user", opaqueId: authorization.user._id },
      eventType: "care_circle.external_actions_changed",
      resourceType: "careCircle",
      resourceId: args.careCircleId,
      metadataRedacted: { status: args.enabled ? "enabled" : "disabled" },
      createdAt: now,
    });
    return { enabled: args.enabled };
  },
});
