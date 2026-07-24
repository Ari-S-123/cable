import { z } from "zod";

/** The two authenticated application roles supported by the MVP. */
export const RoleSchema = z.enum(["elder", "caregiver"]);

/** An authenticated application role. */
export type Role = z.infer<typeof RoleSchema>;

/** The reviewed locale allow-list. Spanish is intentionally unsupported. */
export const LocaleSchema = z.enum(["en-US", "hi-IN"]);

/** A supported BCP 47 locale. */
export type Locale = z.infer<typeof LocaleSchema>;

/** All communication channels recognized by disclosure policy. */
export const ChannelSchema = z.enum([
  "in_app",
  "email",
  "sms",
  "voice",
  "browser_voice",
  "browser_text",
  "phone",
]);

/** A communication channel. */
export type Channel = z.infer<typeof ChannelSchema>;

/** Channels that can disclose a scoped care update. */
export const DisclosureChannelSchema = z.enum([
  "in_app",
  "email",
  "sms",
  "voice",
]);

/** A channel covered by an elder's disclosure grant. */
export type DisclosureChannel = z.infer<typeof DisclosureChannelSchema>;

/** Machine-readable reasons for sharing the minimum necessary information. */
export const PurposeSchema = z.enum([
  "caregiver_review",
  "provider_callback",
  "appointment_coordination",
  "family_checkin",
  "operational_alert",
]);

/** A disclosure purpose. */
export type Purpose = z.infer<typeof PurposeSchema>;

/** Allow-listed side effects and simulated coordination actions. */
export const ActionTypeSchema = z.enum([
  "send_provider_email",
  "send_provider_sms",
  "request_caregiver_call",
  "retry_checkin",
  "mark_resolved",
]);

/** A safe, allow-listed action type. */
export type ActionType = z.infer<typeof ActionTypeSchema>;

/** Stable care-event aggregate states. */
export const CareEventStatusSchema = z.enum([
  "draft",
  "facts_confirmed",
  "consent_pending",
  "shared",
  "resolved",
  "canceled",
]);

/** Stable action-proposal aggregate states. */
export const ActionStatusSchema = z.enum([
  "proposed",
  "awaiting_approval",
  "approved",
  "queued",
  "executing",
  "completed",
  "rejected",
  "invalidated",
  "retryable_failure",
  "permanent_failure",
  "delivery_unknown",
]);

/** Immutable consent ledger states. */
export const ConsentStatusSchema = z.enum([
  "requested",
  "granted",
  "denied",
  "revoked",
  "expired",
  "superseded",
]);

/** Immutable approval ledger decisions. */
export const ApprovalDecisionSchema = z.enum(["approved", "rejected"]);

/** Delivery states ordered from queued through terminal provider outcomes. */
export const DeliveryStatusSchema = z.enum([
  "queued",
  "sending",
  "accepted",
  "delivered",
  "retryable_failure",
  "permanent_failure",
  "delivery_unknown",
  "canceled",
]);

/** Material, append-only audit event names. */
export const AuditEventTypeSchema = z.enum([
  "conversation.started",
  "conversation.ended",
  "event.draft_created",
  "event.corrected",
  "event.facts_confirmed",
  "consent.requested",
  "consent.granted",
  "consent.denied",
  "consent.revoked",
  "consent.expired",
  "consent.superseded",
  "proposal.created",
  "proposal.edited",
  "approval.approved",
  "approval.rejected",
  "approval.invalidated",
  "policy.passed",
  "policy.failed",
  "notification.queued",
  "notification.leased",
  "notification.accepted",
  "notification.delivered",
  "notification.failed",
  "notification.canceled",
  "webhook.accepted",
  "webhook.replayed",
  "security.denied",
]);

/** Redacted, stable public API error codes. */
export const PublicErrorCodeSchema = z.enum([
  "AUTH_REQUIRED",
  "FORBIDDEN",
  "INVALID_REQUEST",
  "RATE_LIMITED",
  "STALE_VERSION",
  "CONSENT_REQUIRED",
  "CONSENT_EXPIRED",
  "APPROVAL_REQUIRED",
  "CONTACT_UNVERIFIED",
  "POLICY_VALIDATION_FAILED",
  "DELIVERY_FAILED",
  "LIVE_CONFIGURATION_REQUIRED",
  "TEMPORARILY_UNAVAILABLE",
]);

/** A client-safe error without provider bodies, secrets, or resource existence leaks. */
export const PublicErrorSchema = z
  .object({
    code: PublicErrorCodeSchema,
    message: z.string().min(1).max(300),
    retryable: z.boolean(),
    correlationId: z.string().min(8).max(100),
  })
  .strict();

/** A client-safe error. */
export type PublicError = z.infer<typeof PublicErrorSchema>;

/** A typed reference to a care-circle member or external provider contact. */
export const RecipientReferenceSchema = z
  .object({
    kind: z.enum(["user", "provider_contact"]),
    id: z.string().min(1).max(200),
    displayLabel: z.string().min(1).max(160),
  })
  .strict();

/** A recipient reference bound to consent and approval. */
export type RecipientReference = z.infer<typeof RecipientReferenceSchema>;

/** A timestamp with an explicit UTC offset or Z suffix. */
export const ZonedTimestampSchema = z
  .string()
  .datetime({ offset: true })
  .describe("ISO 8601 timestamp with an explicit timezone offset");
