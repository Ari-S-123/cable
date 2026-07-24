/** JSON-compatible input accepted by the Convex audit canonicalizer. */
export type AuditCanonicalInput =
  | string
  | number
  | boolean
  | undefined
  | readonly AuditCanonicalInput[]
  | { readonly [key: string]: AuditCanonicalInput };

/** Recursively normalizes strings, removes undefined fields, and sorts keys. */
function normalize(value: AuditCanonicalInput): unknown {
  if (value === undefined) return undefined;
  if (typeof value === "string") {
    return value
      .normalize("NFC")
      .replaceAll("\r\n", "\n")
      .replaceAll("\r", "\n");
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw new Error("Non-finite audit values are forbidden");
    return Object.is(value, -0) ? 0 : value;
  }
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value.map((item) => {
      const normalized = normalize(item);
      if (normalized === undefined)
        throw new Error("Undefined audit array entries are forbidden");
      return normalized;
    });
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(
        (entry): entry is [string, AuditCanonicalInput] =>
          entry[1] !== undefined,
      )
      .sort(([left], [right]) => left.localeCompare(right, "en-US"))
      .map(([key, child]) => [key, normalize(child)]),
  );
}

/** Computes the versioned SHA-256 audit-chain hash in the Convex runtime. */
export async function auditHash(input: AuditCanonicalInput): Promise<string> {
  const json = JSON.stringify(normalize(input));
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`cable:v1:${json}`),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

/** Computes a keyed, domain-separated HMAC for the append-only audit chain. */
export async function auditHmac(
  input: AuditCanonicalInput,
  secret: string,
): Promise<string> {
  if (secret.length < 32) {
    throw new Error("AUDIT_HASH_SECRET must contain at least 32 characters");
  }
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(
      `cable:audit:v1:${JSON.stringify(normalize(input))}`,
    ),
  );
  return Array.from(new Uint8Array(signature), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
