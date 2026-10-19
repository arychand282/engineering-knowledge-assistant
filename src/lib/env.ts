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

  return { ...data, DATABASE_URL: databaseUrl };
}

export const env = loadEnv();
