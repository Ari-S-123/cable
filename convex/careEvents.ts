import { ConvexError, v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { appendAuditEvent } from "./audit";
import { auditHash } from "./policy/canonicalize";
import {
  assertCareAuthorization,
  assertResourceOwnership,
} from "./policy/authorization";

const locale = v.union(v.literal("en-US"), v.literal("hi-IN"));
const fact = v.object({
  category: v.union(
    v.literal("appointment"),
    v.literal("symptom_report"),
    v.literal("transportation"),
    v.literal("care_task"),
    v.literal("availability"),
    v.literal("contact_preference"),
  ),
  text: v.string(),
  sourceTurnIds: v.array(v.string()),
  confirmation: v.union(v.literal("confirmed"), v.literal("unconfirmed")),
  originalLocale: locale,
});
const representation = v.object({
  locale,
  text: v.string(),
  contentHash: v.string(),
  templateVersion: v.string(),
});
const disclosureSnapshot = v.object({
  elderPreview: representation,
  canonicalEnglish: representation,
  caregiverDisclosure: representation,
  providerDisclosure: representation,
  translation: v.object({
    sourceLocale: locale,
    destinationLocale: locale,
    provider: v.union(v.literal("deterministic"), v.literal("fireworks")),
    modelId: v.string(),
    promptVersion: v.string(),
    translatedDynamicSlots: v.array(v.string()),
    generatedAt: v.string(),
    humanReviewedStaticWrapper: v.boolean(),
  }),
  aggregateHash: v.string(),
});

/** Rejects oversized or malformed event content before it reaches immutable storage. */
function validateEventContent(
  input: Readonly<{
    originalSummary: string;
    canonicalEnglishSummary: string;
    confirmedFacts: readonly Readonly<{
      text: string;
      sourceTurnIds: readonly string[];
    }>[];
    unconfirmedFacts: readonly Readonly<{ text: string; question: string }>[];
    requestedOutcome?: string;
  }>,
): void {
  if (
    input.originalSummary.trim().length === 0 ||
    input.originalSummary.length > 800 ||
    input.canonicalEnglishSummary.trim().length === 0 ||
    input.canonicalEnglishSummary.length > 800 ||
    input.confirmedFacts.length > 20 ||
    input.unconfirmedFacts.length > 10 ||
    (input.requestedOutcome !== undefined &&
      input.requestedOutcome.length > 500) ||
    input.confirmedFacts.some(
      (item) =>
        item.text.trim().length === 0 ||
        item.text.length > 300 ||
        item.sourceTurnIds.length === 0 ||
        item.sourceTurnIds.length > 20,
    ) ||
    input.unconfirmedFacts.some(
      (item) =>
        item.text.trim().length === 0 ||
        item.text.length > 300 ||
        item.question.trim().length === 0 ||
        item.question.length > 300,
    )
  ) {
    throw new ConvexError({
      code: "INVALID_REQUEST",
      message: "The event draft is incomplete or exceeds the allowed bounds.",
    });
  }
}

/** Verifies every representation hash and the cross-language aggregate hash. */
async function validateDisclosure(
  snapshot: Readonly<{
    elderPreview: Readonly<{
      locale: "en-US" | "hi-IN";
      text: string;
      contentHash: string;
      templateVersion: string;
    }>;
    canonicalEnglish: Readonly<{
      locale: "en-US" | "hi-IN";
      text: string;
      contentHash: string;
      templateVersion: string;
    }>;
    caregiverDisclosure: Readonly<{
      locale: "en-US" | "hi-IN";
      text: string;
      contentHash: string;
      templateVersion: string;
    }>;
    providerDisclosure: Readonly<{
      locale: "en-US" | "hi-IN";
      text: string;
      contentHash: string;
      templateVersion: string;
    }>;
    translation: Readonly<{
      sourceLocale: "en-US" | "hi-IN";
      destinationLocale: "en-US" | "hi-IN";
      translatedDynamicSlots: readonly string[];
      humanReviewedStaticWrapper: boolean;
    }>;
    aggregateHash: string;
  }>,
): Promise<void> {
  const expectedElder = await auditHash({
    locale: snapshot.elderPreview.locale,
    text: snapshot.elderPreview.text,
  });
  const expectedCanonical = await auditHash({
    locale: snapshot.canonicalEnglish.locale,
    text: snapshot.canonicalEnglish.text,
  });
  const expectedCaregiver = await auditHash({
    audience: "caregiver",
    locale: snapshot.caregiverDisclosure.locale,
    text: snapshot.caregiverDisclosure.text,
  });
  const expectedProvider = await auditHash({
    audience: "provider",
    locale: snapshot.providerDisclosure.locale,
    text: snapshot.providerDisclosure.text,
  });
  const expectedAggregate = await auditHash({
    elderPreview: snapshot.elderPreview,
    canonical: snapshot.canonicalEnglish,
    caregiver: snapshot.caregiverDisclosure,
    provider: snapshot.providerDisclosure,
  });
  if (
    snapshot.elderPreview.locale !== "hi-IN" ||
    snapshot.canonicalEnglish.locale !== "en-US" ||
    snapshot.caregiverDisclosure.locale !== "en-US" ||
    snapshot.providerDisclosure.locale !== "en-US" ||
    snapshot.translation.sourceLocale !== "hi-IN" ||
    snapshot.translation.destinationLocale !== "en-US" ||
    !snapshot.translation.humanReviewedStaticWrapper ||
    snapshot.translation.translatedDynamicSlots.some(
      (slot) =>
        !["summary", "requestedOutcome", "callbackPreference"].includes(slot),
    ) ||
    snapshot.elderPreview.contentHash !== expectedElder ||
    snapshot.canonicalEnglish.contentHash !== expectedCanonical ||
    snapshot.caregiverDisclosure.contentHash !== expectedCaregiver ||
    snapshot.providerDisclosure.contentHash !== expectedProvider ||
    snapshot.aggregateHash !== expectedAggregate
  ) {
    throw new ConvexError({
      code: "TRANSLATION_MISMATCH",
      message: "The multilingual disclosure hashes do not match.",
    });
  }
}

/** Starts one short-lived private conversation for the authenticated elder. */
export const startPrivateConversation = mutation({
  args: {
    careCircleId: v.id("careCircles"),
    channel: v.union(
      v.literal("browser_voice"),
      v.literal("phone"),
      v.literal("browser_text"),
    ),
    locale,
    elevenLabsConversationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const authorization = await assertCareAuthorization(
      ctx,
      args.careCircleId,
      "elder",
    );
    if (
      args.elevenLabsConversationId !== undefined &&
      (args.elevenLabsConversationId.length === 0 ||
        args.elevenLabsConversationId.length > 300)
    ) {
      throw new ConvexError({
        code: "INVALID_REQUEST",
        message: "The voice conversation identifier is invalid.",
      });
    }
    const now = Date.now();
    const conversationId = await ctx.db.insert("conversations", {
      careCircleId: args.careCircleId,
      elderUserId: authorization.user._id,
      channel: args.channel,
      ...(args.elevenLabsConversationId === undefined
        ? {}
        : { elevenLabsConversationId: args.elevenLabsConversationId }),
      locale: args.locale,
      status: "active",
      visibility: "private",
      startedAt: now,
      retentionExpiresAt: now + 24 * 60 * 60 * 1_000,
    });
    return { conversationId, retentionExpiresAt: now + 24 * 60 * 60 * 1_000 };
  },
});

/** Stores one bounded private turn; conversation turns are never caregiver-readable. */
export const savePrivateTurn = mutation({
  args: {
    careCircleId: v.id("careCircles"),
    conversationId: v.id("conversations"),
    source: v.union(
      v.literal("elder"),
      v.literal("agent"),
      v.literal("system"),
    ),
    text: v.string(),
    locale,
  },
  handler: async (ctx, args) => {
    const authorization = await assertCareAuthorization(
      ctx,
      args.careCircleId,
      "elder",
    );
    const conversation = await ctx.db.get(args.conversationId);
    if (conversation === null) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Private conversation is unavailable.",
      });
    }
    assertResourceOwnership(conversation.careCircleId, args.careCircleId);
    const text = args.text.trim().normalize("NFC");
    if (
      conversation.elderUserId !== authorization.user._id ||
      conversation.status !== "active" ||
      text.length === 0 ||
      text.length > 2_000
    ) {
      throw new ConvexError({
        code: "INVALID_REQUEST",
        message: "The private turn cannot be stored.",
      });
    }
    const previous = await ctx.db
      .query("conversationTurns")
      .withIndex("by_conversation_and_sequence", (queryBuilder) =>
        queryBuilder.eq("conversationId", conversation._id),
      )
      .order("desc")
      .first();
    const now = Date.now();
    const turnId = await ctx.db.insert("conversationTurns", {
      conversationId: conversation._id,
      careCircleId: args.careCircleId,
      source: args.source,
      normalizedText: text,
      locale: args.locale,
      sequence: (previous?.sequence ?? 0) + 1,
      createdAt: now,
      retentionExpiresAt: Math.min(
        conversation.retentionExpiresAt,
        now + 24 * 60 * 60 * 1_000,
      ),
    });
    return { turnId, sequence: (previous?.sequence ?? 0) + 1 };
  },
});

