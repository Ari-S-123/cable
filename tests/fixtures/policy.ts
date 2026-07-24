import {
  POLICY_VERSION,
  type PolicyEnvelope,
} from "../../src/lib/contracts/policy";

/** Stable SHA-256-shaped fixture value. */
export const FIXTURE_HASH = "a".repeat(64);

/** Creates a policy envelope in which every authoritative execution binding is valid. */
export function createValidPolicyEnvelope(
  nowEpochMs = 1_800_000_000_000,
): PolicyEnvelope {
  return {
    policyVersion: POLICY_VERSION,
    actionId: "action_demo_1",
    actionVersion: 2,
    eventVersion: 3,
    actionType: "send_provider_email",
    payloadHash: FIXTURE_HASH,
    consent: {
      status: "granted",
      eventVersion: 3,
      canonicalPayloadHash: "b".repeat(64),
      outboundPayloadHash: FIXTURE_HASH,
      recipientOpaqueId: "provider_demo_1",
      channels: ["email"],
      purpose: "appointment_coordination",
      expiresAt: nowEpochMs + 3_600_000,
    },
    approval: {
      actionVersion: 2,
      payloadHash: FIXTURE_HASH,
      caregiverOpaqueId: "caregiver_demo_1",
      approvedAt: nowEpochMs - 1_000,
    },
    recipient: {
      opaqueId: "provider_demo_1",
      channel: "email",
      verified: true,
    },
    activeMembership: true,
    caregiverAuthorized: true,
    latestActionVersion: true,
    globalExternalActionsEnabled: true,
    circleExternalActionsEnabled: true,
    validatorHash: "c".repeat(64),
    nowEpochMs,
  };
}
