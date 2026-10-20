/**
 * In-memory sliding-window rate limiter. Single-process only — state is a module-level
 * Map, so it resets on restart and does not coordinate across multiple instances. That
 * is an accepted prototype limitation (PLANNING.md #11): a real multi-instance
 * deployment needs a shared store (e.g. Redis) instead.
 */
const hits = new Map<string, number[]>();

export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs: number;
}

export function checkRateLimit(
  bucket: string,
  key: string,
  maxAttempts: number,
  windowMs: number,
): RateLimitResult {
  const mapKey = `${bucket}:${key}`;
  const now = Date.now();
  const windowStart = now - windowMs;

  const existing = (hits.get(mapKey) ?? []).filter((timestamp) => timestamp > windowStart);

  if (existing.length >= maxAttempts) {
    const retryAfterMs = existing[0] + windowMs - now;
    hits.set(mapKey, existing);
    return { allowed: false, retryAfterMs: Math.max(retryAfterMs, 0) };
  }

  existing.push(now);
  hits.set(mapKey, existing);
  return { allowed: true, retryAfterMs: 0 };
}

/** Test-only: clears all recorded hits so suites don't leak rate-limit state across cases. */
export function resetRateLimits(): void {
  hits.clear();
}
