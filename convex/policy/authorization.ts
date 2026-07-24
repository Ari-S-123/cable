import { ConvexError } from "convex/values";
import { z } from "zod";

import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

const ClaimsSchema = z
  .object({
    subject: z.string().min(1),
    org_id: z.string().min(1).optional(),
    organization_id: z.string().min(1).optional(),
    role: z.enum(["elder", "caregiver"]),
  })
  .passthrough();

/** Fully reconciled WorkOS and Convex authorization context. */
export type CareAuthorization = Readonly<{
  user: Doc<"users">;
  circle: Doc<"careCircles">;
  membership: Doc<"memberships">;
  role: "elder" | "caregiver";
}>;

/** Throws a generic denial without exposing whether a cross-tenant resource exists. */
function forbidden(): never {
  throw new ConvexError({
    code: "FORBIDDEN",
    message: "You are not authorized for this care-circle operation.",
  });
}

/**
 * Reconciles the JWT subject, organization, role, local membership, and circle.
 * Client-supplied identities and roles are never accepted.
 */
export async function assertCareAuthorization(
  ctx: QueryCtx | MutationCtx,
  careCircleId: Id<"careCircles">,
  expectedRole?: "elder" | "caregiver",
): Promise<CareAuthorization> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) {
    throw new ConvexError({
      code: "AUTH_REQUIRED",
      message: "Authentication is required.",
    });
  }
  const parsedClaims = ClaimsSchema.safeParse(identity);
  if (!parsedClaims.success) return forbidden();
  const claims = parsedClaims.data;
  const organizationId = claims.org_id ?? claims.organization_id;
  if (organizationId === undefined) return forbidden();

  const user = await ctx.db
    .query("users")
    .withIndex("by_workos_user_id", (query) =>
      query.eq("workosUserId", claims.subject),
    )
    .unique();
  const circle = await ctx.db.get(careCircleId);
  if (
    user === null ||
    circle === null ||
    circle.status !== "active" ||
    circle.workosOrganizationId !== organizationId
  ) {
    return forbidden();
  }
  const membership = await ctx.db
    .query("memberships")
    .withIndex("by_circle_and_user", (query) =>
      query.eq("careCircleId", careCircleId).eq("userId", user._id),
    )
    .unique();
  if (
    membership === null ||
    membership.status !== "active" ||
    membership.role !== claims.role ||
    (expectedRole !== undefined && membership.role !== expectedRole)
  ) {
    return forbidden();
  }
  return { user, circle, membership, role: membership.role };
}

/** Confirms that a resource belongs to the already-authorized care circle. */
export function assertResourceOwnership(
  resourceCircleId: Id<"careCircles">,
  authorizedCircleId: Id<"careCircles">,
): void {
  if (resourceCircleId !== authorizedCircleId) forbidden();
}
