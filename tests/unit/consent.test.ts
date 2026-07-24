import { describe, expect, it } from "vitest";

import {
  calculateConsentExpiry,
  classifyConsentResponse,
  evaluateDisclosure,
} from "../../src/lib/policy/consent";

const now = 1_800_000_000_000;

describe("consent precision and disclosure scope", () => {
  it.each([
    ["en-US", "yes", "granted"],
    ["en-US", "yes, but maybe later", "ambiguous"],
    ["en-US", "do not share", "denied"],
    ["hi-IN", "हाँ", "granted"],
    ["hi-IN", "हाँ, शायद बाद में", "ambiguous"],
    ["hi-IN", "साझा न करें", "denied"],
  ] as const)(
    "classifies %s response conservatively",
    (locale, response, expected) => {
      expect(classifyConsentResponse(response, locale)).toBe(expected);
    },
  );

  it("allows only an exact active recipient, channel, purpose, and representation hash", () => {
    const decision = evaluateDisclosure({
      authenticated: true,
      activeRelationship: true,
      consentId: "consent_1",
      consentStatus: "granted",
      consentExpiresAt: now + 1_000,
      coveredRecipientIds: ["caregiver_1"],
      coveredChannels: ["in_app"],
      coveredPurpose: "caregiver_review",
      expectedContentHash: "english-hash",
      actualContentHash: "english-hash",
      expectedTranslationHash: "hindi-hash",
      actualTranslationHash: "hindi-hash",
      recipientId: "caregiver_1",
      channel: "in_app",
      purpose: "caregiver_review",
      nowEpochMs: now,
    });
    expect(decision).toEqual({
      allowed: true,
      consentId: "consent_1",
      contentHash: "english-hash",
    });
  });

  it.each([
    ["recipient", { recipientId: "caregiver_2" }, "RECIPIENT_NOT_COVERED"],
    ["channel", { channel: "email" as const }, "CHANNEL_NOT_COVERED"],
    [
      "purpose",
      { purpose: "provider_callback" as const },
      "PURPOSE_NOT_COVERED",
    ],
    ["content", { actualContentHash: "changed" }, "CONTENT_MISMATCH"],
    [
      "translation",
      { actualTranslationHash: "changed" },
      "TRANSLATION_MISMATCH",
    ],
  ])("fails closed for a %s mismatch", (_label, change, reason) => {
    const decision = evaluateDisclosure({
      authenticated: true,
      activeRelationship: true,
      consentId: "consent_1",
      consentStatus: "granted",
      consentExpiresAt: now + 1_000,
      coveredRecipientIds: ["caregiver_1"],
      coveredChannels: ["in_app"],
      coveredPurpose: "caregiver_review",
      expectedContentHash: "english-hash",
      actualContentHash: "english-hash",
      expectedTranslationHash: "hindi-hash",
      actualTranslationHash: "hindi-hash",
      recipientId: "caregiver_1",
      channel: "in_app",
      purpose: "caregiver_review",
      nowEpochMs: now,
      ...change,
    });
    expect(decision).toEqual({ allowed: false, reason });
  });

  it("expires after the earlier of 24 hours and the event deadline", () => {
    expect(calculateConsentExpiry(now)).toBe(now + 86_400_000);
    expect(calculateConsentExpiry(now, now + 10_000)).toBe(now + 10_000);
    expect(() => calculateConsentExpiry(now, now)).toThrow(/deadline/u);
  });
});
