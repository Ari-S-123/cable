import { createHash } from "node:crypto";

/** Values accepted by the versioned canonical serializer. */
export type CanonicalInput =
  | string
  | number
  | boolean
  | Date
  | undefined
  | readonly CanonicalInput[]
  | { readonly [key: string]: CanonicalInput };

const EMAIL_KEY = /(?:^|_)(?:email|emailAddress)$/iu;
const PHONE_KEY = /(?:^|_)(?:phone|phoneE164|phoneNumber)$/iu;

/** Normalizes user-controlled strings without changing their semantic content. */
function normalizeString(value: string): string {
  return value.normalize("NFC").replaceAll("\r\n", "\n").replaceAll("\r", "\n");
}

/** Normalizes an email address for identity- and content-hash comparison. */
export function normalizeEmail(value: string): string {
  return normalizeString(value).trim().toLocaleLowerCase("en-US");
}

/**
 * Converts a phone number to a conservative E.164 representation.
 *
 * The prototype accepts an optional leading plus and 8–15 digits. It rejects
 * extensions and ambiguous local numbers instead of guessing a country code.
 */
export function normalizePhoneE164(value: string): string {
  const compact = value.trim().replace(/[\s().-]/gu, "");
  const withPlus = compact.startsWith("+") ? compact : `+${compact}`;
  if (!/^\+[1-9]\d{7,14}$/u.test(withPlus)) {
    throw new Error("Phone number must be an unambiguous E.164 number");
  }
  return withPlus;
}

/** Converts one unknown scalar into a canonical JSON-safe scalar. */
function canonicalizeScalar(
  value: string | number | boolean | Date,
  key?: string,
): string | number | boolean {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new Error("Invalid Date values cannot be canonicalized");
    }
    return value.toISOString();
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Non-finite numbers cannot be canonicalized");
    }
    return Object.is(value, -0) ? 0 : value;
  }
  if (typeof value === "string") {
    if (key !== undefined && EMAIL_KEY.test(key)) return normalizeEmail(value);
    if (key !== undefined && PHONE_KEY.test(key))
      return normalizePhoneE164(value);
    return normalizeString(value);
  }
  return value;
}

/** Recursively sorts keys and removes undefined object properties. */
function canonicalizeValue(value: CanonicalInput, key?: string): unknown {
  if (value === undefined) return undefined;
  if (typeof value !== "object" || value instanceof Date) {
    return canonicalizeScalar(value, key);
  }
  if (Array.isArray(value)) {
    return value.map((item) => {
      const normalized = canonicalizeValue(item);
      if (normalized === undefined) {
        throw new Error("Undefined array elements cannot be canonicalized");
      }
      return normalized;
    });
  }
  const entries = Object.entries(value)
    .filter(
      (entry): entry is [string, CanonicalInput] => entry[1] !== undefined,
    )
    .sort(([left], [right]) => left.localeCompare(right, "en-US"));
  return Object.fromEntries(
    entries.map(([entryKey, entryValue]) => [
      entryKey,
      canonicalizeValue(entryValue, entryKey),
    ]),
  );
}

/** Serializes a value with C.A.B.L.E canonicalization version 1. */
export function canonicalJson(value: CanonicalInput): string {
  const serialized = JSON.stringify(canonicalizeValue(value));
  if (serialized === undefined) {
    throw new Error("The canonical payload must contain a JSON value");
  }
  return serialized;
}

/** Computes `sha256("cable:v1:" + canonicalJson)` as lowercase hexadecimal. */
export function canonicalHash(value: CanonicalInput): string {
  return createHash("sha256")
    .update(`cable:v1:${canonicalJson(value)}`, "utf8")
    .digest("hex");
}

/** Computes a direct SHA-256 digest for version and artifact fingerprints. */
export function sha256(value: string): string {
  return createHash("sha256")
    .update(value.normalize("NFC"), "utf8")
    .digest("hex");
}
