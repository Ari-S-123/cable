import type { Locale, MultilingualDisclosureSnapshot } from "@/lib/contracts";
import {
  CONSENT_TEMPLATE_VERSION,
  renderConsentPrompt,
} from "@/lib/i18n/consent-templates";
import { canonicalHash } from "@/lib/policy/canonicalize";

/** One immutable synthetic scenario used only by the in-browser demonstration. */
export type DemoScenario = Readonly<{
  id: "appointment" | "concern" | "missed_checkin";
  title: string;
  titleHindi: string;
  utteranceHindi: string;
  confirmedHindi: readonly string[];
  canonicalEnglish: readonly string[];
  requestedOutcomeHindi: string;
  requestedOutcomeEnglish: string;
  recipientEnglish: string;
  recipientHindi: string;
  providerMessageEnglish: string;
  caregiverOptions: readonly Readonly<{
    id: string;
    title: string;
    effect: string;
    limitation: string;
  }>[];
  disclosure: MultilingualDisclosureSnapshot;
  consentPromptHindi: string;
}>;

const generatedAt = "2026-07-24T16:00:00.000Z";

/** Creates all four separately hashed representations bound to one demo consent. */
function disclosureSnapshot(
  elderHindi: string,
  canonicalEnglish: string,
  providerEnglish: string,
): MultilingualDisclosureSnapshot {
  const elderPreview = {
    locale: "hi-IN" as const,
    text: elderHindi,
    contentHash: canonicalHash({ locale: "hi-IN", text: elderHindi }),
    templateVersion: CONSENT_TEMPLATE_VERSION,
  };
  const canonical = {
    locale: "en-US" as const,
    text: canonicalEnglish,
    contentHash: canonicalHash({ locale: "en-US", text: canonicalEnglish }),
    templateVersion: CONSENT_TEMPLATE_VERSION,
  };
  const caregiver = {
    locale: "en-US" as const,
    text: canonicalEnglish,
    contentHash: canonicalHash({
      audience: "caregiver",
      locale: "en-US",
      text: canonicalEnglish,
    }),
    templateVersion: CONSENT_TEMPLATE_VERSION,
  };
  const provider = {
    locale: "en-US" as const,
    text: providerEnglish,
    contentHash: canonicalHash({
      audience: "provider",
      locale: "en-US",
      text: providerEnglish,
    }),
    templateVersion: CONSENT_TEMPLATE_VERSION,
  };
  return {
    elderPreview,
    canonicalEnglish: canonical,
    caregiverDisclosure: caregiver,
    providerDisclosure: provider,
    translation: {
      sourceLocale: "hi-IN",
      destinationLocale: "en-US",
      provider: "deterministic",
      modelId: "cable-deterministic-translation-v1",
      promptVersion: "dynamic-slots-2026-07-24.1",
      translatedDynamicSlots: ["summary", "requestedOutcome"],
      generatedAt,
      humanReviewedStaticWrapper: true,
    },
    aggregateHash: canonicalHash({
      elderPreview,
      canonical,
      caregiver,
      provider,
    }),
  };
}

