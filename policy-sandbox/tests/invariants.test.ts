import { describe, expect, it } from "vitest";

import { findForbiddenKeys } from "../src/invariants";
import { validatePolicyEnvelope } from "../src/validate";
import { createValidPolicyEnvelope } from "../../tests/fixtures/policy";

describe("network-blocked policy package invariants", () => {
  it("rejects direct identifiers and health content keys recursively", () => {
    expect([
      ...findForbiddenKeys({
        outer: [{ token: "redacted" }, { summary: "redacted" }],
      }),
    ]).toEqual(["token", "summary"]);
  });

  it("produces bounded, versioned, five-minute results", () => {
    const now = 1_800_000_000_000;
    const result = validatePolicyEnvelope(createValidPolicyEnvelope(now), now);
    expect(result.validatorHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(result.expiresAt - result.validatedAt).toBe(300_000);
    expect(result.failures.length).toBeLessThanOrEqual(30);
  });
});
