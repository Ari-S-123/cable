"use node";

import { createHash, randomBytes } from "node:crypto";
import { makeFunctionReference } from "convex/server";
import { Resend } from "resend";
import twilio from "twilio";
import { v } from "convex/values";

import { action } from "./_generated/server";

const leaseNextReference =
  makeFunctionReference<"mutation">("outbox:leaseNext");
const authorizeLeaseReference = makeFunctionReference<"mutation">(
  "outbox:authorizeLease",
);
const completeLeaseReference = makeFunctionReference<"mutation">(
  "outbox:completeLease",
);

/** Leases, reauthorizes, and performs at most one immutable provider request. */
export const processNext = action({
  args: {},
  returns: v.object({ processed: v.boolean() }),
  handler: async (ctx) => {
    const token = randomBytes(32).toString("hex");
    const leaseTokenHash = createHash("sha256").update(token).digest("hex");
    const lease = await ctx.runMutation(leaseNextReference, {
      nowEpochMs: Date.now(),
      leaseTokenHash,
    });
    if (typeof lease !== "object" || lease === null || !("jobId" in lease)) {
      return { processed: false };
    }
    const authorization = await ctx.runMutation(authorizeLeaseReference, {
      jobId: lease.jobId,
      leaseTokenHash,
      nowEpochMs: Date.now(),
    });
    if (
      typeof authorization !== "object" ||
      authorization === null ||
      authorization.allowed !== true
    ) {
      return { processed: true };
    }
    let outcome:
      | "accepted"
      | "retryable_failure"
      | "permanent_failure"
      | "delivery_unknown";
    let externalMessageId: string | undefined;
    let errorCode: string | undefined;
    try {
      if (process.env.INTEGRATION_MODE !== "live") {
        outcome = "accepted";
        externalMessageId = `synthetic_${authorization.payloadHash.slice(0, 20)}`;
      } else if (authorization.channel === "email") {
        const apiKey = process.env.RESEND_API_KEY;
        const from = process.env.RESEND_FROM_ADDRESS;
        if (apiKey === undefined || from === undefined)
          throw new Error("RESEND_NOT_CONFIGURED");
        const response = await new Resend(apiKey).emails.send(
          {
            from,
            to: authorization.destination,
            subject:
              authorization.payload.subject ?? "C.A.B.L.E coordination request",
            text: authorization.payload.body,
          },
          { idempotencyKey: authorization.idempotencyKey },
        );
        if (response.error !== null) {
          outcome = /rate|internal|application/iu.test(response.error.name)
            ? "retryable_failure"
            : "permanent_failure";
          errorCode = response.error.name;
        } else {
          outcome = "accepted";
          externalMessageId = response.data.id;
        }
      } else {
        const sid = process.env.TWILIO_ACCOUNT_SID;
        const authToken = process.env.TWILIO_AUTH_TOKEN;
        const from = process.env.TWILIO_PHONE_NUMBER;
        if (
          sid === undefined ||
          authToken === undefined ||
          from === undefined
        ) {
          throw new Error("TWILIO_NOT_CONFIGURED");
        }
        const message = await twilio(sid, authToken, {
          autoRetry: false,
        }).messages.create({
          from,
          to: authorization.destination,
          body: authorization.payload.body,
        });
        outcome = "accepted";
        externalMessageId = message.sid;
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "UNKNOWN";
      const ambiguousSms =
        authorization.channel === "sms" &&
        /timeout|socket|network/iu.test(message);
      outcome = ambiguousSms
        ? "delivery_unknown"
        : authorization.channel === "email"
          ? "retryable_failure"
          : "permanent_failure";
      errorCode = ambiguousSms
        ? "AMBIGUOUS_TRANSPORT_RESULT"
        : "PROVIDER_REQUEST_FAILED";
    }
    await ctx.runMutation(completeLeaseReference, {
      jobId: lease.jobId,
      leaseTokenHash,
      outcome,
      ...(externalMessageId === undefined ? {} : { externalMessageId }),
      ...(errorCode === undefined ? {} : { errorCode }),
      nowEpochMs: Date.now(),
    });
    return { processed: true };
  },
});
