import { z } from "zod";

import {
  ActionTypeSchema,
  DisclosureChannelSchema,
  PurposeSchema,
} from "@/lib/contracts/common";

/** Version of the deterministic policy envelope understood by this release. */
export const POLICY_VERSION = "2026-07-24.1" as const;

/** Credential-free input passed to isolated policy validation. */
export const PolicyEnvelopeSchema = z
  .object({
    policyVersion: z.literal(POLICY_VERSION),
    actionId: z.string().min(1).max(200),
    actionVersion: z.number().int().positive(),
    eventVersion: z.number().int().positive(),
    actionType: ActionTypeSchema,
    payloadHash: z.string().regex(/^[a-f0-9]{64}$/u),
    consent: z
      .object({
        status: z.literal("granted"),
        eventVersion: z.number().int().positive(),
        canonicalPayloadHash: z.string().regex(/^[a-f0-9]{64}$/u),
        outboundPayloadHash: z.string().regex(/^[a-f0-9]{64}$/u),
        recipientOpaqueId: z.string().min(1).max(200),
        channels: z.array(DisclosureChannelSchema).min(1).max(4),
        purpose: PurposeSchema,
        expiresAt: z.number().int().positive(),
      })
      .strict(),
    approval: z
      .object({
        actionVersion: z.number().int().positive(),
        payloadHash: z.string().regex(/^[a-f0-9]{64}$/u),
        caregiverOpaqueId: z.string().min(1).max(200),
        approvedAt: z.number().int().positive(),
      })
      .strict(),
    recipient: z
      .object({
        opaqueId: z.string().min(1).max(200),
        channel: DisclosureChannelSchema,
        verified: z.boolean(),
      })
      .strict(),
    activeMembership: z.boolean(),
    caregiverAuthorized: z.boolean(),
    latestActionVersion: z.boolean(),
    globalExternalActionsEnabled: z.boolean(),
    circleExternalActionsEnabled: z.boolean(),
    validatorHash: z.string().regex(/^[a-f0-9]{64}$/u),
    nowEpochMs: z.number().int().nonnegative(),
  })
  .strict();

/** A validated, credential-free policy envelope. */
export type PolicyEnvelope = z.infer<typeof PolicyEnvelopeSchema>;

/** Exhaustive disclosure denial reasons. */
export const DisclosureFailureCodeSchema = z.enum([
  "UNAUTHENTICATED",
  "INACTIVE_RELATIONSHIP",
  "NO_CONSENT",
  "CONSENT_EXPIRED",
  "CONSENT_REVOKED",
  "RECIPIENT_NOT_COVERED",
  "CHANNEL_NOT_COVERED",
  "PURPOSE_NOT_COVERED",
  "CONTENT_MISMATCH",
  "TRANSLATION_MISMATCH",
]);

/** Deterministic result of evaluating one detail-bearing disclosure. */
export const DisclosureDecisionSchema = z.discriminatedUnion("allowed", [
  z
    .object({
      allowed: z.literal(true),
      consentId: z.string().min(1),
      contentHash: z.string().regex(/^[a-f0-9]{64}$/u),
    })
    .strict(),
  z
    .object({
      allowed: z.literal(false),
      reason: DisclosureFailureCodeSchema,
    })
    .strict(),
]);

/** A disclosure policy decision. */
export type DisclosureDecision = z.infer<typeof DisclosureDecisionSchema>;

/** Exhaustive side-effect denial reasons. */
export const ExecutionFailureCodeSchema = z.enum([
  "UNAUTHENTICATED",
  "INACTIVE_RELATIONSHIP",
  "ROLE_NOT_AUTHORIZED",
  "ACTION_NOT_ALLOW_LISTED",
  "STALE_ACTION_VERSION",
  "ACTION_EXPIRED",
  "CONSENT_NOT_GRANTED",
  "CONSENT_EXPIRED",
  "CONSENT_MISMATCH",
  "APPROVAL_MISSING",
  "APPROVAL_MISMATCH",
  "RECIPIENT_NOT_VERIFIED",
  "CHANNEL_NOT_COVERED",
  "POLICY_VALIDATION_MISSING",
  "POLICY_VALIDATION_STALE",
  "POLICY_HASH_MISMATCH",
  "DUPLICATE_COMPLETED",
  "GLOBAL_KILL_SWITCH",
  "CIRCLE_KILL_SWITCH",
  "HINDI_TEMPLATE_NOT_APPROVED",
]);

/** Deterministic result of the final authoritative execution gate. */
export const ExecutionDecisionSchema = z.discriminatedUnion("allowed", [
  z
    .object({
      allowed: z.literal(true),
      idempotencyKey: z.string().min(1).max(255),
      payloadHash: z.string().regex(/^[a-f0-9]{64}$/u),
    })
    .strict(),
  z
    .object({
      allowed: z.literal(false),
      reason: ExecutionFailureCodeSchema,
      manualFallbackAllowed: z.boolean(),
    })
    .strict(),
]);

/** An execution policy decision. */
export type ExecutionDecision = z.infer<typeof ExecutionDecisionSchema>;

/** One failed policy rule returned by the isolated validator. */
export const PolicyFailureSchema = z
  .object({
    ruleId: z.string().regex(/^CAB-[A-Z]+-[0-9]{3}$/u),
    publicMessage: z.string().min(1).max(300),
  })
  .strict();

/** Bounded output from deterministic policy validation. */
export const PolicyValidationResultSchema = z
  .object({
    validatorVersion: z.string().min(1).max(100),
    validatorHash: z.string().regex(/^[a-f0-9]{64}$/u),
    decision: z.enum(["pass", "fail"]),
    failures: z.array(PolicyFailureSchema).max(30),
    validatedAt: z.number().int().positive(),
    expiresAt: z.number().int().positive(),
  })
  .strict();

/** A deterministic policy validation result. */
export type PolicyValidationResult = z.infer<
  typeof PolicyValidationResultSchema
>;
