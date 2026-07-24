import { z } from "zod";

/** Result of strict same-origin validation for state-changing route handlers. */
export type OriginDecision = Readonly<{
  allowed: boolean;
  reason?: "MISSING_ORIGIN" | "ORIGIN_MISMATCH" | "MALFORMED_ORIGIN";
}>;

/** Validates Origin against an explicit canonical application URL. */
export function validateOrigin(
  request: Request,
  canonicalApplicationUrl: string,
): OriginDecision {
  const expected = z.url().parse(canonicalApplicationUrl);
  const header = request.headers.get("origin");
  if (header === null) return { allowed: false, reason: "MISSING_ORIGIN" };
  try {
    return new URL(header).origin === new URL(expected).origin
      ? { allowed: true }
      : { allowed: false, reason: "ORIGIN_MISMATCH" };
  } catch {
    return { allowed: false, reason: "MALFORMED_ORIGIN" };
  }
}
