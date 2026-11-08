import { z } from "zod";

const DEV_DEFAULT_DATABASE_URL =
  "postgresql://eka:eka_dev_password@localhost:5432/engineering_knowledge_assistant";

const baseEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().url().optional(),
  EMBEDDING_DIMENSIONS: z.coerce.number().int().positive().default(768),
  STORAGE_DIR: z.string().min(1).default("storage"),
  // OPT-IN exception for deployments without a persistent local filesystem across
  // requests (e.g. Vercel Functions) — same class of override as CHAT_PROVIDER/
  // EMBEDDING_PROVIDER below. Default "local" keeps today's filesystem behavior
  // unchanged; "vercel-blob" swaps to src/lib/storage/vercel-blob-storage.ts via the
  // dispatcher in src/lib/storage/index.ts.
  STORAGE_PROVIDER: z.enum(["local", "vercel-blob"]).default("local"),
  // Auto-injected by Vercel when a Blob store is connected to the project — only
  // required when STORAGE_PROVIDER=vercel-blob.
  BLOB_READ_WRITE_TOKEN: z.string().min(1).optional(),
  MAX_UPLOAD_SIZE_MB: z.coerce.number().int().positive().default(50),
  MAX_DOCUMENT_PAGES: z.coerce.number().int().positive().default(1000),
  CHUNK_SIZE_WORDS: z.coerce.number().int().positive().default(700),
  CHUNK_OVERLAP_WORDS: z.coerce.number().int().min(0).default(100),
  // DOCX has no stored pagination, so it's converted to PDF via headless LibreOffice
  // before reusing the existing PDF page-extraction pipeline unchanged. This bounds how
  // long one conversion may run before being treated as a failure.
  DOCX_CONVERT_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
  // Path or bare command for the LibreOffice CLI. Default "soffice" works out of the
  // box after `apt install libreoffice` or `brew install --cask libreoffice` (both
  // verified to put it on PATH — see README "Prasyarat"). Override only if some other
  // install method doesn't, e.g. a direct path to the app bundle.
  SOFFICE_BINARY: z.string().min(1).default("soffice"),

  // Local OCR (tesseract.js + @napi-rs/canvas for PDF page rasterization) for pages
  // classified "ocr_required" (image present, no extractable text layer — a scanned
  // page). Default ON: unlike RERANK_ENABLED, this can only improve a page that was
  // otherwise completely unusable (empty, unsearchable), the latency cost is paid once
  // at upload time (not per chat question), and any failure (worker/engine error,
  // missing language data) degrades gracefully back to today's ocr_required behavior —
  // never fails the upload. Still a real cost (CPU-bound OCR), hence configurable.
  OCR_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  // tesseract.js language codes, "+"-joined. Indonesian + English matches this
  // project's bilingual document examples (PLANNING.md/README samples use both).
  OCR_LANGUAGES: z.string().min(1).default("ind+eng"),
  // Local directory holding pulled {lang}.traineddata.gz files (npm run
  // ocr:pull-language-data). NEVER defaults to tesseract.js's own CDN fallback — see
  // src/lib/documents/ocr.ts for why that matters (no implicit network calls).
  OCR_LANG_DATA_DIR: z.string().min(1).default("ocr-lang-data"),
  // Bounds each page's render+recognize cycle (src/lib/documents/ocr.ts's ocrPage()) —
  // a PDF with a pathological scanned page could otherwise hang a request indefinitely.
  // On timeout the tesseract worker is terminated directly (racing a Promise alone
  // doesn't stop the underlying worker_thread's in-progress job).
  OCR_TIMEOUT_MS: z.coerce.number().int().positive().default(120_000),
  // Below this (tesseract's own 0-100 confidence score), an OCR result is treated as
  // unreliable and discarded — the page stays `ocr_required` rather than persisting
  // low-confidence garbage as if it were real extracted text. Not benchmarked against a
  // real scanned-document dataset; a reasonable starting default, not a tuned value.
  OCR_MIN_CONFIDENCE: z.coerce.number().min(0).max(100).default(60),

  OLLAMA_BASE_URL: z.string().url().default("http://localhost:11434"),
  EMBEDDING_MODEL: z.string().min(1).default("nomic-embed-text"),
  OLLAMA_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),

  // OPT-IN exception to "no external AI", same pattern as CHAT_PROVIDER below but
  // documented separately (PLANNING.md "Mode Embedding Eksternal") because this one
  // sends document chunk/query TEXT to a cloud API for the embedding step itself —
  // default stays "local" so nothing changes unless explicitly configured.
  EMBEDDING_PROVIDER: z.enum(["local", "gemini", "openai"]).default("local"),
  EXTERNAL_EMBEDDING_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  // GEMINI_EMBEDDING_MODEL default updated 2026-11: "text-embedding-004" was retired by
  // Google (calls now 404) — "gemini-embedding-001" is the current GA replacement. Its
  // native output is larger than the default EMBEDDING_DIMENSIONS (768), but both this
  // model and OpenAI's support truncating via an explicit dimensions param
  // (Gemini's outputDimensionality / OpenAI's dimensions param), see providers/*.ts —
  // the dimension-mismatch check in _embed-chunks.ts/gemini-client.ts still guards this.
  GEMINI_EMBEDDING_MODEL: z.string().min(1).default("gemini-embedding-001"),
  OPENAI_EMBEDDING_MODEL: z.string().min(1).default("text-embedding-3-small"),
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

  // Authenticates Vercel Cron's call to /api/v1/admin/reset-demo (and manual calls to
  // the same route). Optional at the schema level since most deployments of this app
  // never need the reset route at all — only required in practice once CRON_SECRET-
  // gated automation is actually wired up for a public demo deployment.
  CRON_SECRET: z.string().min(1).optional(),

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
  // Same cost class as upload (full extraction + OCR + re-embedding), so same default
  // limits — added after a security review found reprocess had no rate limit at all,
  // unlike upload, right as it gained a one-click UI button for the first time.
  REPROCESS_RATE_LIMIT_MAX_ATTEMPTS: z.coerce.number().int().positive().default(20),
  REPROCESS_RATE_LIMIT_WINDOW_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(60 * 60_000),

  // WhatsApp integration (explicit, scoped exception to the same class of rule as
  // CHAT_PROVIDER — see PLANNING.md §1/§18 decision 9: never build this speculatively,
  // only when the client has actually asked for it, which is the case here). Default
  // "none" — nothing WhatsApp-related runs unless a provider is explicitly chosen.
  //
  // "baileys" = unofficial (whatsapp-rust-bridge-backed, not Meta's API): links a real
  // WhatsApp account via QR-code pairing (admin-only /admin/whatsapp page), no business
  // verification needed, fastest path to something testable — but against WhatsApp's
  // ToS and the linked number can be banned. Explicitly chosen over Meta Cloud API for
  // now because the client doesn't have a Meta Business account registered yet.
  // "meta" = official Cloud API boilerplate (src/lib/whatsapp/providers/meta-cloud-api.ts),
  // scaffolded but inert until WHATSAPP_META_* below are filled in — switch to this once
  // the client registers with Meta, not before.
  WHATSAPP_PROVIDER: z.enum(["none", "baileys", "meta"]).default("none"),
  // Local directory holding Baileys' auth session files (useMultiFileAuthState) — same
  // sensitivity as a session token (see .gitignore), never committed.
  WHATSAPP_SESSION_DIR: z.string().min(1).default("whatsapp-session"),
  // Meta Cloud API credentials — all optional, only required when WHATSAPP_PROVIDER=meta.
  WHATSAPP_META_ACCESS_TOKEN: z.string().min(1).optional(),
  WHATSAPP_META_PHONE_NUMBER_ID: z.string().min(1).optional(),
  // Shared secret Meta's webhook verification GET request must echo back (Meta App
  // dashboard config, not a value Meta gives you — you choose this yourself).
  WHATSAPP_META_VERIFY_TOKEN: z.string().min(1).optional(),
  // Used to verify the X-Hub-Signature-256 header on incoming webhook POSTs actually
  // came from Meta (Meta App dashboard → App Secret), not an unauthenticated request
  // claiming to be a WhatsApp message.
  WHATSAPP_META_APP_SECRET: z.string().min(1).optional(),
});

