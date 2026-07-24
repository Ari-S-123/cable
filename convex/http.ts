import { httpRouter, makeFunctionReference } from "convex/server";
import { z } from "zod";

import { httpAction } from "./_generated/server";

const http = httpRouter();
const recordReceiptReference = makeFunctionReference<"mutation">(
  "webhooks:recordReceipt",
);
const reconcileWorkOSReference = makeFunctionReference<"mutation">(
  "webhooks:reconcileWorkOSMembership",
);
const applyDeliveryReference = makeFunctionReference<"mutation">(
  "webhooks:applyDeliveryEvent",
);
const executeVoiceToolReference = makeFunctionReference<"mutation">(
  "voiceSessions:executeTool",
);

/** Encodes bytes using lowercase hexadecimal. */
function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

/** Encodes bytes using standard Base64 without relying on Node globals. */
function base64(bytes: ArrayBuffer): string {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** Decodes the `whsec_` secrets used by Standard Webhooks providers. */
function decodeBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

/** Timing-stable comparison for webhook message authentication codes. */
function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

/** Computes a Web Crypto HMAC in the required output format. */
async function hmac(
  algorithm: "SHA-1" | "SHA-256",
  secret: Uint8Array<ArrayBuffer> | string,
  content: string,
  format: "hex" | "base64",
): Promise<string> {
  const encodedSecret =
    typeof secret === "string" ? new TextEncoder().encode(secret) : secret;
  const key = await crypto.subtle.importKey(
    "raw",
    encodedSecret,
    { name: "HMAC", hash: algorithm },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(content),
  );
  return format === "hex" ? hex(signature) : base64(signature);
}

/** Computes a SHA-256 payload fingerprint without storing a webhook body. */
async function payloadHash(body: string): Promise<string> {
  return hex(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body)),
  );
}

/** Verifies WorkOS and Resend Standard Webhooks over the unparsed body. */
async function verifyStandardWebhook(
  request: Request,
  body: string,
  secret: string,
): Promise<number> {
  const id = request.headers.get("webhook-id");
  const timestamp = request.headers.get("webhook-timestamp");
  const signatures = request.headers.get("webhook-signature");
  if (id === null || timestamp === null || signatures === null)
    throw new Error("MISSING_SIGNATURE");
  const epochSeconds = Number(timestamp);
  if (
    !Number.isSafeInteger(epochSeconds) ||
    Math.abs(Date.now() - epochSeconds * 1000) > 5 * 60 * 1000
  ) {
    throw new Error("STALE_SIGNATURE");
  }
  const secretBytes = secret.startsWith("whsec_")
    ? decodeBase64(secret.slice("whsec_".length))
    : new TextEncoder().encode(secret);
  const expected = await hmac(
    "SHA-256",
    secretBytes,
    `${id}.${timestamp}.${body}`,
    "base64",
  );
  const verified = signatures
    .split(" ")
    .map((signature) => signature.split(",")[1])
    .some(
      (candidate) =>
        candidate !== undefined && constantTimeEqual(candidate, expected),
    );
  if (!verified) throw new Error("INVALID_SIGNATURE");
  return epochSeconds * 1000;
}

/** Verifies the timestamped ElevenLabs HMAC over the raw body. */
async function verifyElevenLabs(
  request: Request,
  body: string,
  secret: string,
): Promise<number> {
  const header = request.headers.get("elevenlabs-signature");
  if (header === null) throw new Error("MISSING_SIGNATURE");
  const entries = Object.fromEntries(
    header.split(",").map((entry) => entry.split("=", 2)),
  );
  const timestamp = Number(entries.t);
  const signature = entries.v0;
  if (!Number.isSafeInteger(timestamp) || signature === undefined)
    throw new Error("INVALID_SIGNATURE");
  if (Math.abs(Date.now() - timestamp * 1000) > 5 * 60 * 1000)
    throw new Error("STALE_SIGNATURE");
  const expected = await hmac("SHA-256", secret, `${timestamp}.${body}`, "hex");
  if (!constantTimeEqual(signature, expected))
    throw new Error("INVALID_SIGNATURE");
  return timestamp * 1000;
}

