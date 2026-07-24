import { Daytona, type DaytonaConfig } from "@daytona/sdk";

import {
  PolicyValidationResultSchema,
  type AdapterResult,
  type PolicyValidationResult,
} from "@/lib/contracts";
import type { PolicyValidatorAdapter } from "@/lib/adapters/types";
import {
  POLICY_VALIDATOR_SOURCE,
  VALIDATOR_HASH,
  VALIDATOR_VERSION,
} from "@cable/policy-sandbox";

/** Builds a live Daytona adapter with a five-minute TTL and blocked networking. */
export function createDaytonaAdapter(
  config: DaytonaConfig,
): PolicyValidatorAdapter {
  if (config.apiKey === undefined || config.apiKey.length < 16) {
    throw new Error("A valid Daytona API key is required");
  }
  return {
    async validate(envelope): Promise<AdapterResult<PolicyValidationResult>> {
      const serialized = JSON.stringify(envelope);
      if (Buffer.byteLength(serialized, "utf8") > 8_192) {
        return {
          ok: false,
          error: {
            code: "INVALID_INPUT",
            message: "The credential-free policy envelope is too large.",
            retryable: false,
          },
        };
      }

      const daytona = new Daytona(config);
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
          throw new Error(
            "The isolated validator returned a non-zero or oversized result",
          );
        }
        const partial: unknown = JSON.parse(execution.result);
        const parsed = PolicyValidationResultSchema.pick({
          decision: true,
          failures: true,
        }).parse(partial);
        const validatedAt = Date.now();
        return {
          ok: true,
          value: PolicyValidationResultSchema.parse({
            ...parsed,
            validatorVersion: VALIDATOR_VERSION,
            validatorHash: VALIDATOR_HASH,
            validatedAt,
            expiresAt: validatedAt + 5 * 60 * 1000,
          }),
        };
      } catch (error: unknown) {
        const timeout =
          error instanceof Error && /timeout|timed out/iu.test(error.message);
        return {
          ok: false,
          error: {
            code: timeout ? "TIMEOUT_BEFORE_ACCEPTANCE" : "POLICY_BLOCKED",
            message:
              "Isolated policy validation did not produce a trusted pass result.",
            retryable: timeout,
          },
        };
      } finally {
        if (sandbox !== undefined) {
          try {
            await daytona.delete(sandbox, 30, true);
          } catch {
            // The five-minute TTL is the final cleanup backstop; never turn a
            // failed deletion into permission to execute an external action.
          }
        }
        await daytona[Symbol.asyncDispose]();
      }
    },
  };
}
