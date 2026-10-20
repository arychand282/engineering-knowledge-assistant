import type { ChatMessage } from "@/lib/ai/ollama-client";
import { env } from "@/lib/env";
import { ChatProviderUnavailableError } from "./errors";

/**
 * OpenAI Chat Completions. OPT-IN external provider — see PLANNING.md "Mode Chat
 * Eksternal". Only used when CHAT_PROVIDER=openai; never called otherwise.
 */
export async function generateOpenAiChatCompletion(messages: ChatMessage[]): Promise<string> {
  if (!env.OPENAI_API_KEY) {
    throw new ChatProviderUnavailableError("OPENAI_API_KEY tidak diisi.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.EXTERNAL_CHAT_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: env.OPENAI_MODEL,
        messages,
        response_format: { type: "json_object" },
      }),
    });
  } catch (error) {
    throw new ChatProviderUnavailableError("OpenAI API tidak dapat dihubungi.", error);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new ChatProviderUnavailableError(`OpenAI API mengembalikan HTTP ${response.status}.`);
  }

  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = data.choices?.[0]?.message?.content;
  if (!text) {
    throw new ChatProviderUnavailableError("OpenAI API tidak mengembalikan konten jawaban.");
  }

  return text;
}