export type Env = {
  NODE_ENV: "development" | "test" | "production";
  APP_URL: string;
  DATABASE_URL: string;
  EMBEDDING_DIMENSIONS: number;
  STORAGE_DIR: string;
  STORAGE_PROVIDER: "local" | "vercel-blob";
  BLOB_READ_WRITE_TOKEN?: string;
  MAX_UPLOAD_SIZE_MB: number;
  MAX_DOCUMENT_PAGES: number;
  CHUNK_SIZE_WORDS: number;
  CHUNK_OVERLAP_WORDS: number;
  DOCX_CONVERT_TIMEOUT_MS: number;
  SOFFICE_BINARY: string;
  OCR_ENABLED: boolean;
  OCR_LANGUAGES: string;
  OCR_LANG_DATA_DIR: string;
  OCR_TIMEOUT_MS: number;
  OCR_MIN_CONFIDENCE: number;
  OLLAMA_BASE_URL: string;
  EMBEDDING_MODEL: string;
  OLLAMA_REQUEST_TIMEOUT_MS: number;
  EMBEDDING_PROVIDER: "local" | "gemini" | "openai";
  EXTERNAL_EMBEDDING_TIMEOUT_MS: number;
  GEMINI_EMBEDDING_MODEL: string;
  OPENAI_EMBEDDING_MODEL: string;
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
  CRON_SECRET?: string;
  SESSION_TTL_HOURS: number;
  LOGIN_RATE_LIMIT_MAX_ATTEMPTS: number;
  LOGIN_RATE_LIMIT_WINDOW_MS: number;
  UPLOAD_RATE_LIMIT_MAX_ATTEMPTS: number;
  UPLOAD_RATE_LIMIT_WINDOW_MS: number;
  CHAT_RATE_LIMIT_MAX_ATTEMPTS: number;
  CHAT_RATE_LIMIT_WINDOW_MS: number;
  REPROCESS_RATE_LIMIT_MAX_ATTEMPTS: number;
  REPROCESS_RATE_LIMIT_WINDOW_MS: number;
  WHATSAPP_PROVIDER: "none" | "baileys" | "meta";
  WHATSAPP_SESSION_DIR: string;
  WHATSAPP_META_ACCESS_TOKEN?: string;
  WHATSAPP_META_PHONE_NUMBER_ID?: string;
  WHATSAPP_META_VERIFY_TOKEN?: string;
  WHATSAPP_META_APP_SECRET?: string;
};

