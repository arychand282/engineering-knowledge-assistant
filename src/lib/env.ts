import { z } from "zod";

const DEV_DEFAULT_DATABASE_URL =
  "postgresql://eka:eka_dev_password@localhost:5432/engineering_knowledge_assistant";

const baseEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().url().optional(),
  EMBEDDING_DIMENSIONS: z.coerce.number().int().positive().default(768),
  STORAGE_DIR: z.string().min(1).default("storage"),
  MAX_UPLOAD_SIZE_MB: z.coerce.number().int().positive().default(50),
  MAX_DOCUMENT_PAGES: z.coerce.number().int().positive().default(1000),
  CHUNK_SIZE_WORDS: z.coerce.number().int().positive().default(700),
  CHUNK_OVERLAP_WORDS: z.coerce.number().int().min(0).default(100),
  OLLAMA_BASE_URL: z.string().url().default("http://localhost:11434"),
  EMBEDDING_MODEL: z.string().min(1).default("nomic-embed-text"),
  OLLAMA_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  CHAT_MODEL: z.string().min(1).default("qwen2.5:3b-instruct"),
  // CPU-only inference is slow (no GPU assumed for dev). Measured ~12 minutes for a
  // short answer on this project's dev sandbox — the default is set well above that.
  // Real deployments need GPU hardware for acceptable chat latency (PLANNING.md #18
  // decision 6); this default exists so the dev experience doesn't time out, not as a
  // production SLA.
  OLLAMA_CHAT_TIMEOUT_MS: z.coerce.number().int().positive().default(900_000),
  CHAT_RETRIEVAL_LIMIT: z.coerce.number().int().positive().default(6),

  // OPT-IN, default OFF — Ollama has no native cross-encoder/rerank model, so the only
  // local option is one extra chat-model call that scores/reorders candidates before
  // the final CHAT_RETRIEVAL_LIMIT is taken. This roughly doubles chat latency per
  // question when on, which matters a lot on CPU-only hardware (see
  // OLLAMA_CHAT_TIMEOUT_MS above) — default stays false so nothing changes unless
  // explicitly configured. Always local (Ollama) regardless of CHAT_PROVIDER: wiring a
  // second structured-output schema through every external provider client was out of
  // scope for what's meant to be an optional quality improvement, not a core feature.
  RERANK_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  // How many candidates (per search type, before merging) are retrieved for the
  // reranker to choose from — only used when RERANK_ENABLED=true, where it replaces
  // CHAT_RETRIEVAL_LIMIT as the retrieval width; the final answer still only uses
  // CHAT_RETRIEVAL_LIMIT chunks, now picked by the reranker instead of RRF fusion alone.
  RERANK_CANDIDATE_LIMIT: z.coerce.number().int().positive().default(20),
  // Prior turns (user+assistant messages) included in the prompt so the model can
  // follow up on its own earlier answers. Counts messages, not tokens — a long answer
  // still counts as one. Tune down if context windows get too large for the chat model.
  CHAT_HISTORY_LIMIT: z.coerce.number().int().min(0).default(10),

  // OPT-IN exception to "no external AI" (PLANNING.md "Mode Chat Eksternal"), default
  // stays "local" so nothing changes unless explicitly configured. When set to a cloud
  // provider, the user's question + retrieved document chunk text are sent to that
  // provider's API — dev/demo convenience only, never for real company documents until
  // company policy approves it (PLANNING.md #18 decision 1).
  CHAT_PROVIDER: z.enum(["local", "gemini", "openai", "anthropic"]).default("local"),
  EXTERNAL_CHAT_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
  GEMINI_API_KEY: z.string().min(1).optional(),
  GEMINI_MODEL: z.string().min(1).default("gemini-flash-lite-latest"),
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_MODEL: z.string().min(1).default("gpt-4o-mini"),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_MODEL: z.string().min(1).default("claude-haiku-4-5-20251001"),

  SESSION_TTL_HOURS: z.coerce.number().int().positive().default(12),
  LOGIN_RATE_LIMIT_MAX_ATTEMPTS: z.coerce.number().int().positive().default(10),
  LOGIN_RATE_LIMIT_WINDOW_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(15 * 60_000),
  UPLOAD_RATE_LIMIT_MAX_ATTEMPTS: z.coerce.number().int().positive().default(20),
  UPLOAD_RATE_LIMIT_WINDOW_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(60 * 60_000),
  CHAT_RATE_LIMIT_MAX_ATTEMPTS: z.coerce.number().int().positive().default(30),
  CHAT_RATE_LIMIT_WINDOW_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(60 * 60_000),
});

