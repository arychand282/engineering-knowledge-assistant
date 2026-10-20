export class ConversationNotFoundError extends Error {
  constructor(conversationId: string) {
    super(`Percakapan ${conversationId} tidak ditemukan.`);
    this.name = "ConversationNotFoundError";
  }
}
