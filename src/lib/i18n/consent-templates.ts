import { z } from "zod";

import type { Locale } from "@/lib/contracts";

/** The reviewed static-wrapper version stored with each consent snapshot. */
export const CONSENT_TEMPLATE_VERSION = "cable-consent-2026-07-24.1" as const;

/** Dynamic text slots allowed inside otherwise static consent wrappers. */
export const ConsentTemplateSlotsSchema = z
  .object({
    summary: z.string().trim().min(1).max(1200),
    recipients: z.string().trim().min(1).max(500),
    channels: z.string().trim().min(1).max(200),
    purpose: z.string().trim().min(1).max(400),
    expiry: z.string().trim().min(1).max(200),
  })
  .strict();

/** Dynamic consent-template values. */
export type ConsentTemplateSlots = z.infer<typeof ConsentTemplateSlotsSchema>;

const templates: Readonly<Record<Locale, string>> = {
  "en-US":
    "C.A.B.L.E is a care-coordination assistant, not a clinician or emergency service. You are choosing whether to share exactly this: {{summary}}. It will be shared with {{recipients}} by {{channels}} for {{purpose}}, until {{expiry}}. Once a message is sent, it cannot be recalled. Do you clearly agree to share this exact information?",
  "hi-IN":
    "C.A.B.L.E देखभाल समन्वय सहायक है, चिकित्सक या आपातकालीन सेवा नहीं। आप केवल यह जानकारी साझा करने का निर्णय ले रहे हैं: {{summary}}। इसे {{purpose}} के लिए {{recipients}} के साथ {{channels}} द्वारा {{expiry}} तक साझा किया जाएगा। संदेश भेजे जाने के बाद उसे वापस नहीं लिया जा सकता। क्या आप इस सटीक जानकारी को साझा करने के लिए स्पष्ट रूप से सहमत हैं?",
};

/** Static, non-translatable immediate-safety language for each supported locale. */
export const immediateSafetyMessages: Readonly<Record<Locale, string>> = {
  "en-US":
    "C.A.B.L.E cannot assess or respond to emergencies. If you may be in immediate danger, contact local emergency services or a trusted person now. I can offer to connect you with a verified caregiver, but I will not call emergency services automatically.",
  "hi-IN":
    "C.A.B.L.E आपात स्थिति का आकलन या समाधान नहीं कर सकता। यदि आपको तुरंत खतरा हो सकता है, तो अभी स्थानीय आपातकालीन सेवा या किसी भरोसेमंद व्यक्ति से संपर्क करें। मैं किसी सत्यापित देखभालकर्ता से संपर्क कराने की पेशकश कर सकता हूँ, लेकिन आपातकालीन सेवा को अपने-आप कॉल नहीं करूँगा।",
};

/**
 * Renders a reviewed wrapper using only validated dynamic slots.
 *
 * Slot values are inserted literally and never interpreted as template syntax.
 */
export function renderConsentPrompt(
  locale: Locale,
  input: ConsentTemplateSlots,
): string {
  const slots = ConsentTemplateSlotsSchema.parse(input);
  return Object.entries(slots).reduce(
    (result, [slot, value]) => result.replaceAll(`{{${slot}}}`, value),
    templates[locale],
  );
}

/** Returns whether live consent is enabled for a locale in this environment. */
export function isLiveConsentTemplateApproved(
  locale: Locale,
  hindiTemplateApproved: boolean,
): boolean {
  return locale === "en-US" || hindiTemplateApproved;
}