export type Env = {
  NODE_ENV: "development" | "test" | "production";
  APP_URL: string;
  DATABASE_URL: string;
  EMBEDDING_DIMENSIONS: number;
  STORAGE_DIR: string;
  MAX_UPLOAD_SIZE_MB: number;
  MAX_DOCUMENT_PAGES: number;
  CHUNK_SIZE_WORDS: number;
  CHUNK_OVERLAP_WORDS: number;
  OLLAMA_BASE_URL: string;
  EMBEDDING_MODEL: string;
  OLLAMA_REQUEST_TIMEOUT_MS: number;
  CHAT_MODEL: string;
  OLLAMA_CHAT_TIMEOUT_MS: number;
  CHAT_RETRIEVAL_LIMIT: number;
  CHAT_HISTORY_LIMIT: number;
  RERANK_ENABLED: boolean;
  RERANK_CANDIDATE_LIMIT: number;
  CHAT_PROVIDER: "local" | "gemini" | "openai" | "anthropic";
  EXTERNAL_CHAT_TIMEOUT_MS: number;
  GEMINI_API_KEY?: string;
  GEMINI_MODEL: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL: string;
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_MODEL: string;
  SESSION_TTL_HOURS: number;
  LOGIN_RATE_LIMIT_MAX_ATTEMPTS: number;
  LOGIN_RATE_LIMIT_WINDOW_MS: number;
  UPLOAD_RATE_LIMIT_MAX_ATTEMPTS: number;
  UPLOAD_RATE_LIMIT_WINDOW_MS: number;
  CHAT_RATE_LIMIT_MAX_ATTEMPTS: number;
  CHAT_RATE_LIMIT_WINDOW_MS: number;
};

function loadEnv(): Env {
  const parsed = baseEnvSchema.safeParse({
    NODE_ENV: process.env.NODE_ENV,
    APP_URL: process.env.APP_URL,
    DATABASE_URL: process.env.DATABASE_URL,
    EMBEDDING_DIMENSIONS: process.env.EMBEDDING_DIMENSIONS,
    STORAGE_DIR: process.env.STORAGE_DIR,
    MAX_UPLOAD_SIZE_MB: process.env.MAX_UPLOAD_SIZE_MB,
    MAX_DOCUMENT_PAGES: process.env.MAX_DOCUMENT_PAGES,
    CHUNK_SIZE_WORDS: process.env.CHUNK_SIZE_WORDS,
    CHUNK_OVERLAP_WORDS: process.env.CHUNK_OVERLAP_WORDS,
    OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL,
    EMBEDDING_MODEL: process.env.EMBEDDING_MODEL,
    OLLAMA_REQUEST_TIMEOUT_MS: process.env.OLLAMA_REQUEST_TIMEOUT_MS,
    CHAT_MODEL: process.env.CHAT_MODEL,
    OLLAMA_CHAT_TIMEOUT_MS: process.env.OLLAMA_CHAT_TIMEOUT_MS,
    CHAT_RETRIEVAL_LIMIT: process.env.CHAT_RETRIEVAL_LIMIT,
    CHAT_HISTORY_LIMIT: process.env.CHAT_HISTORY_LIMIT,
    RERANK_ENABLED: process.env.RERANK_ENABLED,
    RERANK_CANDIDATE_LIMIT: process.env.RERANK_CANDIDATE_LIMIT,
    CHAT_PROVIDER: process.env.CHAT_PROVIDER,
    EXTERNAL_CHAT_TIMEOUT_MS: process.env.EXTERNAL_CHAT_TIMEOUT_MS,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GEMINI_MODEL: process.env.GEMINI_MODEL,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_MODEL: process.env.OPENAI_MODEL,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL,
    SESSION_TTL_HOURS: process.env.SESSION_TTL_HOURS,
    LOGIN_RATE_LIMIT_MAX_ATTEMPTS: process.env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS,
    LOGIN_RATE_LIMIT_WINDOW_MS: process.env.LOGIN_RATE_LIMIT_WINDOW_MS,
    UPLOAD_RATE_LIMIT_MAX_ATTEMPTS: process.env.UPLOAD_RATE_LIMIT_MAX_ATTEMPTS,
    UPLOAD_RATE_LIMIT_WINDOW_MS: process.env.UPLOAD_RATE_LIMIT_WINDOW_MS,
    CHAT_RATE_LIMIT_MAX_ATTEMPTS: process.env.CHAT_RATE_LIMIT_MAX_ATTEMPTS,
    CHAT_RATE_LIMIT_WINDOW_MS: process.env.CHAT_RATE_LIMIT_WINDOW_MS,
  });

  if (!parsed.success) {
    throw new Error(`Invalid environment configuration: ${parsed.error.message}`);
  }

  const data = parsed.data;

  // DATABASE_URL only has a dev/test fallback. Production must set it explicitly so a
  // missing .env.local never silently points a production deployment at dev credentials.
  const databaseUrl =
    data.DATABASE_URL ?? (data.NODE_ENV !== "production" ? DEV_DEFAULT_DATABASE_URL : undefined);

  if (!databaseUrl) {
    throw new Error("DATABASE_URL wajib diisi untuk NODE_ENV=production.");
  }

  const requiredKeyByProvider: Record<string, { key: string | undefined; envVar: string }> = {
    gemini: { key: data.GEMINI_API_KEY, envVar: "GEMINI_API_KEY" },
    openai: { key: data.OPENAI_API_KEY, envVar: "OPENAI_API_KEY" },
    anthropic: { key: data.ANTHROPIC_API_KEY, envVar: "ANTHROPIC_API_KEY" },
  };
  const requiredKey = requiredKeyByProvider[data.CHAT_PROVIDER];
  if (requiredKey && !requiredKey.key) {
    throw new Error(
      `${requiredKey.envVar} wajib diisi jika CHAT_PROVIDER=${data.CHAT_PROVIDER}. ` +
        "CHAT_PROVIDER hanya untuk demo/dev — jangan dipakai dengan dokumen perusahaan sungguhan (lihat PLANNING.md).",
    );
  }

  return { ...data, DATABASE_URL: databaseUrl };
}

export const env = loadEnv();
