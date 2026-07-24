import {
  CareEventDraftSchema,
  type AdapterResult,
  type CareEventDraft,
  type DeliveryAdapterValue,
  type Locale,
  PolicyValidationResultSchema,
  type PolicyValidationResult,
} from "@/lib/contracts";
import type {
  CableAdapters,
  EmailDeliveryInput,
  InferenceAdapter,
  PolicyValidatorAdapter,
  SmsDeliveryInput,
  VoiceAdapter,
} from "@/lib/adapters/types";
import { sha256 } from "@/lib/policy/canonicalize";
import { validatePolicyEnvelope } from "@cable/policy-sandbox";

const deterministicTimestamp = Date.UTC(2026, 6, 24, 16, 0, 0);

/** Stable fictional appointment scenario used by local mode and automated tests. */
export const deterministicAppointmentDraft: CareEventDraft =
  CareEventDraftSchema.parse({
    neutralSummary:
      "My cardiology appointment on Tuesday conflicts with the ride I had arranged.",
    confirmedFacts: [
      {
        category: "appointment",
        text: "A cardiology appointment is scheduled for Tuesday.",
        sourceTurnIds: ["turn-demo-1"],
        confirmation: "confirmed",
        originalLocale: "hi-IN",
      },
      {
        category: "transportation",
        text: "The planned ride is unavailable at the appointment time.",
        sourceTurnIds: ["turn-demo-1"],
        confirmation: "confirmed",
        originalLocale: "hi-IN",
      },
    ],
    unconfirmedFacts: [],
    requestedOutcome: "Ask the clinic for alternative appointment times.",
    urgencyCue: "routine",
    actionCandidates: [
      {
        kind: "ask_provider_for_times",
        rationale:
          "The clinic can offer alternatives without changing care instructions.",
      },
      {
        kind: "ask_caregiver_to_call",
        rationale: "A caregiver can discuss transportation with the elder.",
      },
    ],
    prohibitedClinicalContentDetected: false,
    originalLocale: "hi-IN",
  });

const deterministicTranslations: Readonly<Record<string, string>> = {
  "मंगलवार की हृदय-चिकित्सा अपॉइंटमेंट मेरी सवारी के समय से टकरा रही है।":
    "My cardiology appointment on Tuesday conflicts with my ride.",
  "क्लिनिक से वैकल्पिक समय पूछें।":
    "Ask the clinic for alternative appointment times.",
};

/** Creates stable synthetic delivery metadata from one immutable request. */
function syntheticDelivery(
  prefix: string,
  idempotencyKey: string,
): AdapterResult<DeliveryAdapterValue> {
  return {
    ok: true,
    value: {
      externalMessageId: `${prefix}_${sha256(idempotencyKey).slice(0, 20)}`,
      status: "simulated",
      acceptedAt: deterministicTimestamp,
    },
  };
}

/** Deterministic inference with zero network or credential access. */
export const deterministicInferenceAdapter: InferenceAdapter = {
  async extractEvent(turns) {
    if (
      turns.length === 0 ||
      turns.every((turn) => turn.text.trim().length === 0)
    ) {
      return {
        ok: false,
        error: {
          code: "INVALID_INPUT",
          message: "At least one non-empty private turn is required.",
          retryable: false,
        },
      };
    }
    return { ok: true, value: deterministicAppointmentDraft };
  },
  async translateDynamicText(input) {
    const text = input.text.trim();
    if (text.length === 0 || text.length > 1200) {
      return {
        ok: false,
        error: {
          code: "INVALID_INPUT",
          message: "Dynamic translation text must contain 1–1200 characters.",
          retryable: false,
        },
      };
    }
    if (input.sourceLocale === input.destinationLocale)
      return { ok: true, value: text };
    return {
      ok: true,
      value:
        deterministicTranslations[text] ??
        "The elder requested coordination using the exact confirmed details shown above.",
    };
  },
};

/** Deterministic credential-free policy adapter. */
export const deterministicPolicyAdapter: PolicyValidatorAdapter = {
  async validate(envelope) {
    const result = PolicyValidationResultSchema.parse(
      validatePolicyEnvelope(envelope),
    );
    return { ok: true, value: result };
  },
};

/** Deterministic private voice adapter that returns a non-network demo URL. */
export const deterministicVoiceAdapter: VoiceAdapter = {
  async createSignedSession(input) {
    if (!/^[a-zA-Z0-9_-]{8,100}$/u.test(input.nonce)) {
      return {
        ok: false,
        error: {
          code: "INVALID_INPUT",
          message: "The session nonce is malformed.",
          retryable: false,
        },
      };
    }
    return {
      ok: true,
      value: {
        signedUrl: `demo://elevenlabs/${encodeURIComponent(input.nonce)}`,
        conversationId: `conv_${sha256(input.nonce).slice(0, 20)}`,
        expiresAt: Date.now() + 5 * 60 * 1000,
      },
    };
  },
};

/** Complete deterministic adapter suite; no method performs network I/O. */
export const deterministicAdapters: CableAdapters = {
  inference: deterministicInferenceAdapter,
  email: {
    async send(input: EmailDeliveryInput) {
      return syntheticDelivery("email", input.idempotencyKey);
    },
  },
  sms: {
    async send(input: SmsDeliveryInput) {
      return syntheticDelivery("sms", input.idempotencyKey);
    },
  },
  voice: deterministicVoiceAdapter,
  policy: deterministicPolicyAdapter,
};

/** Deterministically translates a known demo dynamic field. */
export function deterministicTranslate(
  text: string,
  destinationLocale: Locale,
): string {
  if (destinationLocale === "hi-IN") return text;
  return deterministicTranslations[text] ?? text;
}
