/** Shared across all chat providers (local Ollama + external) so the usecase layer
 * only needs to catch one error type regardless of which CHAT_PROVIDER is active. */
export class ChatProviderUnavailableError extends Error {
  constructor(message = "Could not reach the chat model.", cause?: unknown) {
    super(message);
    this.name = "ChatProviderUnavailableError";
    this.cause = cause;
  }
}

/** Shared across all embedding providers (local Ollama + external) so the usecase layer
 * only needs to catch one error type regardless of which EMBEDDING_PROVIDER is active. */
export class EmbeddingProviderUnavailableError extends Error {
  constructor(message = "Could not reach the embedding model.", cause?: unknown) {
    super(message);
    this.name = "EmbeddingProviderUnavailableError";
    this.cause = cause;
  }
}

/** Raised by any embedding provider when the vector it returns doesn't match the
 * configured EMBEDDING_DIMENSIONS — same pgvector column is shared across providers,
 * so every provider's output must agree on one fixed size. */
export class EmbeddingDimensionMismatchError extends Error {
  constructor(modelLabel: string, expected: number, actual: number) {
    super(
      `Embedding model "${modelLabel}" returned a vector of dimension ${actual}, ` +
        `but EMBEDDING_DIMENSIONS is configured as ${expected}.`,
    );
    this.name = "EmbeddingDimensionMismatchError";
  }
}