/** Creates an immutable event version and supersedes prior consent after corrections. */
export const saveVersion = mutation({
  args: {
    careCircleId: v.id("careCircles"),
    conversationId: v.id("conversations"),
    careEventId: v.optional(v.id("careEvents")),
    expectedVersion: v.optional(v.number()),
    originalLocale: locale,
    originalSummary: v.string(),
    canonicalEnglishSummary: v.string(),
    confirmedFacts: v.array(fact),
    unconfirmedFacts: v.array(
      v.object({ text: v.string(), question: v.string() }),
    ),
    requestedOutcome: v.optional(v.string()),
    urgencyCue: v.union(
      v.literal("routine"),
      v.literal("prompt"),
      v.literal("immediate_safety_phrase"),
    ),
    modelProvenance: v.object({
      provider: v.union(v.literal("deterministic"), v.literal("fireworks")),
      modelId: v.string(),
      promptVersion: v.string(),
      generatedAt: v.string(),
    }),
    disclosureSnapshot: v.optional(disclosureSnapshot),
  },
  handler: async (ctx, args) => {
    const authorization = await assertCareAuthorization(
      ctx,
      args.careCircleId,
      "elder",
    );
    const conversation = await ctx.db.get(args.conversationId);
    if (
      conversation === null ||
      conversation.careCircleId !== args.careCircleId ||
      conversation.elderUserId !== authorization.user._id
    ) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Private conversation is unavailable.",
      });
    }
    validateEventContent(args);
    if (args.disclosureSnapshot !== undefined) {
      await validateDisclosure(args.disclosureSnapshot);
    }
    const existing =
      args.careEventId === undefined
        ? null
        : await ctx.db.get(args.careEventId);
    if (
      existing !== null &&
      (existing.careCircleId !== args.careCircleId ||
        existing.elderUserId !== authorization.user._id ||
        existing.conversationId !== args.conversationId ||
        existing.currentVersion !== args.expectedVersion)
    ) {
      throw new ConvexError({
        code: "STALE_VERSION",
        message: "A newer event version exists.",
      });
    }
    if (existing === null && args.careEventId !== undefined) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Care event is unavailable.",
      });
    }
    const version = (existing?.currentVersion ?? 0) + 1;
    const now = Date.now();
    const careEventId =
      existing === null
        ? await ctx.db.insert("careEvents", {
            careCircleId: args.careCircleId,
            elderUserId: authorization.user._id,
            conversationId: conversation._id,
            currentVersion: version,
            status: "draft",
            createdAt: now,
            updatedAt: now,
          })
        : existing._id;
    const contentHash = await auditHash({
      careEventId,
      version,
      originalLocale: args.originalLocale,
      originalSummary: args.originalSummary,
      canonicalEnglishSummary: args.canonicalEnglishSummary,
      confirmedFacts: args.confirmedFacts,
      unconfirmedFacts: args.unconfirmedFacts,
      requestedOutcome: args.requestedOutcome,
      urgencyCue: args.urgencyCue,
      disclosureAggregateHash: args.disclosureSnapshot?.aggregateHash,
    });
    await ctx.db.insert("careEventVersions", {
      careEventId,
      careCircleId: args.careCircleId,
      version,
      originalLocale: args.originalLocale,
      originalSummary: args.originalSummary.trim().normalize("NFC"),
      canonicalEnglishSummary: args.canonicalEnglishSummary
        .trim()
        .normalize("NFC"),
      confirmedFacts: args.confirmedFacts,
      unconfirmedFacts: args.unconfirmedFacts,
      ...(args.requestedOutcome === undefined
        ? {}
        : { requestedOutcome: args.requestedOutcome.trim().normalize("NFC") }),
      urgencyCue: args.urgencyCue,
      modelProvenance: args.modelProvenance,
      contentHash,
      ...(args.disclosureSnapshot === undefined
        ? {}
        : { disclosureSnapshot: args.disclosureSnapshot }),
      createdBy: "elder",
      createdAt: now,
    });
    await ctx.db.patch(careEventId, {
      currentVersion: version,
      status: args.unconfirmedFacts.length === 0 ? "facts_confirmed" : "draft",
      updatedAt: now,
    });

    if (existing !== null) {
      const activeConsents = await ctx.db
        .query("consents")
        .filter((queryBuilder) =>
          queryBuilder.and(
            queryBuilder.eq(queryBuilder.field("careEventId"), careEventId),
            queryBuilder.or(
              queryBuilder.eq(queryBuilder.field("status"), "requested"),
              queryBuilder.eq(queryBuilder.field("status"), "granted"),
            ),
          ),
        )
        .take(100);
      for (const consent of activeConsents) {
        await ctx.db.patch(consent._id, { status: "superseded" });
      }
      const proposals = await ctx.db
        .query("actionProposals")
        .filter((queryBuilder) =>
          queryBuilder.eq(queryBuilder.field("careEventId"), careEventId),
        )
        .take(100);
      for (const proposal of proposals) {
        if (proposal.status === "completed") continue;
        await ctx.db.patch(proposal._id, {
          status: "invalidated",
          updatedAt: now,
        });
        const approvals = await ctx.db
          .query("approvals")
          .withIndex("by_action_and_version", (queryBuilder) =>
            queryBuilder
              .eq("actionProposalId", proposal._id)
              .eq("actionVersion", proposal.currentVersion),
          )
          .collect();
        for (const approval of approvals) {
          if (approval.invalidatedAt === undefined) {
            await ctx.db.patch(approval._id, {
              invalidatedAt: now,
              invalidationReason: "care_event_version_changed",
            });
          }
        }
      }
    }
    await appendAuditEvent(ctx, {
      careCircleId: args.careCircleId,
      actor: { kind: "user", opaqueId: authorization.user._id },
      eventType:
        existing === null ? "care_event.created" : "care_event.corrected",
      resourceType: "careEvent",
      resourceId: careEventId,
      resourceVersion: version,
      metadataRedacted: {
        status:
          args.unconfirmedFacts.length === 0 ? "facts_confirmed" : "draft",
      },
      createdAt: now,
    });
    return { careEventId, version, contentHash };
  },
});