/** Returns the complete deterministic scenario catalog with no random or live data. */
export function getDemoScenarios(): readonly DemoScenario[] {
  const appointmentEnglish =
    "A cardiology appointment is scheduled for Tuesday, and the planned ride is unavailable at that time. The elder wants the clinic to offer alternative appointment times.";
  const appointmentHindi =
    "मंगलवार को हृदय-चिकित्सा अपॉइंटमेंट है और तय की गई सवारी उस समय उपलब्ध नहीं है। आप चाहती हैं कि क्लिनिक कोई दूसरा समय बताए।";
  const appointmentProvider =
    "With Asha Mehta's permission: Her cardiology appointment is scheduled for Tuesday, and her planned ride is unavailable at that time. Please contact the family caregiver with alternative appointment times. Preferred callback: Maya Mehta at the seeded demo number. This is a coordination request, not a diagnosis or emergency request. Ref CABLE-DEMO-APPT.";
  const concernEnglish =
    "The elder reports that her ankle has been more swollen since yesterday and requests a clinic callback. No diagnosis or treatment claim is included.";
  const concernHindi =
    "आपने बताया कि कल से टखने में सूजन अधिक है और आप चाहती हैं कि क्लिनिक आपको फोन करे। इसमें कोई निदान या उपचार का दावा शामिल नहीं है।";
  const concernProvider =
    "With Asha Mehta's permission: She reports that her ankle has been more swollen since yesterday and requests a callback. No diagnosis or treatment request is included. Preferred callback: Asha at the seeded demo number. Ref CABLE-DEMO-CALL.";
  const missedEnglish =
    "A scheduled routine check-in was not answered. This generic operational alert contains no care-event detail.";
  const missedHindi =
    "तय किया गया सामान्य चेक-इन कॉल नहीं उठाया गया। इस सामान्य संचालन सूचना में स्वास्थ्य संबंधी कोई विवरण नहीं है।";
  const missedProvider =
    "No provider message is created. Only a pre-authorized, attention-only caregiver alert is simulated.";

  const createScenario = (
    input: Omit<DemoScenario, "disclosure" | "consentPromptHindi">,
  ): DemoScenario => {
    const english = input.canonicalEnglish.join(" ");
    const hindi = input.confirmedHindi.join(" ");
    const disclosure = disclosureSnapshot(
      hindi,
      english,
      input.providerMessageEnglish,
    );
    return {
      ...input,
      disclosure,
      consentPromptHindi: renderConsentPrompt("hi-IN", {
        summary: hindi,
        recipients: input.recipientHindi,
        channels:
          input.id === "missed_checkin" ? "ऐप में सामान्य सूचना" : "ऐप और ईमेल",
        purpose: input.requestedOutcomeHindi,
        expiry: "24 घंटे",
      }),
    };
  };

  return [
    createScenario({
      id: "appointment",
      title: "Appointment coordination",
      titleHindi: "अपॉइंटमेंट समन्वय",
      utteranceHindi:
        "मंगलवार की हृदय-चिकित्सा अपॉइंटमेंट मेरी सवारी के समय से टकरा रही है।",
      confirmedHindi: [appointmentHindi],
      canonicalEnglish: [appointmentEnglish],
      requestedOutcomeHindi: "क्लिनिक से वैकल्पिक समय पूछना",
      requestedOutcomeEnglish:
        "Ask the clinic for alternative appointment times.",
      recipientEnglish: "Maya Mehta and Lakeview Cardiology demo desk",
      recipientHindi: "माया मेहता और लेकव्यू कार्डियोलॉजी डेमो डेस्क",
      providerMessageEnglish: appointmentProvider,
      caregiverOptions: [
        {
          id: "alternative-times",
          title: "Ask the clinic for alternative times",
          effect:
            "Send the exact English coordination request to the verified demo clinic email.",
          limitation: "This does not reschedule or change clinical care.",
        },
        {
          id: "family-ride",
          title: "Find another ride",
          effect: "Create a simulated family transportation follow-up.",
          limitation: "No provider message is sent.",
        },
      ],
    }),
    createScenario({
      id: "concern",
      title: "New non-emergency concern",
      titleHindi: "नई गैर-आपात चिंता",
      utteranceHindi:
        "कल से मेरे टखने में सूजन ज़्यादा है। मैं चाहती हूँ कि क्लिनिक मुझे फोन करे।",
      confirmedHindi: [concernHindi],
      canonicalEnglish: [concernEnglish],
      requestedOutcomeHindi: "क्लिनिक से कॉलबैक माँगना",
      requestedOutcomeEnglish: "Ask the clinic to call the elder.",
      recipientEnglish: "Maya Mehta and Lakeview Clinic demo desk",
      recipientHindi: "माया मेहता और लेकव्यू क्लिनिक डेमो डेस्क",
      providerMessageEnglish: concernProvider,
      caregiverOptions: [
        {
          id: "clinic-callback",
          title: "Ask the clinic to call",
          effect:
            "Send only the elder-approved report and callback preference.",
          limitation:
            "C.A.B.L.E does not assess the concern or recommend treatment.",
        },
        {
          id: "family-checkin",
          title: "Arrange a family check-in",
          effect: "Create a simulated same-day family call task.",
          limitation: "No provider receives health detail.",
        },
      ],
    }),
    createScenario({
      id: "missed_checkin",
      title: "Missed routine check-in",
      titleHindi: "नियमित चेक-इन छूट गया",
      utteranceHindi: "तय किया गया चेक-इन कॉल नहीं उठाया गया।",
      confirmedHindi: [missedHindi],
      canonicalEnglish: [missedEnglish],
      requestedOutcomeHindi: "देखभालकर्ता को केवल सामान्य सूचना देना",
      requestedOutcomeEnglish: "Send a generic attention-only caregiver alert.",
      recipientEnglish: "Maya Mehta",
      recipientHindi: "माया मेहता",
      providerMessageEnglish: missedProvider,
      caregiverOptions: [
        {
          id: "retry",
          title: "Retry the check-in",
          effect: "Schedule one deterministic simulated retry.",
          limitation: "No care detail appears in the alert.",
        },
        {
          id: "caregiver-call",
          title: "Ask the caregiver to call",
          effect: "Show an attention-only in-app task to Maya.",
          limitation: "No health inference is made.",
        },
      ],
    }),
  ];
}

/** Narrows an arbitrary route locale to the two supported demo locales. */
export function normalizeDemoLocale(locale: string): Locale {
  return locale === "hi-IN" ? "hi-IN" : "en-US";
}
