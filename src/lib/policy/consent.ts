import type {
  DisclosureChannel,
  DisclosureDecision,
  Locale,
  Purpose,
} from "@/lib/contracts";

/** Inputs from the authoritative consent ledger required for disclosure. */
export type DisclosureEvaluationInput = Readonly<{
  authenticated: boolean;
  activeRelationship: boolean;
  consentId?: string;
  consentStatus?:
    "requested" | "granted" | "denied" | "revoked" | "expired" | "superseded";
  consentExpiresAt?: number;
  coveredRecipientIds: readonly string[];
  coveredChannels: readonly DisclosureChannel[];
  coveredPurpose?: Purpose;
  expectedContentHash?: string;
  actualContentHash: string;
  expectedTranslationHash?: string;
  actualTranslationHash?: string;
  recipientId: string;
  channel: DisclosureChannel;
  purpose: Purpose;
  nowEpochMs: number;
}>;

/** Evaluates one disclosure without reading data or causing a side effect. */
export function evaluateDisclosure(
  input: DisclosureEvaluationInput,
): DisclosureDecision {
  if (!input.authenticated)
    return { allowed: false, reason: "UNAUTHENTICATED" };
  if (!input.activeRelationship)
    return { allowed: false, reason: "INACTIVE_RELATIONSHIP" };
  if (input.consentId === undefined || input.consentStatus === undefined) {
    return { allowed: false, reason: "NO_CONSENT" };
  }
  if (input.consentStatus === "revoked")
    return { allowed: false, reason: "CONSENT_REVOKED" };
  if (input.consentStatus === "expired")
    return { allowed: false, reason: "CONSENT_EXPIRED" };
  if (input.consentStatus !== "granted")
    return { allowed: false, reason: "NO_CONSENT" };
  if (
    input.consentExpiresAt === undefined ||
    input.consentExpiresAt <= input.nowEpochMs
  ) {
    return { allowed: false, reason: "CONSENT_EXPIRED" };
  }
  if (!input.coveredRecipientIds.includes(input.recipientId)) {
    return { allowed: false, reason: "RECIPIENT_NOT_COVERED" };
  }
  if (!input.coveredChannels.includes(input.channel)) {
    return { allowed: false, reason: "CHANNEL_NOT_COVERED" };
  }
  if (input.coveredPurpose !== input.purpose) {
    return { allowed: false, reason: "PURPOSE_NOT_COVERED" };
  }
  if (input.expectedContentHash !== input.actualContentHash) {
    return { allowed: false, reason: "CONTENT_MISMATCH" };
  }
  if (
    input.expectedTranslationHash !== undefined &&
    input.expectedTranslationHash !== input.actualTranslationHash
  ) {
    return { allowed: false, reason: "TRANSLATION_MISMATCH" };
  }
  return {
    allowed: true,
    consentId: input.consentId,
    contentHash: input.actualContentHash,
  };
}

/** Conservative normalized outcomes for a spoken or typed consent response. */
export type ConsentClassification = "granted" | "denied" | "ambiguous";

const explicitYes: Readonly<Record<Locale, ReadonlySet<string>>> = {
  "en-US": new Set(["yes", "yes share this", "i consent", "i clearly agree"]),
  "hi-IN": new Set([
    "हाँ",
    "हां",
    "हाँ साझा करें",
    "मैं स्पष्ट रूप से सहमत हूँ",
  ]),
};

const explicitNo: Readonly<Record<Locale, ReadonlySet<string>>> = {
  "en-US": new Set(["no", "do not share", "keep this private", "stop"]),
  "hi-IN": new Set(["नहीं", "साझा न करें", "इसे निजी रखें", "रुकिए"]),
};

/** Normalizes response punctuation while preserving script and semantic wording. */
function normalizeConsentResponse(response: string, locale: Locale): string {
  return response
    .normalize("NFC")
    .toLocaleLowerCase(locale)
    .replace(/[.,!?;:"'“”‘’।]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

/**
 * Classifies only reviewed exact consent phrases.
 *
 * Negatives and stop phrases deny. Everything else—including qualified yes,
 * silence, and model-generated paraphrases—is ambiguous and cannot grant.
 */
export function classifyConsentResponse(
  response: string,
  locale: Locale,
): ConsentClassification {
  const normalized = normalizeConsentResponse(response, locale);
  if (explicitNo[locale].has(normalized)) return "denied";
  if (explicitYes[locale].has(normalized)) return "granted";
  return "ambiguous";
}

/** Returns the bounded consent expiry: 24 hours or event deadline, whichever is earlier. */
export function calculateConsentExpiry(
  nowEpochMs: number,
  eventDeadlineEpochMs?: number,
): number {
  if (!Number.isSafeInteger(nowEpochMs) || nowEpochMs < 0) {
    throw new Error("nowEpochMs must be a non-negative safe integer");
  }
  const maximum = nowEpochMs + 24 * 60 * 60 * 1000;
  if (eventDeadlineEpochMs === undefined) return maximum;
  if (
    !Number.isSafeInteger(eventDeadlineEpochMs) ||
    eventDeadlineEpochMs <= nowEpochMs
  ) {
    throw new Error(
      "The event deadline must be a safe integer after the grant time",
    );
  }
  return Math.min(maximum, eventDeadlineEpochMs);
}
