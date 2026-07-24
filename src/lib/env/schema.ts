import { z } from "zod";

const BooleanEnvironmentSchema = z
  .enum(["true", "false"])
  .transform((value) => value === "true");

/** Environment controls parsed for every server process. */
export const BaseEnvironmentSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
    NEXT_PUBLIC_CONVEX_URL: z.url().optional(),
    NEXT_PUBLIC_WORKOS_REDIRECT_URI: z.url().optional(),
    NEXT_PUBLIC_DEFAULT_LOCALE: z.enum(["en-US", "hi-IN"]).default("en-US"),
    INTEGRATION_MODE: z
      .enum(["deterministic", "live"])
      .default("deterministic"),
    DEMO_MODE: BooleanEnvironmentSchema.default(true),
    EXTERNAL_ACTIONS_ENABLED: BooleanEnvironmentSchema.default(false),
    HINDI_CONSENT_TEMPLATE_APPROVED: BooleanEnvironmentSchema.default(false),
  })
  .passthrough();

/** Secrets and approved routing required before live side effects are enabled. */
export const LiveEnvironmentSchema = BaseEnvironmentSchema.extend({
  INTEGRATION_MODE: z.literal("live"),
  WORKOS_API_KEY: z.string().min(20),
  WORKOS_CLIENT_ID: z.string().min(8),
  WORKOS_COOKIE_PASSWORD: z.string().min(32),
  WORKOS_WEBHOOK_SECRET: z.string().min(16),
  FIREWORKS_API_KEY: z.string().min(16),
  FIREWORKS_MODEL_ID: z.string().min(1),
  ELEVENLABS_API_KEY: z.string().min(16),
  ELEVENLABS_AGENT_ID: z.string().min(8),
  ELEVENLABS_WEBHOOK_SECRET: z.string().min(16),
  TWILIO_ACCOUNT_SID: z.string().regex(/^AC[a-f0-9]{32}$/u),
  TWILIO_AUTH_TOKEN: z.string().min(16),
  TWILIO_PHONE_NUMBER: z.string().regex(/^\+[1-9]\d{7,14}$/u),
  RESEND_API_KEY: z.string().min(16),
  RESEND_WEBHOOK_SECRET: z.string().min(16),
  RESEND_FROM_ADDRESS: z.email(),
  DAYTONA_API_KEY: z.string().min(16),
  DAYTONA_API_URL: z.url().optional(),
  BRAINTRUST_API_KEY: z.string().min(16),
  BRAINTRUST_PROJECT_NAME: z.string().min(1),
  AUDIT_HASH_SECRET: z.string().min(32),
  APPROVED_PROVIDER_EMAILS: z.string().min(3),
  APPROVED_PROVIDER_PHONES: z.string().min(8),
}).superRefine((environment, context) => {
  if (
    environment.NODE_ENV === "production" &&
    !environment.EXTERNAL_ACTIONS_ENABLED
  ) {
    context.addIssue({
      code: "custom",
      path: ["EXTERNAL_ACTIONS_ENABLED"],
      message:
        "Production live mode must make the external-action decision explicit",
    });
  }
  if (
    environment.EXTERNAL_ACTIONS_ENABLED &&
    !environment.HINDI_CONSENT_TEMPLATE_APPROVED
  ) {
    context.addIssue({
      code: "custom",
      path: ["HINDI_CONSENT_TEMPLATE_APPROVED"],
      message:
        "Live Hindi sends require an approved static Hindi template version",
    });
  }
});

/** Environment values accepted by the credential-free deterministic application. */
export const DeterministicEnvironmentSchema = BaseEnvironmentSchema.extend({
  INTEGRATION_MODE: z.literal("deterministic").default("deterministic"),
});

/** Parsed base environment values. */
export type BaseEnvironment = z.infer<typeof BaseEnvironmentSchema>;

/** Parsed environment values for deterministic execution. */
export type DeterministicEnvironment = z.infer<
  typeof DeterministicEnvironmentSchema
>;

/** Parsed live environment values. */
export type LiveEnvironment = z.infer<typeof LiveEnvironmentSchema>;

/** Parses deterministic mode or performs the complete fail-closed live validation. */
export function parseServerEnvironment(
  values: Readonly<Record<string, string | undefined>>,
): DeterministicEnvironment | LiveEnvironment {
  const mode = BaseEnvironmentSchema.pick({ INTEGRATION_MODE: true }).parse(
    values,
  );
  return mode.INTEGRATION_MODE === "live"
    ? LiveEnvironmentSchema.parse(values)
    : DeterministicEnvironmentSchema.parse(values);
}
