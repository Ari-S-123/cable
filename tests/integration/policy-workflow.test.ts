import { describe, expect, it } from "vitest";

import { evaluateDisclosure } from "../../src/lib/policy/consent";
import { evaluateExecution } from "../../src/lib/policy/execution";
import {
  VALIDATOR_HASH,
  validatePolicyEnvelope,
} from "../../policy-sandbox/src/validate";
import { createValidPolicyEnvelope } from "../fixtures/policy";

const now = 1_800_000_000_000;

describe("consent to isolated policy to execution workflow", () => {
  it("preserves event, content, recipient, channel, and approval bindings end to end", () => {
    const envelope = {
      ...createValidPolicyEnvelope(now),
      validatorHash: VALIDATOR_HASH,
    };
    const disclosure = evaluateDisclosure({
      authenticated: true,
      activeRelationship: true,
      consentId: "consent_demo_1",
      consentStatus: "granted",
      consentExpiresAt: envelope.consent.expiresAt,
      coveredRecipientIds: [envelope.recipient.opaqueId],
      coveredChannels: envelope.consent.channels,
      coveredPurpose: envelope.consent.purpose,
      expectedContentHash: envelope.payloadHash,
      actualContentHash: envelope.payloadHash,
      recipientId: envelope.recipient.opaqueId,
      channel: envelope.recipient.channel,
      purpose: envelope.consent.purpose,
      nowEpochMs: now,
    });
    expect(disclosure.allowed).toBe(true);

    const isolated = validatePolicyEnvelope(envelope, now);
    expect(isolated.decision).toBe("pass");

    const execution = evaluateExecution({
      authenticated: true,
      envelope,
      actionExpiresAt: now + 3_600_000,
      validation: {
        decision: isolated.decision,
        actionVersion: envelope.actionVersion,
        payloadHash: envelope.payloadHash,
        validatorHash: isolated.validatorHash,
        expiresAt: isolated.expiresAt,
      },
      idempotencyState: "reserved",
      idempotencyKey: "cable:test:proposal_1:2:email:fixture",
      hindiConsent: true,
      hindiTemplateApproved: true,
    });
    expect(execution.allowed).toBe(true);
  });

  it("blocks a recipient change before execution even when the earlier validation passed", () => {
    const original = {
      ...createValidPolicyEnvelope(now),
      validatorHash: VALIDATOR_HASH,
    };
    const isolated = validatePolicyEnvelope(original, now);
    const changed = {
      ...original,
      recipient: { ...original.recipient, opaqueId: "different_provider" },
    };
    expect(
      evaluateExecution({
        authenticated: true,
        envelope: changed,
        actionExpiresAt: now + 3_600_000,
        validation: {
          decision: isolated.decision,
          actionVersion: original.actionVersion,
          payloadHash: original.payloadHash,
          validatorHash: isolated.validatorHash,
          expiresAt: isolated.expiresAt,
        },
        idempotencyState: "reserved",
        idempotencyKey: "cable:test:proposal_1:2:email:fixture",
        hindiConsent: true,
        hindiTemplateApproved: true,
      }),
    ).toMatchObject({ allowed: false, reason: "CHANNEL_NOT_COVERED" });
  });

  it("fails the isolated validator closed for a stale approval and disabled kill switch", () => {
    const envelope = createValidPolicyEnvelope(now);
    const result = validatePolicyEnvelope({
      ...envelope,
      approval: { ...envelope.approval, actionVersion: 1 },
      globalExternalActionsEnabled: false,
    });
    expect(result.decision).toBe("fail");
    expect(result.failures.map((failure) => failure.ruleId)).toEqual(
      expect.arrayContaining(["CAB-APR-001", "CAB-KIL-001"]),
    );
  });
});
