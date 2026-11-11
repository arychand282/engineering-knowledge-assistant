import { checkRateLimit } from "@/lib/auth/rate-limit";
import { env } from "@/lib/env";
import { findUserById } from "@/server/repositories/user.repository";
import {
  findWhatsappLinkByPhone,
  setCurrentConversation,
} from "@/server/repositories/whatsapp-link.repository";
import { askQuestion, type AskQuestionResult } from "@/server/usecases/chat/ask-question.usecase";

export interface IncomingWhatsappMessage {
  /** Already-normalized digits-only phone number (see normalizePhoneNumber in
   * server/dto/whatsapp.dto.ts) — each provider is responsible for normalizing its own
   * sender-id format (JID local part for Baileys, the `from` field for Meta) before
   * calling this. */
  phoneNumber: string;
  text: string;
}

const NOT_REGISTERED_MESSAGE =
  "This number is not registered to use this assistant. Contact an admin to link your number to the right account.";

const RATE_LIMITED_MESSAGE = "Too many questions in a short time. Please try again later.";

/**
 * Shared core for every WhatsApp provider (Baileys now, Meta Cloud API once
 * scaffolded in) — providers only deal with HOW a message arrives and HOW a reply gets
 * sent; identity resolution, rate limiting, and the actual RAG pipeline all live here
 * exactly once.
 *
 * Identity: resolves the sender's phone number to an app user via the admin-assigned
 * link (whatsapp_links) — an unregistered number or a deactivated account gets the same
 * "not registered" reply, same IDOR-safety reasoning as documents' 404-not-403 pattern
 * (don't reveal *why* access is denied, just that it is).
 *
 * Rate limiting: shares the exact same "chat" bucket + CHAT_RATE_LIMIT_* config as the
 * web chat endpoint, keyed by the resolved userId — so a user can't bypass the web
 * chat's rate limit by sending the same volume of questions over WhatsApp instead.
 *
 * Conversation continuity: reuses the link's stored currentConversationId (set once, on
 * the first message) so follow-up questions over WhatsApp get the same CHAT_HISTORY_LIMIT
 * history-awareness the web chat already has, instead of treating every incoming
 * message as a context-free new conversation.
 */
export async function handleIncomingWhatsappMessage(
  message: IncomingWhatsappMessage,
): Promise<string> {
  const link = await findWhatsappLinkByPhone(message.phoneNumber);
  if (!link) {
    return NOT_REGISTERED_MESSAGE;
  }

  const user = await findUserById(link.userId);
  if (!user || !user.isActive) {
    return NOT_REGISTERED_MESSAGE;
  }

  const rateLimit = checkRateLimit(
    "chat",
    user.id,
    env.CHAT_RATE_LIMIT_MAX_ATTEMPTS,
    env.CHAT_RATE_LIMIT_WINDOW_MS,
  );
  if (!rateLimit.allowed) {
    return RATE_LIMITED_MESSAGE;
  }

  const result = await askQuestion({
    conversationId: link.currentConversationId ?? undefined,
    message: message.text,
    userId: user.id,
  });

  if (!link.currentConversationId) {
    await setCurrentConversation(link.id, result.conversationId);
  }

  return formatAnswerForWhatsapp(result);
}

/** WhatsApp renders plain text with a small markdown-like subset (*bold*, _italic_) —
 * no HTML, no the web UI's structured source cards, so sources get folded into one
 * message as a simple bulleted list instead. */
function formatAnswerForWhatsapp(result: AskQuestionResult): string {
  const lines = [result.message.content];
  if (result.sources.length > 0) {
    lines.push("", "_Sources:_");
    for (const source of result.sources) {
      const ocrNote = source.isOcr ? " [OCR result]" : "";
      lines.push(
        `• ${source.documentTitle} (No. ${source.documentNumber}, rev. ${source.revision}, p. ${source.pageNumber})${ocrNote}`,
      );
    }
  }
  return lines.join("\n");
}
