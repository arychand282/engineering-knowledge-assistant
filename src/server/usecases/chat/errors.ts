export class ConversationNotFoundError extends Error {
  constructor(conversationId: string) {
    super(`Conversation ${conversationId} not found.`);
    this.name = "ConversationNotFoundError";
  }
}
