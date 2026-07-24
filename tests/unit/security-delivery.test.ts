import { describe, expect, it } from "vitest";

import type { AdapterError } from "../../src/lib/contracts";
import { shouldRetryDelivery } from "../../src/lib/adapters/delivery";
import { validateOrigin } from "../../src/lib/security/origin";
import { FixedWindowRateLimiter } from "../../src/lib/security/rate-limit";

describe("route and delivery safety helpers", () => {
  it("requires an exact canonical request origin", () => {
    const accepted = new Request("https://cable.test/api", {
      headers: { origin: "https://cable.test" },
    });
    const rejected = new Request("https://cable.test/api", {
      headers: { origin: "https://evil.test" },
    });
    expect(validateOrigin(accepted, "https://cable.test")).toEqual({
      allowed: true,
    });
    expect(validateOrigin(rejected, "https://cable.test")).toMatchObject({
      allowed: false,
    });
  });

  it("enforces a fixed window without accepting empty keys", () => {
    const limiter = new FixedWindowRateLimiter({ limit: 2, windowMs: 1_000 });
    expect(limiter.consume("subject", 10).allowed).toBe(true);
    expect(limiter.consume("subject", 20).allowed).toBe(true);
    expect(limiter.consume("subject", 30).allowed).toBe(false);
    expect(limiter.consume("subject", 1_011).allowed).toBe(true);
    expect(() => limiter.consume("")).toThrow(/key/u);
  });

  it("never retries an ambiguous Twilio transport outcome", () => {
    const ambiguous: AdapterError = {
      code: "AMBIGUOUS_TRANSPORT_RESULT",
      message: "Acceptance unknown",
      retryable: true,
    };
    const emailTimeout: AdapterError = {
      code: "TIMEOUT_BEFORE_ACCEPTANCE",
      message: "No acceptance",
      retryable: true,
      acceptedByProvider: false,
    };
    expect(shouldRetryDelivery(ambiguous, "sms")).toBe(false);
    expect(shouldRetryDelivery(emailTimeout, "email")).toBe(true);
  });
});