/** Returns a consistent redacted response with private caching disabled. */
function response(
  body: Readonly<Record<string, unknown>>,
  status = 200,
): Response {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

const EventEnvelopeSchema = z
  .object({
    id: z.string().min(1).max(300),
    event: z.string().min(1).max(200).optional(),
    type: z.string().min(1).max(200).optional(),
    data: z.record(z.string(), z.unknown()).default({}),
  })
  .passthrough();

http.route({
  path: "/webhooks/workos",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.text();
      const secret = process.env.WORKOS_WEBHOOK_SECRET;
      if (secret === undefined) return response({ accepted: false }, 503);
      const signatureTimestamp = await verifyStandardWebhook(
        request,
        body,
        secret,
      );
      const event = EventEnvelopeSchema.parse(JSON.parse(body) as unknown);
      const eventType = event.event ?? event.type;
      if (eventType === undefined) return response({ accepted: false }, 400);
      const receipt = await ctx.runMutation(recordReceiptReference, {
        provider: "workos",
        eventId: event.id,
        eventType,
        payloadHash: await payloadHash(body),
        signatureTimestamp,
      });
      if (receipt.replay === true)
        return response({ accepted: true, replay: true });
      if (eventType.startsWith("organization_membership.")) {
        const WorkOSMembershipSchema = z
          .object({
            id: z.string().min(1),
            user_id: z.string().min(1),
            organization_id: z.string().min(1),
            status: z.enum(["active", "inactive", "pending"]),
            role: z
              .object({ slug: z.enum(["elder", "caregiver"]) })
              .or(z.enum(["elder", "caregiver"])),
            user: z
              .object({
                first_name: z.string().optional().nullable(),
                last_name: z.string().optional().nullable(),
                email: z.string().email().optional().nullable(),
              })
              .optional(),
          })
          .passthrough();
        const membership = WorkOSMembershipSchema.parse(event.data);
        const displayName =
          [membership.user?.first_name, membership.user?.last_name]
            .filter(
              (part): part is string =>
                part !== null && part !== undefined && part.length > 0,
            )
            .join(" ") || "C.A.B.L.E member";
        await ctx.runMutation(reconcileWorkOSReference, {
          workosUserId: membership.user_id,
          workosOrganizationId: membership.organization_id,
          workosMembershipId: membership.id,
          role:
            typeof membership.role === "string"
              ? membership.role
              : membership.role.slug,
          status:
            membership.status === "active"
              ? "active"
              : eventType.endsWith("deleted")
                ? "ended"
                : "suspended",
          displayName,
          ...(membership.user?.email === null ||
          membership.user?.email === undefined
            ? {}
            : { email: membership.user.email }),
        });
      }
      return response({ accepted: true });
    } catch {
      return response({ accepted: false }, 401);
    }
  }),
});

http.route({
  path: "/webhooks/elevenlabs",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.text();
      const secret = process.env.ELEVENLABS_WEBHOOK_SECRET;
      if (secret === undefined) return response({ accepted: false }, 503);
      const signatureTimestamp = await verifyElevenLabs(request, body, secret);
      const raw: unknown = JSON.parse(body);
      const event = z
        .object({
          event_id: z.string().min(1).optional(),
          type: z.string().min(1).default("post_call"),
          data: z
            .object({ conversation_id: z.string().min(1) })
            .passthrough()
            .optional(),
        })
        .passthrough()
        .parse(raw);
      const eventId = event.event_id ?? event.data?.conversation_id;
      if (eventId === undefined) return response({ accepted: false }, 400);
      const receipt = await ctx.runMutation(recordReceiptReference, {
        provider: "elevenlabs",
        eventId,
        eventType: event.type,
        payloadHash: await payloadHash(body),
        signatureTimestamp,
      });
      return response({ accepted: true, replay: receipt.replay === true });
    } catch {
      return response({ accepted: false }, 401);
    }
  }),
});

http.route({
  path: "/webhooks/resend",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.text();
      const secret = process.env.RESEND_WEBHOOK_SECRET;
      if (secret === undefined) return response({ accepted: false }, 503);
      const signatureTimestamp = await verifyStandardWebhook(
        request,
        body,
        secret,
      );
      const event = EventEnvelopeSchema.extend({
        data: z.object({ email_id: z.string().min(1) }).passthrough(),
      }).parse(JSON.parse(body) as unknown);
      const eventType = event.type ?? event.event ?? "email.unknown";
      const receipt = await ctx.runMutation(recordReceiptReference, {
        provider: "resend",
        eventId: event.id,
        eventType,
        payloadHash: await payloadHash(body),
        signatureTimestamp,
      });
      if (receipt.replay !== true) {
        const status =
          eventType === "email.delivered"
            ? "delivered"
            : eventType === "email.sent"
              ? "accepted"
              : "permanent_failure";
        await ctx.runMutation(applyDeliveryReference, {
          provider: "resend",
          providerEventId: event.id,
          externalMessageId: event.data.email_id,
          nextStatus: status,
          providerCode: eventType,
          occurredAt: signatureTimestamp,
        });
      }
      return response({ accepted: true, replay: receipt.replay === true });
    } catch {
      return response({ accepted: false }, 401);
    }
  }),
});

