import { describe, expect, it } from "vitest";

import type { PolicyEnvelope } from "../../src/lib/contracts/policy";
import {
  createIdempotencyKey,
  evaluateExecution,
} from "../../src/lib/policy/execution";
import { createValidPolicyEnvelope, FIXTURE_HASH } from "../fixtures/policy";

const now = 1_800_000_000_000;

/** Produces the non-envelope execution evidence shared by final-gate tests. */
function executionEvidence() {
  const envelope = createValidPolicyEnvelope(now);
  return {
    authenticated: true,
    envelope,
    actionExpiresAt: now + 3_600_000,
    validation: {
      decision: "pass" as const,
      actionVersion: envelope.actionVersion,
      payloadHash: envelope.payloadHash,
      validatorHash: envelope.validatorHash,
      expiresAt: now + 300_000,
    },
    idempotencyState: "reserved" as const,
    idempotencyKey: "cable:development:action_demo_1:2:email:hash",
    hindiConsent: true,
    hindiTemplateApproved: true,
  };
}

describe("authoritative execution gate", () => {
  it("passes only when every current binding is present", () => {
    expect(evaluateExecution(executionEvidence())).toEqual({
      allowed: true,
      idempotencyKey: "cable:development:action_demo_1:2:email:hash",
      payloadHash: FIXTURE_HASH,
    });
  });

  type EnvelopeChange = Partial<
    Pick<
      PolicyEnvelope,
      | "activeMembership"
      | "caregiverAuthorized"
      | "latestActionVersion"
      | "globalExternalActionsEnabled"
      | "circleExternalActionsEnabled"
    >
  > & { recipient?: Partial<PolicyEnvelope["recipient"]> };
  const deniedChanges: readonly Readonly<[string, EnvelopeChange, string]>[] = [
    ["membership", { activeMembership: false }, "INACTIVE_RELATIONSHIP"],
    ["role", { caregiverAuthorized: false }, "ROLE_NOT_AUTHORIZED"],
    ["version", { latestActionVersion: false }, "STALE_ACTION_VERSION"],
    ["provider", { recipient: { verified: false } }, "RECIPIENT_NOT_VERIFIED"],
    [
      "global switch",
      { globalExternalActionsEnabled: false },
      "GLOBAL_KILL_SWITCH",
    ],
    [
      "circle switch",
      { circleExternalActionsEnabled: false },
      "CIRCLE_KILL_SWITCH",
    ],
  ];

  it.each(deniedChanges)(
    "blocks a failed %s check",
    (_label, envelopeChange, reason) => {
      const evidence = executionEvidence();
      const envelope = {
        ...evidence.envelope,
        ...envelopeChange,
        recipient: {
          ...evidence.envelope.recipient,
          ...(envelopeChange.recipient ?? {}),
        },
      };
      expect(evaluateExecution({ ...evidence, envelope })).toEqual({
        allowed: false,
        reason,
        manualFallbackAllowed: true,
      });
    },
  );

  it("blocks live Hindi execution until the static wrapper is approved", () => {
    expect(
      evaluateExecution({
        ...executionEvidence(),
        hindiTemplateApproved: false,
      }),
    ).toMatchObject({
      allowed: false,
      reason: "HINDI_TEMPLATE_NOT_APPROVED",
    });
  });

  it("creates stable, bounded idempotency keys", () => {
    const input = {
      environment: "preview",
      actionProposalId: "proposal_1",
      actionVersion: 2,
      channel: "email",
      payloadHash: FIXTURE_HASH,
    };
    expect(createIdempotencyKey(input)).toBe(createIdempotencyKey(input));
    expect(() =>
      createIdempotencyKey({ ...input, channel: "email:unsafe" }),
    ).toThrow(/unsupported/u);
  });
});