/** Ends a private conversation and shortens turn retention after confirmation. */
export const endPrivateConversation = mutation({
  args: {
    careCircleId: v.id("careCircles"),
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, args) => {
    const authorization = await assertCareAuthorization(
      ctx,
      args.careCircleId,
      "elder",
    );
    const conversation = await ctx.db.get(args.conversationId);
    if (
      conversation === null ||
      conversation.careCircleId !== args.careCircleId ||
      conversation.elderUserId !== authorization.user._id
    ) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Private conversation is unavailable.",
      });
    }
    const now = Date.now();
    await ctx.db.patch(conversation._id, {
      status: "completed",
      endedAt: now,
      retentionExpiresAt: Math.min(
        conversation.retentionExpiresAt,
        now + 60 * 60 * 1_000,
      ),
    });
    return { status: "completed" as const };
  },
});

/**
 * Returns role- and consent-filtered event projections.
 * Caregivers never receive private summaries or conversation turns.
 */
export const listVisible = query({
  args: { careCircleId: v.id("careCircles") },
  handler: async (ctx, args) => {
    const authorization = await assertCareAuthorization(ctx, args.careCircleId);
    const events = await ctx.db
      .query("careEvents")
      .withIndex("by_circle_and_status", (queryBuilder) =>
        queryBuilder.eq("careCircleId", args.careCircleId),
      )
      .order("desc")
      .take(50);
    const now = Date.now();
    const projections = await Promise.all(
      events.map(async (event) => {
        const version = await ctx.db
          .query("careEventVersions")
          .withIndex("by_event_and_version", (queryBuilder) =>
            queryBuilder
              .eq("careEventId", event._id)
              .eq("version", event.currentVersion),
          )
          .unique();
        if (version === null) return undefined;
        if (authorization.role === "elder") {
          return {
            id: event._id,
            version: event.currentVersion,
            status: event.status,
            summary: version.originalSummary,
            locale: version.originalLocale,
            visibility: "private_or_shared" as const,
            updatedAt: event.updatedAt,
          };
        }
        const consent = await ctx.db
          .query("consents")
          .withIndex("by_event_and_status", (queryBuilder) =>
            queryBuilder.eq("careEventId", event._id).eq("status", "granted"),
          )
          .filter((queryBuilder) =>
            queryBuilder.gt(queryBuilder.field("expiresAt"), now),
          )
          .first();
        if (
          consent === null ||
          consent.eventVersion !== event.currentVersion ||
          version.disclosureSnapshot === undefined ||
          consent.outboundPayloadHash !==
            version.disclosureSnapshot.aggregateHash
        ) {
          return undefined;
        }
        const recipientCovered = consent.recipientRefs.some(
          (recipient) =>
            recipient.kind === "user" &&
            recipient.id === authorization.user._id,
        );
        if (!recipientCovered || !consent.channels.includes("in_app"))
          return undefined;
        return {
          id: event._id,
          version: event.currentVersion,
          status: event.status,
          summary: version.disclosureSnapshot.caregiverDisclosure.text,
          locale: "en-US" as const,
          visibility: "shared_with_consent" as const,
          updatedAt: event.updatedAt,
        };
      }),
    );
    return projections.filter((projection) => projection !== undefined);
  },
});
