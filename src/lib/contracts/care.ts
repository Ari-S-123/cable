import { z } from "zod";

import {
  ActionTypeSchema,
  DisclosureChannelSchema,
  LocaleSchema,
  PurposeSchema,
  RecipientReferenceSchema,
  ZonedTimestampSchema,
} from "@/lib/contracts/common";

/** A fact category accepted from structured inference. */
export const FactCategorySchema = z.enum([
  "appointment",
  "symptom_report",
  "transportation",
  "care_task",
  "availability",
  "contact_preference",
]);

/** A fact whose origin and confirmation state are explicit. */
export const TypedFactSchema = z
  .object({
    category: FactCategorySchema,
    text: z.string().trim().min(1).max(300),
    sourceTurnIds: z.array(z.string().min(1).max(200)).min(1).max(20),
    confirmation: z.enum(["confirmed", "unconfirmed"]),
    originalLocale: LocaleSchema,
  })
  .strict();

/** A typed event fact. */
export type TypedFact = z.infer<typeof TypedFactSchema>;

/** A permitted model-generated option that still requires human authorization. */
export const ActionCandidateSchema = z
  .object({
    kind: z.enum([
      "ask_provider_to_call",
      "ask_provider_for_times",
      "ask_caregiver_to_call",
      "retry_checkin",
      "mark_resolved",
    ]),
    rationale: z.string().trim().min(1).max(500),
  })
  .strict();

/** A safe model-generated action candidate. */
export type ActionCandidate = z.infer<typeof ActionCandidateSchema>;

/** Strict structured output for private event extraction. */
export const CareEventDraftSchema = z
  .object({
    neutralSummary: z.string().trim().min(1).max(800),
    confirmedFacts: z.array(TypedFactSchema).max(20),
    unconfirmedFacts: z
      .array(
        z
          .object({
            text: z.string().trim().min(1).max(300),
            question: z.string().trim().min(1).max(300),
          })
          .strict(),
      )
      .max(10),
    requestedOutcome: z.string().trim().min(1).max(500).optional(),
    urgencyCue: z.enum(["routine", "prompt", "immediate_safety_phrase"]),
    actionCandidates: z.array(ActionCandidateSchema).max(3),
    prohibitedClinicalContentDetected: z.boolean(),
    originalLocale: LocaleSchema,
  })
  .strict();

/** A validated private care-event draft. */
export type CareEventDraft = z.infer<typeof CareEventDraftSchema>;

/** The immutable provenance attached to a model-created event version. */
export const ModelProvenanceSchema = z
  .object({
    provider: z.enum(["deterministic", "fireworks"]),
    modelId: z.string().min(1).max(300),
    promptVersion: z.string().min(1).max(100),
    generatedAt: ZonedTimestampSchema,
  })
  .strict();

/** Hash and review metadata for one language representation. */
export const DisclosureRepresentationSchema = z
  .object({
    locale: LocaleSchema,
    text: z.string().min(1).max(4000),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/u),
    templateVersion: z.string().min(1).max(100),
  })
  .strict();

/** Translation provenance for dynamic slots; static wrapper text is never model translated. */
export const TranslationProvenanceSchema = z
  .object({
    sourceLocale: LocaleSchema,
    destinationLocale: LocaleSchema,
    provider: z.enum(["deterministic", "fireworks"]),
    modelId: z.string().min(1).max(300),
    promptVersion: z.string().min(1).max(100),
    translatedDynamicSlots: z.array(z.string().min(1).max(100)).max(20),
    generatedAt: ZonedTimestampSchema,
    humanReviewedStaticWrapper: z.boolean(),
  })
  .strict();

/**
 * Complete multilingual disclosure evidence.
 *
 * Consent is invalidated if any stored representation hash changes. The elder
 * reviews Hindi while caregivers and providers receive the exact English text.
 */
export const MultilingualDisclosureSnapshotSchema = z
  .object({
    elderPreview: DisclosureRepresentationSchema.extend({
      locale: z.literal("hi-IN"),
    }),
    canonicalEnglish: DisclosureRepresentationSchema.extend({
      locale: z.literal("en-US"),
    }),
    caregiverDisclosure: DisclosureRepresentationSchema.extend({
      locale: z.literal("en-US"),
    }),
    providerDisclosure: DisclosureRepresentationSchema.extend({
      locale: z.literal("en-US"),
    }),
    translation: TranslationProvenanceSchema.extend({
      sourceLocale: z.literal("hi-IN"),
      destinationLocale: z.literal("en-US"),
    }),
    aggregateHash: z.string().regex(/^[a-f0-9]{64}$/u),
  })
  .strict();

/** Exact Hindi and English representations bound to a disclosure grant. */
export type MultilingualDisclosureSnapshot = z.infer<
  typeof MultilingualDisclosureSnapshotSchema
>;

/** A provider-bound message snapshotted before caregiver approval. */
export const ProviderMessageSchema = z
  .object({
    subject: z.string().trim().min(1).max(200).optional(),
    body: z.string().trim().min(1).max(3000),
    channel: z.enum(["email", "sms"]),
    recipient: RecipientReferenceSchema.extend({
      kind: z.literal("provider_contact"),
    }),
    purpose: PurposeSchema,
    callbackPreference: z.string().trim().min(1).max(300),
    opaqueReference: z.string().regex(/^[A-Z0-9-]{6,40}$/u),
    disclosureHash: z.string().regex(/^[a-f0-9]{64}$/u),
  })
  .strict();

/** An exact provider message. */
export type ProviderMessage = z.infer<typeof ProviderMessageSchema>;

/** An immutable proposal version suitable for caregiver review. */
export const ActionProposalVersionSchema = z
  .object({
    proposalId: z.string().min(1),
    eventId: z.string().min(1),
    eventVersion: z.number().int().positive(),
    version: z.number().int().positive(),
    actionType: ActionTypeSchema,
    recipient: RecipientReferenceSchema,
    channel: DisclosureChannelSchema,
    purpose: PurposeSchema,
    providerMessage: ProviderMessageSchema.optional(),
    explanation: z.string().min(1).max(800),
    limitations: z.array(z.string().min(1).max(300)).max(10),
    payloadHash: z.string().regex(/^[a-f0-9]{64}$/u),
    expiresAt: z.number().int().positive(),
  })
  .strict();

/** An immutable action proposal version. */
export type ActionProposalVersion = z.infer<typeof ActionProposalVersionSchema>;
