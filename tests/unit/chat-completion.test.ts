import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ai/ollama-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/ollama-client")>();
  return { ...actual, generateChatCompletion: vi.fn() };
});
vi.mock("@/lib/ai/providers/gemini-client", () => ({ generateGeminiChatCompletion: vi.fn() }));
vi.mock("@/lib/ai/providers/openai-client", () => ({ generateOpenAiChatCompletion: vi.fn() }));
vi.mock("@/lib/ai/providers/anthropic-client", () => ({
  generateAnthropicChatCompletion: vi.fn(),
}));

import {
  OllamaUnavailableError,
  generateChatCompletion as generateOllamaChatCompletion,
} from "@/lib/ai/ollama-client";
import { generateAnthropicChatCompletion } from "@/lib/ai/providers/anthropic-client";
import { generateGeminiChatCompletion } from "@/lib/ai/providers/gemini-client";
import { generateOpenAiChatCompletion } from "@/lib/ai/providers/openai-client";
import { env } from "@/lib/env";
import { ChatProviderUnavailableError, generateChatCompletion } from "@/lib/ai/chat-completion";

const messages = [{ role: "user" as const, content: "hi" }];

describe("generateChatCompletion dispatcher", () => {
  const originalProvider = env.CHAT_PROVIDER;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    env.CHAT_PROVIDER = originalProvider;
  });

  it("routes to Ollama by default (CHAT_PROVIDER=local)", async () => {
    env.CHAT_PROVIDER = "local";
    vi.mocked(generateOllamaChatCompletion).mockResolvedValue("local-response");

    await expect(generateChatCompletion(messages)).resolves.toBe("local-response");
    expect(generateOllamaChatCompletion).toHaveBeenCalledWith(messages);
    expect(generateGeminiChatCompletion).not.toHaveBeenCalled();
  });

  it("routes to Gemini when CHAT_PROVIDER=gemini, and logs a warning for the external call", async () => {
    env.CHAT_PROVIDER = "gemini";
    vi.mocked(generateGeminiChatCompletion).mockResolvedValue("gemini-response");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(generateChatCompletion(messages)).resolves.toBe("gemini-response");

    expect(generateGeminiChatCompletion).toHaveBeenCalledWith(messages);
    expect(generateOllamaChatCompletion).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("WARNING"));
    warnSpy.mockRestore();
  });

  it("routes to OpenAI when CHAT_PROVIDER=openai", async () => {
    env.CHAT_PROVIDER = "openai";
    vi.mocked(generateOpenAiChatCompletion).mockResolvedValue("openai-response");

    await expect(generateChatCompletion(messages)).resolves.toBe("openai-response");
    expect(generateOpenAiChatCompletion).toHaveBeenCalledWith(messages);
  });

  it("routes to Anthropic when CHAT_PROVIDER=anthropic", async () => {
    env.CHAT_PROVIDER = "anthropic";
    vi.mocked(generateAnthropicChatCompletion).mockResolvedValue("anthropic-response");

    await expect(generateChatCompletion(messages)).resolves.toBe("anthropic-response");
    expect(generateAnthropicChatCompletion).toHaveBeenCalledWith(messages);
  });

  it("wraps an OllamaUnavailableError as ChatProviderUnavailableError", async () => {
    env.CHAT_PROVIDER = "local";
    vi.mocked(generateOllamaChatCompletion).mockRejectedValue(new OllamaUnavailableError());

    await expect(generateChatCompletion(messages)).rejects.toBeInstanceOf(
      ChatProviderUnavailableError,
    );
  });
});
