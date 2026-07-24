import { Resend } from "resend";
import twilio from "twilio";

import type {
  AdapterError,
  AdapterResult,
  DeliveryAdapterValue,
} from "@/lib/contracts";
import type {
  EmailAdapter,
  EmailDeliveryInput,
  SmsAdapter,
  SmsDeliveryInput,
} from "@/lib/adapters/types";

/** Maps an unknown delivery exception to a conservative normalized failure. */
function unknownDeliveryError(
  channel: "email" | "sms",
  error: unknown,
): AdapterError {
  const isError = error instanceof Error;
  const timeout =
    isError && /timeout|timed out|socket hang up/iu.test(error.message);
  if (channel === "sms" && timeout) {
    return {
      code: "AMBIGUOUS_TRANSPORT_RESULT",
      message:
        "SMS acceptance is unknown; automatic retry is blocked for manual review.",
      retryable: false,
    };
  }
  return {
    code: timeout ? "TIMEOUT_BEFORE_ACCEPTANCE" : "UNKNOWN",
    message: `${channel === "email" ? "Email" : "SMS"} delivery failed without a safe provider response.`,
    retryable: channel === "email" && timeout,
  };
}

/** Builds a lazy Resend adapter with provider-side idempotency. */
export function createResendAdapter(apiKey: string): EmailAdapter {
  if (apiKey.length < 16) throw new Error("A valid Resend API key is required");
  let resend: Resend | undefined;
  return {
    async send(
      input: EmailDeliveryInput,
    ): Promise<AdapterResult<DeliveryAdapterValue>> {
      resend ??= new Resend(apiKey);
      try {
        const result = await resend.emails.send(
          {
            from: input.from,
            to: input.to,
            subject: input.message.subject ?? "C.A.B.L.E coordination request",
            text: input.message.body,
          },
          { idempotencyKey: input.idempotencyKey },
        );
        if (result.error !== null) {
          const retryable = /rate|internal|application/iu.test(
            result.error.name,
          );
          return {
            ok: false,
            error: {
              code: retryable ? "TEMPORARILY_UNAVAILABLE" : "PROVIDER_REJECTED",
              message:
                "The email provider did not accept the approved message.",
              retryable,
              providerCode: result.error.name,
              acceptedByProvider: false,
            },
          };
        }
        return {
          ok: true,
          value: {
            externalMessageId: result.data.id,
            status: "accepted",
            acceptedAt: Date.now(),
          },
        };
      } catch (error: unknown) {
        return { ok: false, error: unknownDeliveryError("email", error) };
      }
    },
  };
}

/** Builds a lazy Twilio adapter that never retries an ambiguous accepted request. */
export function createTwilioAdapter(
  accountSid: string,
  authToken: string,
  statusCallbackUrl?: string,
): SmsAdapter {
  if (!/^AC[a-f0-9]{32}$/u.test(accountSid) || authToken.length < 16) {
    throw new Error("Valid Twilio credentials are required");
  }
  let client: ReturnType<typeof twilio> | undefined;
  return {
    async send(
      input: SmsDeliveryInput,
    ): Promise<AdapterResult<DeliveryAdapterValue>> {
      client ??= twilio(accountSid, authToken, { autoRetry: false });
      try {
        const message = await client.messages.create({
          from: input.from,
          to: input.to,
          body: input.message.body,
          ...(statusCallbackUrl === undefined
            ? {}
            : { statusCallback: statusCallbackUrl }),
        });
        return {
          ok: true,
          value: {
            externalMessageId: message.sid,
            status: "accepted",
            acceptedAt: Date.now(),
          },
        };
      } catch (error: unknown) {
        return { ok: false, error: unknownDeliveryError("sms", error) };
      }
    },
  };
}

/** Builds an SMS adapter that fails closed when Twilio is intentionally disabled. */
export function createDisabledSmsAdapter(): SmsAdapter {
  return {
    async send(): Promise<AdapterResult<DeliveryAdapterValue>> {
      return {
        ok: false,
        error: {
          code: "PROVIDER_REJECTED",
          message: "SMS delivery is disabled for this deployment.",
          retryable: false,
          acceptedByProvider: false,
        },
      };
    },
  };
}

/** Classifies whether a normalized delivery failure may be retried automatically. */
export function shouldRetryDelivery(
  error: AdapterError,
  channel: "email" | "sms",
): boolean {
  if (channel === "sms" && error.code === "AMBIGUOUS_TRANSPORT_RESULT")
    return false;
  return error.retryable && error.acceptedByProvider !== true;
}
