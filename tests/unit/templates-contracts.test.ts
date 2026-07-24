import { describe, expect, it } from "vitest";

import {
  CareEventDraftSchema,
  MultilingualDisclosureSnapshotSchema,
} from "../../src/lib/contracts";
import {
  CONSENT_TEMPLATE_VERSION,
  isLiveConsentTemplateApproved,
  renderConsentPrompt,
} from "../../src/lib/i18n/consent-templates";
import { getDemoScenarios } from "../../src/lib/demo/scenarios";

describe("localized templates and strict contracts", () => {
  it("keeps safety language static and fills only five validated slots", () => {
    const prompt = renderConsentPrompt("hi-IN", {
      summary: "परीक्षण सारांश {{unexpected}}",
      recipients: "माया",
      channels: "ऐप",
      purpose: "समन्वय",
      expiry: "24 घंटे",
    });
    expect(prompt).toContain("C.A.B.L.E देखभाल समन्वय सहायक है");
    expect(prompt).toContain("{{unexpected}}");
    expect(prompt).not.toContain("{{summary}}");
  });

  it("requires approval for live Hindi but not English", () => {
    expect(isLiveConsentTemplateApproved("en-US", false)).toBe(true);
    expect(isLiveConsentTemplateApproved("hi-IN", false)).toBe(false);
    expect(isLiveConsentTemplateApproved("hi-IN", true)).toBe(true);
  });

  it("validates every independently hashed Hindi and English demo representation", () => {
    for (const scenario of getDemoScenarios()) {
      const disclosure = MultilingualDisclosureSnapshotSchema.parse(
        scenario.disclosure,
      );
      expect(disclosure.elderPreview.locale).toBe("hi-IN");
      expect(disclosure.caregiverDisclosure.locale).toBe("en-US");
      expect(disclosure.providerDisclosure.contentHash).not.toBe(
        disclosure.elderPreview.contentHash,
      );
      expect(disclosure.elderPreview.templateVersion).toBe(
        CONSENT_TEMPLATE_VERSION,
      );
    }
  });

  it("rejects model output with unknown keys or missing provenance", () => {
    const result = CareEventDraftSchema.safeParse({
      neutralSummary: "Test",
      confirmedFacts: [],
      unconfirmedFacts: [],
      urgencyCue: "routine",
      actionCandidates: [],
      prohibitedClinicalContentDetected: false,
      originalLocale: "en-US",
      injected: "forbidden",
    });
    expect(result.success).toBe(false);
  });
});
