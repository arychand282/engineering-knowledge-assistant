import { afterEach, describe, expect, it, vi } from "vitest";

describe("env defaults", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("falls back to development APP_URL when unset", async () => {
    vi.stubEnv("NODE_ENV", "test");
    delete process.env.APP_URL;

    const { env } = await import("@/lib/env");

    expect(env.APP_URL).toBe("http://localhost:3000");
  });
});
