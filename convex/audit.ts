import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { auditHash } from "./policy/canonicalize";

/** Minimal redacted metadata permitted in append-only audit records. */
export type AuditMetadata = Readonly<{
  status?: string;
  channel?: string;
  correlationId?: string;
}>;

/** Arguments for one material append-only transition. */
export type AppendAuditInput = Readonly<{
  careCircleId: Id<"careCircles">;
  actor: Readonly<{
    kind: "user" | "agent" | "system" | "webhook";
    opaqueId: string;
  }>;
  eventType: string;
  resourceType: string;
  resourceId: string;
  resourceVersion?: number;
  policyDecision?: Readonly<{ code: string; ruleVersion: string }>;
  metadataRedacted?: AuditMetadata;
  createdAt: number;
}>;

/** Appends a chained audit event; this module intentionally exposes no update/delete operation. */
export async function appendAuditEvent(
  ctx: MutationCtx,
  input: AppendAuditInput,
): Promise<Id<"auditEvents">> {
  const previous = await ctx.db
    .query("auditEvents")
    .withIndex("by_circle_and_created_at", (query) =>
      query.eq("careCircleId", input.careCircleId),
    )
    .order("desc")
    .first();
  const previousEventHash = previous?.eventHash;
  const eventHash = await auditHash({
    careCircleId: input.careCircleId,
    actor: input.actor,
    eventType: input.eventType,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    resourceVersion: input.resourceVersion,
    policyDecision: input.policyDecision,
    metadataRedacted: input.metadataRedacted ?? {},
    previousEventHash,
    createdAt: input.createdAt,
  });
  return ctx.db.insert("auditEvents", {
    careCircleId: input.careCircleId,
    actor: input.actor,
    eventType: input.eventType,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    ...(input.resourceVersion === undefined
      ? {}
      : { resourceVersion: input.resourceVersion }),
    ...(input.policyDecision === undefined
      ? {}
      : { policyDecision: input.policyDecision }),
    metadataRedacted: input.metadataRedacted ?? {},
    ...(previousEventHash === undefined ? {} : { previousEventHash }),
    eventHash,
    createdAt: input.createdAt,
  });
}
