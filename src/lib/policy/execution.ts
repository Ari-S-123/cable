import type {
  ActionType,
  ExecutionDecision,
  PolicyEnvelope,
} from "@/lib/contracts";

/** Current completed idempotency reservation state. */
export type IdempotencyState = "unused" | "reserved" | "completed";

/** Server-only facts required by the final authoritative execution gate. */
export type ExecutionEvaluationInput = Readonly<{
  authenticated: boolean;
  envelope: PolicyEnvelope;
  actionExpiresAt: number;
  validation:
    | Readonly<{
        decision: "pass" | "fail";
        actionVersion: number;
        payloadHash: string;
        validatorHash: string;
        expiresAt: number;
      }>
    | undefined;
  idempotencyState: IdempotencyState;
  idempotencyKey: string;
  hindiConsent: boolean;
  hindiTemplateApproved: boolean;
}>;

const allowListedActions: ReadonlySet<ActionType> = new Set([
  "send_provider_email",
  "send_provider_sms",
  "request_caregiver_call",
  "retry_checkin",
  "mark_resolved",
]);

/** Produces a blocked result with the standard manual-copy fallback. */
function blocked(
  reason: Extract<ExecutionDecision, { allowed: false }>["reason"],
): ExecutionDecision {
  return { allowed: false, reason, manualFallbackAllowed: true };
}

/**
 * Rechecks every mutable authorization fact immediately before provider I/O.
 *
 * Daytona is defense in depth; this function remains the authoritative gate.
 */
export function evaluateExecution(
  input: ExecutionEvaluationInput,
): ExecutionDecision {
  const { envelope } = input;
  if (!input.authenticated) return blocked("UNAUTHENTICATED");
  if (!envelope.activeMembership) return blocked("INACTIVE_RELATIONSHIP");
  if (!envelope.caregiverAuthorized) return blocked("ROLE_NOT_AUTHORIZED");
  if (!allowListedActions.has(envelope.actionType))
    return blocked("ACTION_NOT_ALLOW_LISTED");
  if (!envelope.latestActionVersion) return blocked("STALE_ACTION_VERSION");
  if (input.actionExpiresAt <= envelope.nowEpochMs)
    return blocked("ACTION_EXPIRED");
  if (envelope.consent.status !== "granted")
    return blocked("CONSENT_NOT_GRANTED");
  if (envelope.consent.expiresAt <= envelope.nowEpochMs)
    return blocked("CONSENT_EXPIRED");
  if (
    envelope.eventVersion !== envelope.consent.eventVersion ||
    envelope.consent.outboundPayloadHash !== envelope.payloadHash
  ) {
    return blocked("CONSENT_MISMATCH");
  }
  if (envelope.approval.actionVersion !== envelope.actionVersion) {
    return blocked("APPROVAL_MISMATCH");
  }
  if (envelope.approval.payloadHash !== envelope.payloadHash) {
    return blocked("APPROVAL_MISMATCH");
  }
  if (!envelope.recipient.verified) return blocked("RECIPIENT_NOT_VERIFIED");
  if (
    envelope.recipient.opaqueId !== envelope.consent.recipientOpaqueId ||
    !envelope.consent.channels.includes(envelope.recipient.channel)
  ) {
    return blocked("CHANNEL_NOT_COVERED");
  }
  if (input.validation === undefined || input.validation.decision !== "pass") {
    return blocked("POLICY_VALIDATION_MISSING");
  }
  if (input.validation.expiresAt <= envelope.nowEpochMs) {
    return blocked("POLICY_VALIDATION_STALE");
  }
  if (
    input.validation.actionVersion !== envelope.actionVersion ||
    input.validation.payloadHash !== envelope.payloadHash ||
    input.validation.validatorHash !== envelope.validatorHash
  ) {
    return blocked("POLICY_HASH_MISMATCH");
  }
  if (input.idempotencyState === "completed")
    return blocked("DUPLICATE_COMPLETED");
  if (!envelope.globalExternalActionsEnabled)
    return blocked("GLOBAL_KILL_SWITCH");
  if (!envelope.circleExternalActionsEnabled)
    return blocked("CIRCLE_KILL_SWITCH");
  if (input.hindiConsent && !input.hindiTemplateApproved) {
    return blocked("HINDI_TEMPLATE_NOT_APPROVED");
  }
  return {
    allowed: true,
    idempotencyKey: input.idempotencyKey,
    payloadHash: envelope.payloadHash,
  };
}

/** Creates the stable idempotency key reserved before notification enqueue. */
export function createIdempotencyKey(
  input: Readonly<{
    environment: string;
    actionProposalId: string;
    actionVersion: number;
    channel: string;
    payloadHash: string;
  }>,
): string {
  const segments = [
    "cable",
    input.environment,
    input.actionProposalId,
    String(input.actionVersion),
    input.channel,
    input.payloadHash,
  ];
  if (segments.some((segment) => !/^[a-zA-Z0-9_-]+$/u.test(segment))) {
    throw new Error("Idempotency key segments contain unsupported characters");
  }
  const key = segments.join(":");
  if (key.length > 255)
    throw new Error("Idempotency key exceeds 255 characters");
  return key;
}
