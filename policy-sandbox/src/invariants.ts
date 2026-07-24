import type { PolicyEnvelope } from "../../src/lib/contracts/policy";

/** One deterministic invariant failure suitable for storage and safe UI display. */
export type InvariantFailure = Readonly<{
  ruleId: string;
  publicMessage: string;
}>;

const forbiddenKeys = new Set([
  "name",
  "email",
  "phone",
  "phoneE164",
  "transcript",
  "message",
  "summary",
  "apiKey",
  "secret",
  "token",
]);

/** Recursively rejects direct identifiers, health text, and credentials. */
export function findForbiddenKeys(
  value: unknown,
  found = new Set<string>(),
): ReadonlySet<string> {
  if (Array.isArray(value)) {
    for (const item of value) findForbiddenKeys(item, found);
    return found;
  }
  if (typeof value !== "object" || value === null) return found;
  for (const [key, child] of Object.entries(value)) {
    if (forbiddenKeys.has(key)) found.add(key);
    findForbiddenKeys(child, found);
  }
  return found;
}

/** Applies all authorization-binding invariants to a parsed envelope. */
export function evaluateInvariants(
  envelope: PolicyEnvelope,
): readonly InvariantFailure[] {
  const failures: InvariantFailure[] = [];
  const fail = (ruleId: string, publicMessage: string): void => {
    failures.push({ ruleId, publicMessage });
  };

  if (envelope.consent.expiresAt <= envelope.nowEpochMs) {
    fail("CAB-CON-001", "The disclosure permission has expired.");
  }
  if (envelope.eventVersion !== envelope.consent.eventVersion) {
    fail("CAB-CON-002", "The event version no longer matches the permission.");
  }
  if (envelope.payloadHash !== envelope.consent.outboundPayloadHash) {
    fail(
      "CAB-CON-003",
      "The outbound content no longer matches the permission.",
    );
  }
  if (envelope.recipient.opaqueId !== envelope.consent.recipientOpaqueId) {
    fail("CAB-REC-001", "The intended recipient is not covered.");
  }
  if (!envelope.consent.channels.includes(envelope.recipient.channel)) {
    fail("CAB-CHN-001", "The delivery channel is not covered.");
  }
  if (envelope.approval.actionVersion !== envelope.actionVersion) {
    fail("CAB-APR-001", "The caregiver approval is stale.");
  }
  if (envelope.approval.payloadHash !== envelope.payloadHash) {
    fail(
      "CAB-APR-002",
      "The approved content does not match the current content.",
    );
  }
  if (!envelope.recipient.verified) {
    fail("CAB-REC-002", "The external destination is not verified.");
  }
  if (!envelope.activeMembership || !envelope.caregiverAuthorized) {
    fail(
      "CAB-AUT-001",
      "The caregiver relationship is not active and authorized.",
    );
  }
  if (!envelope.latestActionVersion) {
    fail("CAB-VER-001", "A newer action version exists.");
  }
  if (
    !envelope.globalExternalActionsEnabled ||
    !envelope.circleExternalActionsEnabled
  ) {
    fail("CAB-KIL-001", "External actions are currently disabled.");
  }
  if (findForbiddenKeys(envelope).size > 0) {
    fail("CAB-DAT-001", "The policy envelope contains prohibited data.");
  }
  if (Buffer.byteLength(JSON.stringify(envelope), "utf8") > 8_192) {
    fail("CAB-DAT-002", "The policy envelope exceeds the allowed size.");
  }
  return failures;
}
