import type { ChatMessage } from "@/lib/ai/ollama-client";
import { env } from "@/lib/env";
import { ChatProviderUnavailableError } from "./errors";

/**
 * Anthropic Messages API. OPT-IN external provider — see PLANNING.md "External Chat
 * Mode". Only used when CHAT_PROVIDER=anthropic; never called otherwise.
 *
 * The Messages API has no `response_format: json` switch like OpenAI/Gemini. Instead we
 * use the standard "assistant prefill" trick: appending an assistant turn containing
 * just "{" biases the model into continuing a JSON object, and we re-prepend that "{"
 * (the API returns only the continuation, not the prefill itself) before parsing.
 */
export async function generateAnthropicChatCompletion(messages: ChatMessage[]): Promise<string> {
  if (!env.ANTHROPIC_API_KEY) {
    throw new ChatProviderUnavailableError("ANTHROPIC_API_KEY is not set.");
  }

  const systemMessage = messages.find((m) => m.role === "system");
  const conversation = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role, content: m.content }));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.EXTERNAL_CHAT_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: env.ANTHROPIC_MODEL,
        max_tokens: 1024,
        ...(systemMessage ? { system: systemMessage.content } : {}),
        messages: [...conversation, { role: "assistant", content: "{" }],
      }),
    });
  } catch (error) {
    throw new ChatProviderUnavailableError("Could not reach the Anthropic API.", error);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new ChatProviderUnavailableError(`Anthropic API returned HTTP ${response.status}.`);
  }

  const data = (await response.json()) as { content?: Array<{ type?: string; text?: string }> };
  const text = data.content?.find((block) => block.type === "text")?.text;
  if (text === undefined) {
    throw new ChatProviderUnavailableError("Anthropic API did not return any answer content.");
  }

  return `{${text}`;
}
