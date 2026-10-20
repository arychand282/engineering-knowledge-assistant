import { describe, expect, it } from "vitest";
import { generateSessionToken, hashSessionToken } from "@/lib/auth/session-token";

describe("session token", () => {
  it("generates distinct, reasonably long tokens", () => {
    const a = generateSessionToken();
    const b = generateSessionToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(32);
  });

  it("hashes the same token identically every time", () => {
    const token = generateSessionToken();
    expect(hashSessionToken(token)).toBe(hashSessionToken(token));
  });

  it("hashes different tokens to different values", () => {
    const a = generateSessionToken();
    const b = generateSessionToken();
    expect(hashSessionToken(a)).not.toBe(hashSessionToken(b));
  });
});