function loadEnv(): Env {
  const parsed = baseEnvSchema.safeParse({
    NODE_ENV: process.env.NODE_ENV,
    APP_URL: process.env.APP_URL,
    DATABASE_URL: process.env.DATABASE_URL,
    EMBEDDING_DIMENSIONS: process.env.EMBEDDING_DIMENSIONS,
    STORAGE_DIR: process.env.STORAGE_DIR,
    STORAGE_PROVIDER: process.env.STORAGE_PROVIDER,
    BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN,
    MAX_UPLOAD_SIZE_MB: process.env.MAX_UPLOAD_SIZE_MB,
    MAX_DOCUMENT_PAGES: process.env.MAX_DOCUMENT_PAGES,
    CHUNK_SIZE_WORDS: process.env.CHUNK_SIZE_WORDS,
    CHUNK_OVERLAP_WORDS: process.env.CHUNK_OVERLAP_WORDS,
    DOCX_CONVERT_TIMEOUT_MS: process.env.DOCX_CONVERT_TIMEOUT_MS,
    SOFFICE_BINARY: process.env.SOFFICE_BINARY,
    OCR_ENABLED: process.env.OCR_ENABLED,
    OCR_LANGUAGES: process.env.OCR_LANGUAGES,
    OCR_LANG_DATA_DIR: process.env.OCR_LANG_DATA_DIR,
    OCR_TIMEOUT_MS: process.env.OCR_TIMEOUT_MS,
    OCR_MIN_CONFIDENCE: process.env.OCR_MIN_CONFIDENCE,
    OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL,
    EMBEDDING_MODEL: process.env.EMBEDDING_MODEL,
    OLLAMA_REQUEST_TIMEOUT_MS: process.env.OLLAMA_REQUEST_TIMEOUT_MS,
    EMBEDDING_PROVIDER: process.env.EMBEDDING_PROVIDER,
    EXTERNAL_EMBEDDING_TIMEOUT_MS: process.env.EXTERNAL_EMBEDDING_TIMEOUT_MS,
    GEMINI_EMBEDDING_MODEL: process.env.GEMINI_EMBEDDING_MODEL,
    OPENAI_EMBEDDING_MODEL: process.env.OPENAI_EMBEDDING_MODEL,
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
    CRON_SECRET: process.env.CRON_SECRET,
    SESSION_TTL_HOURS: process.env.SESSION_TTL_HOURS,
    LOGIN_RATE_LIMIT_MAX_ATTEMPTS: process.env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS,
    LOGIN_RATE_LIMIT_WINDOW_MS: process.env.LOGIN_RATE_LIMIT_WINDOW_MS,
    UPLOAD_RATE_LIMIT_MAX_ATTEMPTS: process.env.UPLOAD_RATE_LIMIT_MAX_ATTEMPTS,
    UPLOAD_RATE_LIMIT_WINDOW_MS: process.env.UPLOAD_RATE_LIMIT_WINDOW_MS,
    CHAT_RATE_LIMIT_MAX_ATTEMPTS: process.env.CHAT_RATE_LIMIT_MAX_ATTEMPTS,
    CHAT_RATE_LIMIT_WINDOW_MS: process.env.CHAT_RATE_LIMIT_WINDOW_MS,
    REPROCESS_RATE_LIMIT_MAX_ATTEMPTS: process.env.REPROCESS_RATE_LIMIT_MAX_ATTEMPTS,
    REPROCESS_RATE_LIMIT_WINDOW_MS: process.env.REPROCESS_RATE_LIMIT_WINDOW_MS,
    WHATSAPP_PROVIDER: process.env.WHATSAPP_PROVIDER,
    WHATSAPP_SESSION_DIR: process.env.WHATSAPP_SESSION_DIR,
    WHATSAPP_META_ACCESS_TOKEN: process.env.WHATSAPP_META_ACCESS_TOKEN,
    WHATSAPP_META_PHONE_NUMBER_ID: process.env.WHATSAPP_META_PHONE_NUMBER_ID,
    WHATSAPP_META_VERIFY_TOKEN: process.env.WHATSAPP_META_VERIFY_TOKEN,
    WHATSAPP_META_APP_SECRET: process.env.WHATSAPP_META_APP_SECRET,
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
  const requiredChatKey = requiredKeyByProvider[data.CHAT_PROVIDER];
  if (requiredChatKey && !requiredChatKey.key) {
    throw new Error(
      `${requiredChatKey.envVar} wajib diisi jika CHAT_PROVIDER=${data.CHAT_PROVIDER}. ` +
        "CHAT_PROVIDER hanya untuk demo/dev — jangan dipakai dengan dokumen perusahaan sungguhan (lihat PLANNING.md).",
    );
  }
  const requiredEmbeddingKey = requiredKeyByProvider[data.EMBEDDING_PROVIDER];
  if (requiredEmbeddingKey && !requiredEmbeddingKey.key) {
    throw new Error(
      `${requiredEmbeddingKey.envVar} wajib diisi jika EMBEDDING_PROVIDER=${data.EMBEDDING_PROVIDER}. ` +
        "EMBEDDING_PROVIDER hanya untuk demo/dev — jangan dipakai dengan dokumen perusahaan sungguhan (lihat PLANNING.md).",
    );
  }

  if (data.STORAGE_PROVIDER === "vercel-blob" && !data.BLOB_READ_WRITE_TOKEN) {
    throw new Error(
      "BLOB_READ_WRITE_TOKEN wajib diisi jika STORAGE_PROVIDER=vercel-blob " +
        "(otomatis terisi oleh Vercel saat Blob store terhubung ke project).",
    );
  }

  if (data.WHATSAPP_PROVIDER === "meta") {
    const missing = [
      ["WHATSAPP_META_ACCESS_TOKEN", data.WHATSAPP_META_ACCESS_TOKEN],
      ["WHATSAPP_META_PHONE_NUMBER_ID", data.WHATSAPP_META_PHONE_NUMBER_ID],
      ["WHATSAPP_META_VERIFY_TOKEN", data.WHATSAPP_META_VERIFY_TOKEN],
      ["WHATSAPP_META_APP_SECRET", data.WHATSAPP_META_APP_SECRET],
    ].filter(([, value]) => !value);
    if (missing.length > 0) {
      throw new Error(
        `${missing.map(([name]) => name).join(", ")} wajib diisi jika WHATSAPP_PROVIDER=meta.`,
      );
    }
  }

  return { ...data, DATABASE_URL: databaseUrl };
}

export const env = loadEnv();
