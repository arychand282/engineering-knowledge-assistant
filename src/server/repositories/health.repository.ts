import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export async function pingDatabase(): Promise<boolean> {
  await db.execute(sql`SELECT 1`);
  return true;
}
