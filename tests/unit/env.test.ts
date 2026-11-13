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

  it("defaults CHAT_PROVIDER to local with no API key required", async () => {
    delete process.env.CHAT_PROVIDER;
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    const { env } = await import("@/lib/env");

    expect(env.CHAT_PROVIDER).toBe("local");
  });

  it.each(["gemini", "openai", "anthropic"] as const)(
    "throws when CHAT_PROVIDER=%s is set without its API key",
    async (provider) => {
      vi.stubEnv("CHAT_PROVIDER", provider);
      delete process.env.GEMINI_API_KEY;
      delete process.env.OPENAI_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;

      await expect(import("@/lib/env")).rejects.toThrow(/must be set/);
    },
  );

  it("loads successfully when the matching API key is provided", async () => {
    vi.stubEnv("CHAT_PROVIDER", "gemini");
    vi.stubEnv("GEMINI_API_KEY", "test-key");

    const { env } = await import("@/lib/env");

    expect(env.CHAT_PROVIDER).toBe("gemini");
    expect(env.GEMINI_API_KEY).toBe("test-key");
  });

  it("defaults EMBEDDING_PROVIDER to local with no API key required", async () => {
    delete process.env.EMBEDDING_PROVIDER;
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    const { env } = await import("@/lib/env");

    expect(env.EMBEDDING_PROVIDER).toBe("local");
  });

  it.each(["gemini", "openai"] as const)(
    "throws when EMBEDDING_PROVIDER=%s is set without its API key",
    async (provider) => {
      vi.stubEnv("EMBEDDING_PROVIDER", provider);
      delete process.env.GEMINI_API_KEY;
      delete process.env.OPENAI_API_KEY;

      await expect(import("@/lib/env")).rejects.toThrow(/must be set/);
    },
  );

  it("loads successfully when EMBEDDING_PROVIDER and CHAT_PROVIDER are set independently", async () => {
    vi.stubEnv("EMBEDDING_PROVIDER", "openai");
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubEnv("CHAT_PROVIDER", "local");

    const { env } = await import("@/lib/env");

    expect(env.EMBEDDING_PROVIDER).toBe("openai");
    expect(env.CHAT_PROVIDER).toBe("local");
  });
});
