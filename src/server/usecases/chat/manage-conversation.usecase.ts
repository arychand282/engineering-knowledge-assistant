import {
  deleteConversation,
  findConversationByIdForUser,
  listConversationsByUser,
} from "@/server/repositories/conversation.repository";
import { listMessagesByConversationId } from "@/server/repositories/message.repository";
import { listMessageSourcesByMessageId } from "@/server/repositories/message-source.repository";
import { ConversationNotFoundError } from "./errors";

export async function listConversations(userId: string) {
  return listConversationsByUser(userId);
}

export async function getConversation(conversationId: string, userId: string) {
  const conversation = await findConversationByIdForUser(conversationId, userId);
  if (!conversation) {
    throw new ConversationNotFoundError(conversationId);
  }

  const messages = await listMessagesByConversationId(conversationId);
  const messagesWithSources = await Promise.all(
    messages.map(async (message) => ({
      ...message,
      sources: message.role === "assistant" ? await listMessageSourcesByMessageId(message.id) : [],
    })),
  );

  return { conversation, messages: messagesWithSources };
}

export async function removeConversation(conversationId: string, userId: string): Promise<void> {
  const conversation = await findConversationByIdForUser(conversationId, userId);
  if (!conversation) {
    throw new ConversationNotFoundError(conversationId);
  }
  await deleteConversation(conversationId);
}
