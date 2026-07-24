import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const locale = v.union(v.literal("en-US"), v.literal("hi-IN"));
const role = v.union(v.literal("elder"), v.literal("caregiver"));
const disclosureChannel = v.union(
  v.literal("in_app"),
  v.literal("email"),
  v.literal("sms"),
  v.literal("voice"),
);
const purpose = v.union(
  v.literal("caregiver_review"),
  v.literal("provider_callback"),
  v.literal("appointment_coordination"),
  v.literal("family_checkin"),
  v.literal("operational_alert"),
);
const recipientRef = v.object({
  kind: v.union(v.literal("user"), v.literal("provider_contact")),
  id: v.string(),
  displayLabel: v.string(),
});
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
const modelProvenance = v.object({
  provider: v.union(v.literal("deterministic"), v.literal("fireworks")),
  modelId: v.string(),
  promptVersion: v.string(),
  generatedAt: v.string(),
});
const disclosureRepresentation = v.object({
  locale,
  text: v.string(),
  contentHash: v.string(),
  templateVersion: v.string(),
});
const multilingualDisclosure = v.object({
  elderPreview: disclosureRepresentation,
  canonicalEnglish: disclosureRepresentation,
  caregiverDisclosure: disclosureRepresentation,
  providerDisclosure: disclosureRepresentation,
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

/**
 * Authoritative C.A.B.L.E schema.
 *
 * Stable aggregates store only current state/version pointers. Immutable
 * version tables preserve the exact content to which consent and approval were
 * bound. Supporting tables provide retention, replay protection, rate limits,
 * leasing, delivery history, and append-only audit evidence.
 */
export default defineSchema({
  users: defineTable({
    workosUserId: v.string(),
    displayName: v.string(),
    email: v.optional(v.string()),
    phoneE164: v.optional(v.string()),
    preferredLocale: locale,
    timeZone: v.string(),
    accessibility: v.object({
      textScale: v.number(),
      highContrast: v.boolean(),
      reducedMotion: v.boolean(),
      captions: v.boolean(),
    }),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_workos_user_id", ["workosUserId"])
    .index("by_phone_e164", ["phoneE164"]),

  careCircles: defineTable({
    workosOrganizationId: v.string(),
    elderUserId: v.id("users"),
    displayName: v.string(),
    status: v.union(
      v.literal("active"),
      v.literal("suspended"),
      v.literal("closed"),
    ),
    externalActionsEnabled: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_workos_organization_id", ["workosOrganizationId"])
    .index("by_elder_user_id", ["elderUserId"]),

  memberships: defineTable({
    careCircleId: v.id("careCircles"),
    userId: v.id("users"),
    workosMembershipId: v.string(),
    role,
    relationshipLabel: v.optional(v.string()),
    status: v.union(
      v.literal("pending"),
      v.literal("active"),
      v.literal("suspended"),
      v.literal("ended"),
    ),
    canManageProviderContacts: v.boolean(),
    joinedAt: v.optional(v.number()),
    endedAt: v.optional(v.number()),
  })
    .index("by_circle_and_user", ["careCircleId", "userId"])
    .index("by_user_and_status", ["userId", "status"])
    .index("by_workos_membership_id", ["workosMembershipId"]),

  providerContacts: defineTable({
    careCircleId: v.id("careCircles"),
    displayName: v.string(),
    organizationName: v.string(),
    specialty: v.optional(v.string()),
    email: v.optional(v.string()),
    phoneE164: v.optional(v.string()),
    verifiedChannels: v.array(v.union(v.literal("email"), v.literal("sms"))),
    verificationMethod: v.union(
      v.literal("seeded_demo"),
      v.literal("otp"),
      v.literal("manual_callback"),
    ),
    verifiedAt: v.number(),
    status: v.union(v.literal("active"), v.literal("disabled")),
    isSynthetic: v.boolean(),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_circle_and_status", ["careCircleId", "status"])
    .index("by_circle_and_email", ["careCircleId", "email"])
    .index("by_circle_and_phone", ["careCircleId", "phoneE164"]),

  conversations: defineTable({
    careCircleId: v.id("careCircles"),
    elderUserId: v.id("users"),
    channel: v.union(
      v.literal("browser_voice"),
      v.literal("phone"),
      v.literal("browser_text"),
    ),
    elevenLabsConversationId: v.optional(v.string()),
    locale,
    status: v.union(
      v.literal("active"),
      v.literal("completed"),
      v.literal("abandoned"),
      v.literal("failed"),
    ),
    visibility: v.literal("private"),
    startedAt: v.number(),
    endedAt: v.optional(v.number()),
    retentionExpiresAt: v.number(),
  })
    .index("by_elevenlabs_conversation_id", ["elevenLabsConversationId"])
    .index("by_circle_and_started_at", ["careCircleId", "startedAt"]),

  conversationTurns: defineTable({
    conversationId: v.id("conversations"),
    careCircleId: v.id("careCircles"),
    source: v.union(
      v.literal("elder"),
      v.literal("agent"),
      v.literal("system"),
    ),
    normalizedText: v.string(),
    locale,
    sequence: v.number(),
    createdAt: v.number(),
    retentionExpiresAt: v.number(),
  })
    .index("by_conversation_and_sequence", ["conversationId", "sequence"])
    .index("by_retention_expiry", ["retentionExpiresAt"]),

  voiceSessionNonces: defineTable({
    nonceHash: v.string(),
    careCircleId: v.id("careCircles"),
    elderUserId: v.id("users"),
    locale,
    conversationId: v.optional(v.id("conversations")),
    externalConversationId: v.optional(v.string()),
    expiresAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_nonce_hash", ["nonceHash"])
    .index("by_expiry", ["expiresAt"]),

  careEvents: defineTable({
    careCircleId: v.id("careCircles"),
    elderUserId: v.id("users"),
    conversationId: v.id("conversations"),
    currentVersion: v.number(),
    status: v.union(
      v.literal("draft"),
      v.literal("facts_confirmed"),
      v.literal("consent_pending"),
      v.literal("shared"),
      v.literal("resolved"),
      v.literal("canceled"),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_circle_and_status", ["careCircleId", "status"])
    .index("by_elder_and_updated_at", ["elderUserId", "updatedAt"])
    .index("by_conversation", ["conversationId"]),

  careEventVersions: defineTable({
    careEventId: v.id("careEvents"),
    careCircleId: v.id("careCircles"),
    version: v.number(),
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
    modelProvenance,
    contentHash: v.string(),
    disclosureSnapshot: v.optional(multilingualDisclosure),
    createdBy: v.union(
      v.literal("elder"),
      v.literal("agent"),
      v.literal("caregiver"),
    ),
    createdAt: v.number(),
  })
    .index("by_event_and_version", ["careEventId", "version"])
    .index("by_circle_and_created_at", ["careCircleId", "createdAt"]),

  consents: defineTable({
    careCircleId: v.id("careCircles"),
    elderUserId: v.id("users"),
    careEventId: v.id("careEvents"),
    eventVersion: v.number(),
    status: v.union(
      v.literal("requested"),
      v.literal("granted"),
      v.literal("denied"),
      v.literal("revoked"),
      v.literal("expired"),
      v.literal("superseded"),
    ),
    allowedFieldPaths: v.array(v.string()),
    canonicalPayloadHash: v.string(),
    outboundPayloadHash: v.string(),
    elderPreviewHash: v.string(),
    recipientRefs: v.array(recipientRef),
    channels: v.array(disclosureChannel),
    purpose,
    promptText: v.string(),
    responseText: v.string(),
    locale,
    templateVersion: v.string(),
    sourceTurnId: v.string(),
    requestedAt: v.number(),
    grantedAt: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
  })
    .index("by_event_and_status", ["careEventId", "status"])
    .index("by_elder_and_status", ["elderUserId", "status"])
    .index("by_expiry", ["expiresAt"]),

  actionProposals: defineTable({
    careCircleId: v.id("careCircles"),
    careEventId: v.id("careEvents"),
    consentId: v.id("consents"),
    currentVersion: v.number(),
    status: v.union(
      v.literal("proposed"),
      v.literal("awaiting_approval"),
      v.literal("approved"),
      v.literal("queued"),
      v.literal("executing"),
      v.literal("completed"),
      v.literal("rejected"),
      v.literal("invalidated"),
      v.literal("retryable_failure"),
      v.literal("permanent_failure"),
      v.literal("delivery_unknown"),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_event_and_status", ["careEventId", "status"])
    .index("by_circle_and_updated_at", ["careCircleId", "updatedAt"]),

  actionProposalVersions: defineTable({
    actionProposalId: v.id("actionProposals"),
    careCircleId: v.id("careCircles"),
    careEventId: v.id("careEvents"),
    eventVersion: v.number(),
    consentId: v.id("consents"),
    version: v.number(),
    actionType: v.union(
      v.literal("send_provider_email"),
      v.literal("send_provider_sms"),
      v.literal("request_caregiver_call"),
      v.literal("retry_checkin"),
      v.literal("mark_resolved"),
    ),
    recipientRef,
    channel: disclosureChannel,
    purpose,
    payloadSnapshot: v.object({
      subject: v.optional(v.string()),
      body: v.string(),
      callbackPreference: v.optional(v.string()),
      opaqueReference: v.string(),
    }),
    payloadHash: v.string(),
    disclosureAggregateHash: v.string(),
    explanation: v.string(),
    limitations: v.array(v.string()),
    expiresAt: v.number(),
    createdBy: v.union(v.literal("agent"), v.literal("caregiver")),
    createdByUserId: v.optional(v.id("users")),
    createdAt: v.number(),
  })
    .index("by_proposal_and_version", ["actionProposalId", "version"])
    .index("by_event_and_created_at", ["careEventId", "createdAt"]),

  approvals: defineTable({
    careCircleId: v.id("careCircles"),
    actionProposalId: v.id("actionProposals"),
    actionVersion: v.number(),
    caregiverUserId: v.id("users"),
    decision: v.union(v.literal("approved"), v.literal("rejected")),
    payloadHash: v.string(),
    decidedAt: v.number(),
    comment: v.optional(v.string()),
    invalidatedAt: v.optional(v.number()),
    invalidationReason: v.optional(v.string()),
  }).index("by_action_and_version", ["actionProposalId", "actionVersion"]),

  policyValidations: defineTable({
    actionProposalId: v.id("actionProposals"),
    actionVersion: v.number(),
    payloadHash: v.string(),
    validatorVersion: v.string(),
    validatorHash: v.string(),
    daytonaSandboxIdHash: v.string(),
    decision: v.union(v.literal("pass"), v.literal("fail")),
    failedRules: v.array(v.string()),
    validatedAt: v.number(),
    expiresAt: v.number(),
  }).index("by_action_version_and_hash", [
    "actionProposalId",
    "actionVersion",
    "payloadHash",
  ]),

  notifications: defineTable({
    careCircleId: v.id("careCircles"),
    actionProposalId: v.optional(v.id("actionProposals")),
    actionVersion: v.optional(v.number()),
    consentId: v.optional(v.id("consents")),
    recipientRef,
    channel: disclosureChannel,
    category: v.union(
      v.literal("care_update"),
      v.literal("approval_needed"),
      v.literal("provider_message"),
      v.literal("delivery_update"),
      v.literal("operational_alert"),
    ),
    payloadSnapshot: v.object({
      subject: v.optional(v.string()),
      body: v.string(),
    }),
    payloadHash: v.string(),
    status: v.union(
      v.literal("queued"),
      v.literal("sending"),
      v.literal("accepted"),
      v.literal("delivered"),
      v.literal("retryable_failure"),
      v.literal("permanent_failure"),
      v.literal("delivery_unknown"),
      v.literal("canceled"),
    ),
    externalMessageId: v.optional(v.string()),
    idempotencyKey: v.string(),
    attemptCount: v.number(),
    lastErrorCode: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_idempotency_key", ["idempotencyKey"])
    .index("by_external_message_id", ["externalMessageId"])
    .index("by_circle_and_created_at", ["careCircleId", "createdAt"])
    .index("by_status_and_updated_at", ["status", "updatedAt"]),

  outboxJobs: defineTable({
    notificationId: v.id("notifications"),
    status: v.union(
      v.literal("pending"),
      v.literal("leased"),
      v.literal("completed"),
      v.literal("dead_letter"),
      v.literal("canceled"),
    ),
    availableAt: v.number(),
    leaseTokenHash: v.optional(v.string()),
    leaseExpiresAt: v.optional(v.number()),
    attemptCount: v.number(),
    maxAttempts: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status_and_available_at", ["status", "availableAt"])
    .index("by_notification_id", ["notificationId"]),

  deliveryStateEvents: defineTable({
    notificationId: v.id("notifications"),
    provider: v.union(
      v.literal("deterministic"),
      v.literal("resend"),
      v.literal("twilio"),
    ),
    previousStatus: v.optional(v.string()),
    nextStatus: v.string(),
    providerEventId: v.optional(v.string()),
    externalMessageId: v.optional(v.string()),
    metadataRedacted: v.object({ providerCode: v.optional(v.string()) }),
    occurredAt: v.number(),
    recordedAt: v.number(),
  })
    .index("by_notification_and_recorded_at", ["notificationId", "recordedAt"])
    .index("by_provider_event_id", ["providerEventId"]),

  checkinSchedules: defineTable({
    careCircleId: v.id("careCircles"),
    elderUserId: v.id("users"),
    createdByUserId: v.id("users"),
    locale,
    timeZone: v.string(),
    localTime: v.string(),
    recurrence: v.union(
      v.literal("once"),
      v.literal("daily"),
      v.literal("weekly"),
    ),
    nextRunAt: v.number(),
    status: v.union(
      v.literal("active"),
      v.literal("paused"),
      v.literal("completed"),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_status_and_next_run", ["status", "nextRunAt"]),

  operationalAlertPreferences: defineTable({
    careCircleId: v.id("careCircles"),
    elderUserId: v.id("users"),
    caregiverUserIds: v.array(v.id("users")),
    missedCheckinEnabled: v.boolean(),
    channels: v.array(
      v.union(v.literal("in_app"), v.literal("email"), v.literal("sms")),
    ),
    attentionOnly: v.literal(true),
    updatedAt: v.number(),
  }).index("by_circle", ["careCircleId"]),

  webhookReceipts: defineTable({
    provider: v.union(
      v.literal("workos"),
      v.literal("elevenlabs"),
      v.literal("twilio"),
      v.literal("resend"),
    ),
    eventId: v.string(),
    eventType: v.string(),
    payloadHash: v.string(),
    signatureTimestamp: v.optional(v.number()),
    receivedAt: v.number(),
    processedAt: v.optional(v.number()),
    status: v.union(
      v.literal("accepted"),
      v.literal("processed"),
      v.literal("rejected"),
    ),
  })
    .index("by_provider_and_event_id", ["provider", "eventId"])
    .index("by_received_at", ["receivedAt"]),

  rateLimitBuckets: defineTable({
    keyHash: v.string(),
    action: v.string(),
    windowStartedAt: v.number(),
    count: v.number(),
    expiresAt: v.number(),
  })
    .index("by_key_action_window", ["keyHash", "action", "windowStartedAt"])
    .index("by_expiry", ["expiresAt"]),

  auditEvents: defineTable({
    careCircleId: v.id("careCircles"),
    actor: v.object({
      kind: v.union(
        v.literal("user"),
        v.literal("agent"),
        v.literal("system"),
        v.literal("webhook"),
      ),
      opaqueId: v.string(),
    }),
    eventType: v.string(),
    resourceType: v.string(),
    resourceId: v.string(),
    resourceVersion: v.optional(v.number()),
    policyDecision: v.optional(
      v.object({ code: v.string(), ruleVersion: v.string() }),
    ),
    metadataRedacted: v.object({
      status: v.optional(v.string()),
      channel: v.optional(v.string()),
      correlationId: v.optional(v.string()),
    }),
    previousEventHash: v.optional(v.string()),
    eventHash: v.string(),
    createdAt: v.number(),
  })
    .index("by_circle_and_created_at", ["careCircleId", "createdAt"])
    .index("by_resource", ["resourceType", "resourceId"])
    .index("by_event_type_and_created_at", ["eventType", "createdAt"]),
});
