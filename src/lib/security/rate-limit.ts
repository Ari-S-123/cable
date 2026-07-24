/** Configuration for a bounded fixed-window limiter. */
export type RateLimitConfiguration = Readonly<{
  limit: number;
  windowMs: number;
}>;

type Bucket = { count: number; resetAt: number };

/**
 * Process-local defense-in-depth limiter.
 *
 * Convex rate-limit buckets remain authoritative for distributed live actions;
 * this limiter rejects request floods before an API handler performs vendor I/O.
 */
export class FixedWindowRateLimiter {
  readonly #configuration: RateLimitConfiguration;
  readonly #buckets = new Map<string, Bucket>();

  /** Creates a limiter after validating its positive bounds. */
  constructor(configuration: RateLimitConfiguration) {
    if (
      !Number.isSafeInteger(configuration.limit) ||
      configuration.limit <= 0
    ) {
      throw new Error("Rate-limit capacity must be a positive safe integer");
    }
    if (
      !Number.isSafeInteger(configuration.windowMs) ||
      configuration.windowMs <= 0
    ) {
      throw new Error("Rate-limit window must be a positive safe integer");
    }
    this.#configuration = configuration;
  }

  /** Consumes one request and returns the remaining allowance. */
  consume(
    key: string,
    nowEpochMs = Date.now(),
  ): Readonly<{
    allowed: boolean;
    remaining: number;
    resetAt: number;
  }> {
    if (key.length < 1 || key.length > 300)
      throw new Error("Rate-limit key is invalid");
    const existing = this.#buckets.get(key);
    const bucket =
      existing === undefined || existing.resetAt <= nowEpochMs
        ? { count: 0, resetAt: nowEpochMs + this.#configuration.windowMs }
        : existing;
    bucket.count += 1;
    this.#buckets.set(key, bucket);
    return {
      allowed: bucket.count <= this.#configuration.limit,
      remaining: Math.max(0, this.#configuration.limit - bucket.count),
      resetAt: bucket.resetAt,
    };
  }
}
