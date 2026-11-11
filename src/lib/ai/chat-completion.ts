import {
  type ChatMessage,
  OllamaUnavailableError,
  generateChatCompletion as generateOllamaChatCompletion,
} from "@/lib/ai/ollama-client";
import { env } from "@/lib/env";
import { generateAnthropicChatCompletion } from "./providers/anthropic-client";
import { ChatProviderUnavailableError } from "./providers/errors";
import { generateGeminiChatCompletion } from "./providers/gemini-client";
import { generateOpenAiChatCompletion } from "./providers/openai-client";

export type { ChatMessage };
export { ChatProviderUnavailableError };

let warnedExternalProvider = false;

/**
 * Single entry point the chat usecase calls — which provider actually runs is decided
 * entirely by CHAT_PROVIDER (default "local"/Ollama). This is the one place PLANNING.md's
 * "no external AI" exception is exercised; see PLANNING.md "External Chat Mode".
 */
export async function generateChatCompletion(messages: ChatMessage[]): Promise<string> {
  if (env.CHAT_PROVIDER !== "local" && !warnedExternalProvider) {
    warnedExternalProvider = true;
    console.warn(
      `[chat-completion] WARNING: CHAT_PROVIDER="${env.CHAT_PROVIDER}" is active — user questions ` +
        "and retrieved document chunks will be sent to this third-party API. Demo/dev mode only — " +
        "do not use with real company documents (see PLANNING.md 'External Chat Mode').",
    );
  }

  try {
    switch (env.CHAT_PROVIDER) {
      case "gemini":
        return await generateGeminiChatCompletion(messages);
      case "openai":
        return await generateOpenAiChatCompletion(messages);
      case "anthropic":
        return await generateAnthropicChatCompletion(messages);
      case "local":
      default:
        return await generateOllamaChatCompletion(messages);
    }
  } catch (error) {
    if (error instanceof OllamaUnavailableError) {
      throw new ChatProviderUnavailableError(error.message, error);
    }
    throw error;
  }
}
