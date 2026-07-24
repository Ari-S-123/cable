import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  canonicalHash,
  canonicalJson,
  normalizeEmail,
  normalizePhoneE164,
} from "../../src/lib/policy/canonicalize";

describe("versioned canonicalization", () => {
  it("sorts keys, normalizes Unicode and line endings, and omits undefined", () => {
    const first = canonicalJson({
      z: undefined,
      text: "Cafe\u0301\r\nline",
      a: 1,
    });
    const second = canonicalJson({ a: 1, text: "Café\nline" });
    expect(first).toBe('{"a":1,"text":"Café\\nline"}');
    expect(first).toBe(second);
    expect(canonicalHash({ text: "Cafe\u0301" })).toBe(
      canonicalHash({ text: "Café" }),
    );
  });

  it("normalizes identifier-shaped email and phone fields before hashing", () => {
    expect(normalizeEmail("  PERSON@Example.COM ")).toBe("person@example.com");
    expect(normalizePhoneE164("+1 (415) 555-0123")).toBe("+14155550123");
    expect(() => normalizePhoneE164("555-0123")).toThrow(/E\.164/u);
  });

  it("uses the documented cable:v1 prefix", () => {
    const json = canonicalJson({ stable: true });
    const expected = createHash("sha256")
      .update(`cable:v1:${json}`)
      .digest("hex");
    expect(canonicalHash({ stable: true })).toBe(expected);
  });

  it("rejects unsupported non-finite and undefined array values", () => {
    expect(() => canonicalJson({ value: Number.NaN })).toThrow(/Non-finite/u);
    expect(() => canonicalJson(["allowed", undefined])).toThrow(
      /Undefined array/u,
    );
  });
});