http.route({
  path: "/webhooks/twilio/message-status",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.text();
      const token = process.env.TWILIO_AUTH_TOKEN;
      const signature = request.headers.get("x-twilio-signature");
      if (token === undefined || signature === null)
        return response({ accepted: false }, 503);
      const parameters = new URLSearchParams(body);
      const signed = [...parameters.entries()]
        .sort(([left], [right]) => left.localeCompare(right, "en-US"))
        .reduce((value, [key, item]) => `${value}${key}${item}`, request.url);
      const expected = await hmac("SHA-1", token, signed, "base64");
      if (!constantTimeEqual(signature, expected))
        return response({ accepted: false }, 401);
      const parsed = z
        .object({
          MessageSid: z.string().min(1),
          MessageStatus: z.string().min(1),
          ErrorCode: z.string().optional(),
        })
        .parse(Object.fromEntries(parameters));
      const digest = await payloadHash(body);
      const receipt = await ctx.runMutation(recordReceiptReference, {
        provider: "twilio",
        eventId: digest,
        eventType: parsed.MessageStatus,
        payloadHash: digest,
      });
      if (receipt.replay !== true) {
        const status =
          parsed.MessageStatus === "delivered"
            ? "delivered"
            : ["sent", "queued", "sending"].includes(parsed.MessageStatus)
              ? "accepted"
              : "permanent_failure";
        await ctx.runMutation(applyDeliveryReference, {
          provider: "twilio",
          providerEventId: digest,
          externalMessageId: parsed.MessageSid,
          nextStatus: status,
          ...(parsed.ErrorCode === undefined
            ? {}
            : { providerCode: parsed.ErrorCode }),
          occurredAt: Date.now(),
        });
      }
      return response({ accepted: true, replay: receipt.replay === true });
    } catch {
      return response({ accepted: false }, 401);
    }
  }),
});

const voiceToolNames = [
  "start_checkin",
  "save_private_turn",
  "extract_event_draft",
  "confirm_event_facts",
  "prepare_consent_prompt",
  "record_consent_response",
  "revoke_consent",
  "get_workflow_status",
  "transfer_to_caregiver",
  "end_checkin",
] as const;

for (const toolName of voiceToolNames) {
  http.route({
    path: `/tools/elevenlabs/${toolName}`,
    method: "POST",
    handler: httpAction(async (ctx, request) => {
      try {
        const body = await request.text();
        const secret = process.env.ELEVENLABS_WEBHOOK_SECRET;
        if (secret === undefined)
          return response({ ok: false, code: "NOT_CONFIGURED" }, 503);
        const signatureTimestamp = await verifyElevenLabs(
          request,
          body,
          secret,
        );
        const input = z
          .object({
            session_nonce: z.string().min(8).max(100),
            conversation_id: z.string().min(1).max(300).optional(),
            correlation_id: z.string().min(8).max(100),
            text: z.string().min(1).max(2_000).optional(),
            locale: z.enum(["en-US", "hi-IN"]).optional(),
          })
          .passthrough()
          .parse(JSON.parse(body) as unknown);
        const bodyHash = await payloadHash(body);
        const receipt = await ctx.runMutation(recordReceiptReference, {
          provider: "elevenlabs",
          eventId: `tool:${input.correlation_id}`,
          eventType: `tool.${toolName}`,
          payloadHash: bodyHash,
          signatureTimestamp,
        });
        if (receipt.replay === true) {
          return response({
            ok: true,
            replay: true,
            tool: toolName,
            correlationId: input.correlation_id,
          });
        }
        const result = await ctx.runMutation(executeVoiceToolReference, {
          nonceHash: await payloadHash(input.session_nonce),
          toolName,
          correlationId: input.correlation_id,
          ...(input.conversation_id === undefined
            ? {}
            : { externalConversationId: input.conversation_id }),
          ...(input.text === undefined ? {} : { text: input.text }),
          ...(input.locale === undefined ? {} : { locale: input.locale }),
        });
        return response({ ok: true, tool: toolName, ...result });
      } catch {
        return response(
          { ok: false, code: "INVALID_OR_REPLAYED_TOOL_CALL" },
          401,
        );
      }
    }),
  });
}

export default http;
