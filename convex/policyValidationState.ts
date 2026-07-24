import { ConvexError, v } from "convex/values";

import { internalMutation, internalQuery } from "./_generated/server";
import { appendAuditEvent } from "./audit";
import {
  assertCareAuthorization,
  assertResourceOwnership,
} from "./policy/authorization";

/** Builds a direct-identifier-free envelope from current authoritative records. */
export const getAuthoritativeEnvelope = internalQuery({
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
    const version = await ctx.db
      .query("actionProposalVersions")
      .withIndex("by_proposal_and_version", (queryBuilder) =>
        queryBuilder
          .eq("actionProposalId", proposal._id)
          .eq("version", args.expectedVersion),
      )
      .unique();
    if (
      proposal.status !== "approved" ||
      proposal.currentVersion !== args.expectedVersion ||
      version === null ||
      version.payloadHash !== args.expectedPayloadHash
    ) {
      throw new ConvexError({
        code: "STALE_VERSION",
        message: "The approved action is no longer current.",
      });
    }
    const [consent, approval] = await Promise.all([
      ctx.db.get(version.consentId),
      ctx.db
        .query("approvals")
        .withIndex("by_action_and_version", (queryBuilder) =>
          queryBuilder
            .eq("actionProposalId", proposal._id)
            .eq("actionVersion", version.version),
        )
        .order("desc")
        .first(),
    ]);
    if (
      consent === null ||
      consent.status !== "granted" ||
      consent.expiresAt === undefined ||
      approval === null ||
      approval.decision !== "approved" ||
      approval.invalidatedAt !== undefined
    ) {
      throw new ConvexError({
        code: "POLICY_VALIDATION_FAILED",
        message: "Current consent and approval are required.",
      });
    }
    const providerId =
      version.recipientRef.kind === "provider_contact"
        ? ctx.db.normalizeId("providerContacts", version.recipientRef.id)
        : null;
    const provider = providerId === null ? null : await ctx.db.get(providerId);
    const normalizedChannel =
      version.channel === "email" || version.channel === "sms"
        ? version.channel
        : undefined;
    const recipientCovered = consent.recipientRefs.some(
      (recipient) =>
        recipient.kind === version.recipientRef.kind &&
        recipient.id === version.recipientRef.id,
    );
    const recipientVerified =
      provider !== null &&
      provider.careCircleId === args.careCircleId &&
      provider.status === "active" &&
      normalizedChannel !== undefined &&
      provider.verifiedChannels.includes(normalizedChannel);

    return {
      policyVersion: "2026-07-24.1" as const,
      actionId: proposal._id,
      actionVersion: version.version,
      eventVersion: version.eventVersion,
      actionType: version.actionType,
      payloadHash: version.payloadHash,
      consent: {
        status: "granted" as const,
        eventVersion: consent.eventVersion,
        canonicalPayloadHash: consent.canonicalPayloadHash,
        outboundPayloadHash: consent.outboundPayloadHash,
        recipientOpaqueId: recipientCovered
          ? version.recipientRef.id
          : "recipient-not-covered",
        channels: consent.channels,
        purpose: consent.purpose,
        expiresAt: consent.expiresAt,
      },
      approval: {
        actionVersion: approval.actionVersion,
        payloadHash: approval.payloadHash,
        caregiverOpaqueId: approval.caregiverUserId,
        approvedAt: approval.decidedAt,
      },
      recipient: {
        opaqueId: version.recipientRef.id,
        channel: version.channel,
        verified: recipientVerified,
      },
      activeMembership: authorization.membership.status === "active",
      caregiverAuthorized: authorization.role === "caregiver",
      latestActionVersion: proposal.currentVersion === version.version,
      globalExternalActionsEnabled:
        process.env.EXTERNAL_ACTIONS_ENABLED === "true",
      circleExternalActionsEnabled: authorization.circle.externalActionsEnabled,
      nowEpochMs: Date.now(),
    };
  },
});

/** Stores one bounded validation result after rechecking its immutable action binding. */
export const recordResult = internalMutation({
  args: {
    careCircleId: v.id("careCircles"),
    actionProposalId: v.id("actionProposals"),
    actionVersion: v.number(),
    payloadHash: v.string(),
    validatorVersion: v.string(),
    validatorHash: v.string(),
    daytonaSandboxIdHash: v.string(),
    decision: v.union(v.literal("pass"), v.literal("fail")),
    failedRules: v.array(v.string()),
    validatedAt: v.number(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const proposal = await ctx.db.get(args.actionProposalId);
    const version =
      proposal === null
        ? null
        : await ctx.db
            .query("actionProposalVersions")
            .withIndex("by_proposal_and_version", (queryBuilder) =>
              queryBuilder
                .eq("actionProposalId", proposal._id)
                .eq("version", args.actionVersion),
            )
            .unique();
    if (
      proposal === null ||
      proposal.careCircleId !== args.careCircleId ||
      proposal.currentVersion !== args.actionVersion ||
      proposal.status !== "approved" ||
      version === null ||
      version.payloadHash !== args.payloadHash
    ) {
      throw new ConvexError({
        code: "STALE_VERSION",
        message: "Validation could not be bound to the current action.",
      });
    }
    const validationId = await ctx.db.insert("policyValidations", {
      actionProposalId: args.actionProposalId,
      actionVersion: args.actionVersion,
      payloadHash: args.payloadHash,
      validatorVersion: args.validatorVersion,
      validatorHash: args.validatorHash,
      daytonaSandboxIdHash: args.daytonaSandboxIdHash,
      decision: args.decision,
      failedRules: args.failedRules.slice(0, 30),
      validatedAt: args.validatedAt,
      expiresAt: args.expiresAt,
    });
    await appendAuditEvent(ctx, {
      careCircleId: args.careCircleId,
      actor: { kind: "system", opaqueId: "policy-validator" },
      eventType: `policy.${args.decision}`,
      resourceType: "policyValidation",
      resourceId: validationId,
      resourceVersion: args.actionVersion,
      policyDecision: {
        code: args.decision,
        ruleVersion: args.validatorVersion,
      },
      metadataRedacted: { status: args.decision },
      createdAt: args.validatedAt,
    });
    return { validationId, decision: args.decision };
  },
});
