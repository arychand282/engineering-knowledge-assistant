import { z } from "zod";

/**
 * Shape the local LLM must return for a RAG answer (PLANNING.md #8). `needs_human_review`
 * is part of the API-level contract but Task 5 never produces it from the model directly
 * — it's reserved for a human-review workflow added later.
 */
export const llmAnswerSchema = z.object({
  status: z.enum(["answered", "insufficient_evidence", "conflict_detected"]),
  answer: z.string(),
  claims: z
    .array(
      z.object({
        text: z.string(),
        source_chunk_ids: z.array(z.string()),
      }),
    )
    .default([]),
  warning: z.string().nullable().optional(),
});

export type LlmAnswer = z.infer<typeof llmAnswerSchema>;

/** JSON Schema form of llmAnswerSchema, passed to Ollama's structured-output `format`. */
export const llmAnswerJsonSchema = {
  type: "object",
  properties: {
    status: { type: "string", enum: ["answered", "insufficient_evidence", "conflict_detected"] },
    answer: { type: "string" },
    claims: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          source_chunk_ids: { type: "array", items: { type: "string" } },
        },
        required: ["text", "source_chunk_ids"],
      },
    },
    warning: { type: ["string", "null"] },
  },
  required: ["status", "answer", "claims"],
};

/**
 * Gemini dialect of the same schema for its `responseSchema` field — required, not
 * optional: tested live (real API key) that relying on prompt instructions alone made
 * Gemini invent its own field names (`claim` instead of `text`) and status values
 * (`"success"` instead of `"answered"`), failing Zod validation every time. `responseSchema`
 * fixed this completely in the same live test. Gemini's schema dialect wants uppercase
 * type names and has no `type: [string, null]` union support, so `warning` is dropped
 * here rather than faked — the field is optional in `llmAnswerSchema` anyway.
 */
export const llmAnswerGeminiSchema = {
  type: "OBJECT",
  properties: {
    status: { type: "STRING", enum: ["answered", "insufficient_evidence", "conflict_detected"] },
    answer: { type: "STRING" },
    claims: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          text: { type: "STRING" },
          source_chunk_ids: { type: "ARRAY", items: { type: "STRING" } },
        },
        required: ["text", "source_chunk_ids"],
      },
    },
  },
  required: ["status", "answer", "claims"],
};
