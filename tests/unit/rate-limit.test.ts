import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { checkRateLimit, resetRateLimits } from "@/lib/auth/rate-limit";

afterEach(() => {
  resetRateLimits();
});

describe("checkRateLimit", () => {
  it("allows attempts up to the configured max", () => {
    const key = randomUUID();
    for (let i = 0; i < 3; i++) {
      expect(checkRateLimit("test", key, 3, 60_000).allowed).toBe(true);
    }
  });

  it("blocks the attempt once the max is exceeded within the window", () => {
    const key = randomUUID();
    checkRateLimit("test", key, 2, 60_000);
    checkRateLimit("test", key, 2, 60_000);
    const result = checkRateLimit("test", key, 2, 60_000);
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it("keeps separate buckets per key", () => {
    const keyA = randomUUID();
    const keyB = randomUUID();
    checkRateLimit("test", keyA, 1, 60_000);
    expect(checkRateLimit("test", keyA, 1, 60_000).allowed).toBe(false);
    expect(checkRateLimit("test", keyB, 1, 60_000).allowed).toBe(true);
  });

  it("keeps separate buckets per bucket name for the same key", () => {
    const key = randomUUID();
    checkRateLimit("login", key, 1, 60_000);
    expect(checkRateLimit("login", key, 1, 60_000).allowed).toBe(false);
    expect(checkRateLimit("upload", key, 1, 60_000).allowed).toBe(true);
  });

  it("allows attempts again once the window has fully elapsed", () => {
    const key = randomUUID();
    expect(checkRateLimit("test", key, 1, 1).allowed).toBe(true);
    expect(checkRateLimit("test", key, 1, 1).allowed).toBe(false);
    return new Promise((resolve) => {
      setTimeout(() => {
        expect(checkRateLimit("test", key, 1, 1).allowed).toBe(true);
        resolve(undefined);
      }, 20);
    });
  });
});
