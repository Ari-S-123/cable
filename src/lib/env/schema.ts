import { z } from "zod";

const BooleanEnvironmentSchema = z
  .enum(["true", "false"])
  .transform((value) => value === "true");

const OptionalEnvironmentStringSchema = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().optional(),
);

const OptionalEnvironmentUrlSchema = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.url().optional(),
);

/** Environment controls parsed for every server process. */
export const BaseEnvironmentSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
    NEXT_PUBLIC_CONVEX_URL: OptionalEnvironmentUrlSchema,
    NEXT_PUBLIC_WORKOS_REDIRECT_URI: OptionalEnvironmentUrlSchema,
    NEXT_PUBLIC_DEFAULT_LOCALE: z.enum(["en-US", "hi-IN"]).default("en-US"),
    INTEGRATION_MODE: z
      .enum(["deterministic", "live"])
      .default("deterministic"),
    DEMO_MODE: BooleanEnvironmentSchema.default(true),
    EXTERNAL_ACTIONS_ENABLED: BooleanEnvironmentSchema.default(false),
    HINDI_CONSENT_TEMPLATE_APPROVED: BooleanEnvironmentSchema.default(false),
    TWILIO_ENABLED: BooleanEnvironmentSchema.default(false),
  })
  .passthrough();

/** Secrets and approved routing required before live side effects are enabled. */
export const LiveEnvironmentSchema = BaseEnvironmentSchema.extend({
  INTEGRATION_MODE: z.literal("live"),
  NEXT_PUBLIC_CONVEX_URL: z.url(),
  NEXT_PUBLIC_WORKOS_REDIRECT_URI: z.url(),
  WORKOS_API_KEY: z.string().min(20),
  WORKOS_CLIENT_ID: z.string().min(8),
  WORKOS_COOKIE_PASSWORD: z.string().min(32),
  WORKOS_WEBHOOK_SECRET: z.string().min(16),
  FIREWORKS_API_KEY: z.string().min(16),
  FIREWORKS_MODEL_ID: z.string().min(1),
  ELEVENLABS_API_KEY: z.string().min(16),
  ELEVENLABS_AGENT_ID: z.string().min(8),
  ELEVENLABS_WEBHOOK_SECRET: z.string().min(16),
  TWILIO_ACCOUNT_SID: OptionalEnvironmentStringSchema,
  TWILIO_AUTH_TOKEN: OptionalEnvironmentStringSchema,
  TWILIO_PHONE_NUMBER: OptionalEnvironmentStringSchema,
  RESEND_API_KEY: z.string().min(16),
  RESEND_WEBHOOK_SECRET: z.string().min(16),
  RESEND_FROM_ADDRESS: z.email(),
  DAYTONA_API_KEY: z.string().min(16),
  DAYTONA_API_URL: OptionalEnvironmentUrlSchema,
  BRAINTRUST_API_KEY: z.string().min(16),
  BRAINTRUST_PROJECT_NAME: z.string().min(1),
  AUDIT_HASH_SECRET: z.string().min(32),
  APPROVED_PROVIDER_EMAILS: z.string().min(3),
  APPROVED_PROVIDER_PHONES: OptionalEnvironmentStringSchema,
}).superRefine((environment, context) => {
  if (environment.TWILIO_ENABLED) {
    const twilioFields = [
      [
        "TWILIO_ACCOUNT_SID",
        z.string().regex(/^AC[a-f0-9]{32}$/u),
        environment.TWILIO_ACCOUNT_SID,
      ],
      ["TWILIO_AUTH_TOKEN", z.string().min(16), environment.TWILIO_AUTH_TOKEN],
      [
        "TWILIO_PHONE_NUMBER",
        z.string().regex(/^\+[1-9]\d{7,14}$/u),
        environment.TWILIO_PHONE_NUMBER,
      ],
      [
        "APPROVED_PROVIDER_PHONES",
        z.string().min(8),
        environment.APPROVED_PROVIDER_PHONES,
      ],
    ] as const;
    for (const [field, schema, value] of twilioFields) {
      if (!schema.safeParse(value).success) {
        context.addIssue({
          code: "custom",
          path: [field],
          message: `${field} is required when TWILIO_ENABLED=true`,
        });
      }
    }
  }
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
