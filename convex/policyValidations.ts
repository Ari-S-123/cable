"use node";

import { createHash } from "node:crypto";

import { Daytona } from "@daytona/sdk";
import {
  POLICY_VALIDATOR_SOURCE,
  VALIDATOR_HASH,
  VALIDATOR_VERSION,
  validatePolicyEnvelope,
} from "@cable/policy-sandbox";
import { makeFunctionReference } from "convex/server";
import { ConvexError, v } from "convex/values";
import { z } from "zod";

import { action } from "./_generated/server";

const getEnvelopeReference = makeFunctionReference<"query">(
  "policyValidationState:getAuthoritativeEnvelope",
);
const recordResultReference = makeFunctionReference<"mutation">(
  "policyValidationState:recordResult",
);

const PolicyContextSchema = z
  .object({
    policyVersion: z.literal("2026-07-24.1"),
    actionId: z.string().min(1),
    actionVersion: z.number().int().positive(),
    eventVersion: z.number().int().positive(),
    actionType: z.enum([
      "send_provider_email",
      "send_provider_sms",
      "request_caregiver_call",
      "retry_checkin",
      "mark_resolved",
    ]),
    payloadHash: z.string().regex(/^[a-f0-9]{64}$/u),
    consent: z
      .object({
        status: z.literal("granted"),
        eventVersion: z.number().int().positive(),
        canonicalPayloadHash: z.string().regex(/^[a-f0-9]{64}$/u),
        outboundPayloadHash: z.string().regex(/^[a-f0-9]{64}$/u),
        recipientOpaqueId: z.string().min(1),
        channels: z.array(z.enum(["in_app", "email", "sms", "voice"])),
        purpose: z.enum([
          "caregiver_review",
          "provider_callback",
          "appointment_coordination",
          "family_checkin",
          "operational_alert",
        ]),
        expiresAt: z.number().int().positive(),
      })
      .strict(),
    approval: z
      .object({
        actionVersion: z.number().int().positive(),
        payloadHash: z.string().regex(/^[a-f0-9]{64}$/u),
        caregiverOpaqueId: z.string().min(1),
        approvedAt: z.number().int().positive(),
      })
      .strict(),
    recipient: z
      .object({
        opaqueId: z.string().min(1),
        channel: z.enum(["in_app", "email", "sms", "voice"]),
        verified: z.boolean(),
      })
      .strict(),
    activeMembership: z.boolean(),
    caregiverAuthorized: z.boolean(),
    latestActionVersion: z.boolean(),
    globalExternalActionsEnabled: z.boolean(),
    circleExternalActionsEnabled: z.boolean(),
    nowEpochMs: z.number().int().positive(),
  })
  .strict();

const SandboxOutputSchema = z
  .object({
    decision: z.enum(["pass", "fail"]),
    failures: z
      .array(
        z
          .object({
            ruleId: z.string().regex(/^CAB-[A-Z]+-[0-9]{3}$/u),
            publicMessage: z.string().min(1).max(300),
          })
          .strict(),
      )
      .max(30),
  })
  .strict();

/** Runs the current action through deterministic or network-blocked Daytona validation. */
export const validateApproved = action({
  args: {
    careCircleId: v.id("careCircles"),
    actionProposalId: v.id("actionProposals"),
    expectedVersion: v.number(),
    expectedPayloadHash: v.string(),
  },
  handler: async (ctx, args) => {
    const context = PolicyContextSchema.parse(
      await ctx.runQuery(getEnvelopeReference, args),
    );
    const envelope = { ...context, validatorHash: VALIDATOR_HASH };
    const serialized = JSON.stringify(envelope);
    if (Buffer.byteLength(serialized, "utf8") > 8_192) {
      throw new ConvexError({
        code: "POLICY_VALIDATION_FAILED",
        message: "The policy envelope exceeds the permitted size.",
      });
    }

    let sandboxIdHash = createHash("sha256")
      .update("deterministic-policy-validator")
      .digest("hex");
    let result = validatePolicyEnvelope(envelope, context.nowEpochMs);

    if (process.env.INTEGRATION_MODE === "live") {
      const apiKey = process.env.DAYTONA_API_KEY;
      if (apiKey === undefined || apiKey.length < 16) {
        throw new ConvexError({
          code: "LIVE_CONFIGURATION_REQUIRED",
          message: "Isolated policy validation is not configured.",
        });
      }
      const daytona = new Daytona({
        apiKey,
        ...(process.env.DAYTONA_API_URL === undefined
          ? {}
          : { apiUrl: process.env.DAYTONA_API_URL }),
      });
      let sandbox: Awaited<ReturnType<Daytona["create"]>> | undefined;
      try {
        sandbox = await daytona.create(
          {
            language: "typescript",
            ephemeral: true,
            ttlMinutes: 5,
            networkBlockAll: true,
            public: false,
            envVars: {},
            labels: { application: "cable", purpose: "policy-validation" },
          },
          { timeout: 60 },
        );
        sandboxIdHash = createHash("sha256").update(sandbox.id).digest("hex");
        await sandbox.fs.uploadFile(
          Buffer.from(POLICY_VALIDATOR_SOURCE),
          "/tmp/cable-validator.mjs",
        );
        await sandbox.fs.uploadFile(
          Buffer.from(serialized),
          "/tmp/cable-envelope.json",
        );
        const execution = await sandbox.process.executeCommand(
          "node /tmp/cable-validator.mjs /tmp/cable-envelope.json",
          undefined,
          {},
          20,
        );
        if (execution.exitCode !== 0 || execution.result.length > 8_192) {
          throw new Error("UNTRUSTED_SANDBOX_OUTPUT");
        }
        const parsed = SandboxOutputSchema.parse(
          JSON.parse(execution.result) as unknown,
        );
        const validatedAt = Date.now();
        result = {
          ...parsed,
          validatorVersion: VALIDATOR_VERSION,
          validatorHash: VALIDATOR_HASH,
          validatedAt,
          expiresAt: validatedAt + 5 * 60 * 1_000,
        };
      } catch {
        throw new ConvexError({
          code: "POLICY_VALIDATION_FAILED",
          message:
            "Isolated policy validation did not produce a trusted result.",
        });
      } finally {
        if (sandbox !== undefined) {
          try {
            await daytona.delete(sandbox, 30, true);
          } catch {
            // The five-minute TTL is the cleanup backstop. A cleanup failure
            // never changes a validation result into permission to execute.
          }
        }
        await daytona[Symbol.asyncDispose]();
      }
    }

    await ctx.runMutation(recordResultReference, {
      careCircleId: args.careCircleId,
      actionProposalId: args.actionProposalId,
      actionVersion: context.actionVersion,
      payloadHash: context.payloadHash,
      validatorVersion: result.validatorVersion,
      validatorHash: result.validatorHash,
      daytonaSandboxIdHash: sandboxIdHash,
      decision: result.decision,
      failedRules: result.failures.map((failure) => failure.ruleId),
      validatedAt: result.validatedAt,
      expiresAt: result.expiresAt,
    });
    return {
      decision: result.decision,
      failedRules: result.failures.map((failure) => failure.ruleId),
      validatorVersion: result.validatorVersion,
      expiresAt: result.expiresAt,
    };
  },
});
