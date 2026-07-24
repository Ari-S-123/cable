import type {
  AdapterResult,
  CareEventDraft,
  DeliveryAdapterValue,
  Locale,
  PolicyEnvelope,
  PolicyValidationResult,
  ProviderMessage,
} from "@/lib/contracts";

/** One short-lived normalized private conversation turn. */
export type PrivateTurn = Readonly<{
  id: string;
  locale: Locale;
  text: string;
}>;

/** Safe inference operations. Models never receive provider credentials or execution tools. */
export type InferenceAdapter = Readonly<{
  extractEvent: (
    turns: readonly PrivateTurn[],
  ) => Promise<AdapterResult<CareEventDraft>>;
  translateDynamicText: (
    input: Readonly<{
      sourceLocale: Locale;
      destinationLocale: Locale;
      text: string;
    }>,
  ) => Promise<AdapterResult<string>>;
}>;

/** Provider-independent email delivery input. */
export type EmailDeliveryInput = Readonly<{
  from: string;
  to: string;
  message: ProviderMessage;
  idempotencyKey: string;
}>;

/** Provider-independent SMS delivery input. */
export type SmsDeliveryInput = Readonly<{
  from: string;
  to: string;
  message: ProviderMessage;
  idempotencyKey: string;
}>;

/** Email adapter contract implemented by deterministic and Resend providers. */
export type EmailAdapter = Readonly<{
  send: (
    input: EmailDeliveryInput,
  ) => Promise<AdapterResult<DeliveryAdapterValue>>;
}>;

/** SMS adapter contract implemented by deterministic and Twilio providers. */
export type SmsAdapter = Readonly<{
  send: (
    input: SmsDeliveryInput,
  ) => Promise<AdapterResult<DeliveryAdapterValue>>;
}>;

/** Browser voice session result that never exposes an API key. */
export type VoiceSession = Readonly<{
  signedUrl: string;
  conversationId?: string;
  expiresAt: number;
}>;

/** Private browser voice adapter. */
export type VoiceAdapter = Readonly<{
  createSignedSession: (
    input: Readonly<{ agentId: string; nonce: string }>,
  ) => Promise<AdapterResult<VoiceSession>>;
}>;

/** Isolated credential-free policy validator. */
export type PolicyValidatorAdapter = Readonly<{
  validate: (
    envelope: PolicyEnvelope,
  ) => Promise<AdapterResult<PolicyValidationResult>>;
}>;

/** Complete integration set selected by environment. */
export type CableAdapters = Readonly<{
  inference: InferenceAdapter;
  email: EmailAdapter;
  sms: SmsAdapter;
  voice: VoiceAdapter;
  policy: PolicyValidatorAdapter;
}>;
