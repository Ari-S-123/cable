import { ZodError } from "zod";

import { parseServerEnvironment } from "../src/lib/env/schema";

/** Validates mode-specific configuration without printing any secret value. */
function verifyEnvironment(): void {
  try {
    const environment = parseServerEnvironment(process.env);
    const sideEffects = environment.EXTERNAL_ACTIONS_ENABLED
      ? "enabled"
      : "disabled";
    console.log(
      `Environment valid: ${environment.INTEGRATION_MODE} mode; external actions ${sideEffects}.`,
    );
    if (environment.INTEGRATION_MODE === "deterministic") {
      console.log(
        "Live vendor provisioning was not checked because deterministic mode is active.",
      );
    }
  } catch (error: unknown) {
    if (error instanceof ZodError) {
      const fields = [
        ...new Set(
          error.issues.map((issue) => String(issue.path[0] ?? "environment")),
        ),
      ];
      console.error(
        `Environment invalid. Check: ${fields.join(", ")}. No secret values were printed.`,
      );
      process.exitCode = 1;
      return;
    }
    console.error(
      "Environment validation failed with an unexpected redacted error.",
    );
    process.exitCode = 1;
  }
}

verifyEnvironment();
