/** Shared across all chat providers (local Ollama + external) so the usecase layer
 * only needs to catch one error type regardless of which CHAT_PROVIDER is active. */
export class ChatProviderUnavailableError extends Error {
  constructor(message = "Model chat tidak dapat dihubungi.", cause?: unknown) {
    super(message);
    this.name = "ChatProviderUnavailableError";
    this.cause = cause;
  }
}
