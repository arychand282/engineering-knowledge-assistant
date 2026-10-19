import { config as loadEnv } from "dotenv";
import { defineConfig } from "drizzle-kit";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

const DEV_DEFAULT_DATABASE_URL =
  "postgresql://eka:eka_dev_password@localhost:5432/engineering_knowledge_assistant";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/db/schema/index.ts",
  out: "./drizzle/migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? DEV_DEFAULT_DATABASE_URL,
  },
  strict: true,
  verbose: true,
});
