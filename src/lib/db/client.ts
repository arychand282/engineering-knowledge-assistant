import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "@/lib/env";
import * as schema from "./schema";

type Database = NodePgDatabase<typeof schema>;

const globalForDb = globalThis as unknown as {
  pgPool?: Pool;
  drizzleDb?: Database;
};

function createPool(): Pool {
  return new Pool({ connectionString: env.DATABASE_URL });
}

export const pool = globalForDb.pgPool ?? createPool();

export const db: Database = globalForDb.drizzleDb ?? drizzle(pool, { schema });

if (env.NODE_ENV !== "production") {
  globalForDb.pgPool = pool;
  globalForDb.drizzleDb = db;
}
