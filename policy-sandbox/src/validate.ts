import { createHash } from "node:crypto";

import {
  PolicyEnvelopeSchema,
  type PolicyValidationResult,
} from "../../src/lib/contracts/policy";
import { evaluateInvariants } from "./invariants";
import { simulateAdapter } from "./simulated-adapters";

/** Stable validator release identifier stored with every result. */
export const VALIDATOR_VERSION = "cable-policy-2026-07-24.1" as const;

/**
 * Self-contained JavaScript uploaded to a network-blocked Daytona sandbox.
 * It accepts only one local JSON file path and prints one bounded JSON result.
 */
export const POLICY_VALIDATOR_SOURCE = String.raw`
import { readFileSync } from "node:fs";
const envelope = JSON.parse(readFileSync(process.argv[2], "utf8"));
const failures = [];
const fail = (ruleId, publicMessage) => failures.push({ ruleId, publicMessage });
const allowed = new Set(["send_provider_email", "send_provider_sms", "request_caregiver_call", "retry_checkin", "mark_resolved"]);
const forbidden = new Set(["name", "email", "phone", "phoneE164", "transcript", "message", "summary", "apiKey", "secret", "token"]);
const walk = (value) => {
  if (Array.isArray(value)) return value.forEach(walk);
  if (value === null || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (forbidden.has(key)) fail("CAB-DAT-001", "The policy envelope contains prohibited data.");
    walk(child);
  }
};
if (Buffer.byteLength(JSON.stringify(envelope), "utf8") > 8192) fail("CAB-DAT-002", "The policy envelope exceeds the allowed size.");
walk(envelope);
if (!allowed.has(envelope.actionType)) fail("CAB-ACT-001", "The requested action is not supported.");
if (envelope.consent?.status !== "granted" || envelope.consent.expiresAt <= envelope.nowEpochMs) fail("CAB-CON-001", "The disclosure permission is not active.");
if (envelope.eventVersion !== envelope.consent?.eventVersion) fail("CAB-CON-002", "The event version no longer matches the permission.");
if (envelope.payloadHash !== envelope.consent?.outboundPayloadHash) fail("CAB-CON-003", "The outbound content no longer matches the permission.");
if (envelope.recipient?.opaqueId !== envelope.consent?.recipientOpaqueId) fail("CAB-REC-001", "The intended recipient is not covered.");
if (!envelope.consent?.channels?.includes(envelope.recipient?.channel)) fail("CAB-CHN-001", "The delivery channel is not covered.");
if (envelope.approval?.actionVersion !== envelope.actionVersion) fail("CAB-APR-001", "The caregiver approval is stale.");
if (envelope.approval?.payloadHash !== envelope.payloadHash) fail("CAB-APR-002", "The approved content does not match the current content.");
if (!envelope.recipient?.verified) fail("CAB-REC-002", "The external destination is not verified.");
if (!envelope.activeMembership || !envelope.caregiverAuthorized) fail("CAB-AUT-001", "The caregiver relationship is not active and authorized.");
if (!envelope.latestActionVersion) fail("CAB-VER-001", "A newer action version exists.");
if (!envelope.globalExternalActionsEnabled || !envelope.circleExternalActionsEnabled) fail("CAB-KIL-001", "External actions are currently disabled.");
process.stdout.write(JSON.stringify({ decision: failures.length === 0 ? "pass" : "fail", failures: failures.slice(0, 30) }));
`;

/** Hash of the exact validator code uploaded to Daytona. */
export const VALIDATOR_HASH = createHash("sha256")
  .update(POLICY_VALIDATOR_SOURCE, "utf8")
  .digest("hex");

/** Parses and validates a credential-free policy envelope locally. */
export function validatePolicyEnvelope(
  input: unknown,
  nowEpochMs?: number,
): PolicyValidationResult {
  const envelope = PolicyEnvelopeSchema.parse(input);
  const failures = [...evaluateInvariants(envelope)];
  const simulation = simulateAdapter(envelope);
  if (!simulation.accepted) {
    failures.push({
      ruleId: "CAB-ACT-001",
      publicMessage: "The requested action is not supported.",
    });
  }
  const validatedAt = nowEpochMs ?? envelope.nowEpochMs;
  return {
    validatorVersion: VALIDATOR_VERSION,
    validatorHash: VALIDATOR_HASH,
    decision: failures.length === 0 ? "pass" : "fail",
    failures,
    validatedAt,
    expiresAt: validatedAt + 5 * 60 * 1000,
  };
}
