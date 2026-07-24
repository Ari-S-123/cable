import { describe, expect, it } from "vitest";

import {
  deterministicAdapters,
  deterministicAppointmentDraft,
} from "../../src/lib/adapters/deterministic";
import type { ProviderMessage } from "../../src/lib/contracts";
import { FIXTURE_HASH, createValidPolicyEnvelope } from "../fixtures/policy";

const message: ProviderMessage = {
  subject: "Synthetic coordination request",
  body: "With permission: please offer alternative appointment times. Ref CABLE-DEMO-ADAPTER.",
  channel: "email",
  recipient: {
    kind: "provider_contact",
    id: "provider_demo_1",
    displayLabel: "Verified demo clinic",
  },
  purpose: "appointment_coordination",
  callbackPreference: "Return the call to the seeded demo caregiver.",
  opaqueReference: "CABLE-DEMO-ADAPTER",
  disclosureHash: FIXTURE_HASH,
};

describe("deterministic adapter contract", () => {
  it("extracts the stable Hindi-source fixture and rejects an empty session", async () => {
    const success = await deterministicAdapters.inference.extractEvent([
      {
        id: "turn_1",
        locale: "hi-IN",
        text: "मंगलवार की अपॉइंटमेंट बदलनी है।",
      },
    ]);
    expect(success).toEqual({ ok: true, value: deterministicAppointmentDraft });
    expect(
      await deterministicAdapters.inference.extractEvent([]),
    ).toMatchObject({
      ok: false,
      error: { code: "INVALID_INPUT", retryable: false },
    });
  });

  it("translates only bounded dynamic text", async () => {
    const translated =
      await deterministicAdapters.inference.translateDynamicText({
        sourceLocale: "hi-IN",
        destinationLocale: "en-US",
        text: "क्लिनिक से वैकल्पिक समय पूछें।",
      });
    expect(translated).toEqual({
      ok: true,
      value: "Ask the clinic for alternative appointment times.",
    });
    expect(
      await deterministicAdapters.inference.translateDynamicText({
        sourceLocale: "hi-IN",
        destinationLocale: "en-US",
        text: "",
      }),
    ).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
  });

  it("returns stable provider IDs for identical immutable delivery requests", async () => {
    const input = {
      from: "cable@demo.invalid",
      to: "clinic@demo.invalid",
      message,
      idempotencyKey: `cable:test:proposal_1:1:email:${FIXTURE_HASH}`,
    };
    const first = await deterministicAdapters.email.send(input);
    const second = await deterministicAdapters.email.send(input);
    expect(first).toEqual(second);
    expect(first).toMatchObject({ ok: true, value: { status: "simulated" } });
  });

  it("satisfies the same bounded voice and policy contracts as live adapters", async () => {
    const voice = await deterministicAdapters.voice.createSignedSession({
      agentId: "agent_demo",
      nonce: "deterministic_nonce_123",
    });
    expect(voice).toMatchObject({
      ok: true,
      value: { signedUrl: "demo://elevenlabs/deterministic_nonce_123" },
    });
    const policy = await deterministicAdapters.policy.validate(
      createValidPolicyEnvelope(),
    );
    expect(policy).toMatchObject({
      ok: true,
      value: { decision: "pass", failures: [] },
    });
  });
});
