export type RateLimitConfig = {
  windowMs: number;
  max: number;
  maxBuckets?: number;
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfterMs?: number;
};

type Bucket = {
  count: number;
  resetAt: number;
};

export type RateLimiter = {
  (key: string): RateLimitResult;
  bucketCount: () => number;
};

const DEFAULT_MAX_BUCKETS = 10_000;

export function createRateLimiter(
  config: RateLimitConfig,
  now: () => number = Date.now,
): RateLimiter {
  const maxBuckets = config.maxBuckets ?? DEFAULT_MAX_BUCKETS;
  if (
    !Number.isInteger(config.windowMs) ||
    config.windowMs <= 0 ||
    !Number.isInteger(config.max) ||
    config.max <= 0 ||
    !Number.isInteger(maxBuckets) ||
    maxBuckets <= 0
  ) {
    throw new RangeError("Rate-limit values must be positive integers");
  }

  const buckets = new Map<string, Bucket>();

  function pruneExpired(timestamp: number): void {
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= timestamp) {
        buckets.delete(key);
      }
    }
  }

  function makeSpace(timestamp: number): void {
    if (buckets.size < maxBuckets) {
      return;
    }
    pruneExpired(timestamp);
    while (buckets.size >= maxBuckets) {
      const oldestKey = buckets.keys().next().value as string | undefined;
      if (oldestKey === undefined) {
        return;
      }
      buckets.delete(oldestKey);
    }
  }

  const limit = ((key: string): RateLimitResult => {
    const timestamp = now();
    const existing = buckets.get(key);
    if (!existing || existing.resetAt <= timestamp) {
      if (existing) {
        buckets.delete(key);
      }
      makeSpace(timestamp);
      const resetAt = timestamp + config.windowMs;
      buckets.set(key, { count: 1, resetAt });
      return {
        allowed: true,
        remaining: config.max - 1,
        resetAt,
      };
    }

    existing.count += 1;
    if (existing.count > config.max) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: existing.resetAt,
        retryAfterMs: existing.resetAt - timestamp,
      };
    }

    return {
      allowed: true,
      remaining: config.max - existing.count,
      resetAt: existing.resetAt,
    };
  }) as RateLimiter;

  limit.bucketCount = () => buckets.size;
  return limit;
}
