import { describe, expect, it } from "vitest";
import { createRateLimiter } from "../../server/rate_limit";

describe("rate limiter storage", () => {
  it("never exceeds its configured bucket bound", () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 2, maxBuckets: 3 });

    limiter("client-1");
    limiter("client-2");
    limiter("client-3");
    limiter("client-4");

    expect(limiter.bucketCount()).toBe(3);
    expect(limiter("client-1").allowed).toBe(true);
    expect(limiter.bucketCount()).toBe(3);
  });

  it("reclaims expired buckets before evicting active ones", () => {
    let timestamp = 1_000;
    const limiter = createRateLimiter(
      { windowMs: 100, max: 1, maxBuckets: 2 },
      () => timestamp,
    );

    limiter("expired-1");
    limiter("expired-2");
    timestamp = 1_101;
    limiter("current");

    expect(limiter.bucketCount()).toBe(1);
    expect(limiter("current")).toMatchObject({ allowed: false, remaining: 0 });
  });

  it("rejects invalid limiter configuration", () => {
    expect(() => createRateLimiter({ windowMs: 0, max: 1 })).toThrow(RangeError);
    expect(() => createRateLimiter({ windowMs: 1_000, max: 0 })).toThrow(RangeError);
    expect(() =>
      createRateLimiter({ windowMs: 1_000, max: 1, maxBuckets: 0 }),
    ).toThrow(RangeError);
  });
});
