import { z } from "zod";

/** Normalized adapter failure categories shared by live and deterministic modes. */
export const AdapterErrorCodeSchema = z.enum([
  "INVALID_INPUT",
  "NOT_CONFIGURED",
  "AUTHENTICATION_FAILED",
  "RATE_LIMITED",
  "TIMEOUT_BEFORE_ACCEPTANCE",
  "AMBIGUOUS_TRANSPORT_RESULT",
  "PROVIDER_REJECTED",
  "POLICY_BLOCKED",
  "TEMPORARILY_UNAVAILABLE",
  "UNKNOWN",
]);

/** A normalized adapter error with no provider response body or secret material. */
export const AdapterErrorSchema = z
  .object({
    code: AdapterErrorCodeSchema,
    message: z.string().min(1).max(300),
    retryable: z.boolean(),
    acceptedByProvider: z.boolean().optional(),
    providerCode: z.string().max(100).optional(),
  })
  .strict();

/** A normalized adapter error. */
export type AdapterError = z.infer<typeof AdapterErrorSchema>;

/** Successful or failed third-party operation after boundary normalization. */
export type AdapterResult<TValue> =
  | Readonly<{ ok: true; value: TValue }>
  | Readonly<{ ok: false; error: AdapterError }>;

/** Webhook metadata common to every provider receipt. */
export const WebhookReceiptSchema = z
  .object({
    provider: z.enum(["workos", "elevenlabs", "twilio", "resend"]),
    eventId: z.string().min(1).max(300),
    eventType: z.string().min(1).max(200),
    receivedAt: z.number().int().positive(),
    signatureTimestamp: z.number().int().positive().optional(),
    externalMessageId: z.string().max(300).optional(),
  })
  .strict();

/** Parsed, replay-protected webhook metadata. */
export type WebhookReceipt = z.infer<typeof WebhookReceiptSchema>;

/** Safe delivery response shared by email and SMS implementations. */
export const DeliveryAdapterValueSchema = z
  .object({
    externalMessageId: z.string().min(1).max(300),
    status: z.enum(["accepted", "simulated"]),
    acceptedAt: z.number().int().positive(),
  })
  .strict();

/** Safe delivery response. */
export type DeliveryAdapterValue = z.infer<typeof DeliveryAdapterValueSchema>;
