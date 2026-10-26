import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { sites } from "@/lib/db/schema";

export type SiteRow = typeof sites.$inferSelect;

/** Active sites only — used to populate the document metadata form's siteId picker,
 * not a general management listing (no create/update/delete API exists yet; these
 * rows are seeded directly, see PLANNING.md §18 decision 12). */
export async function listActiveSites(): Promise<SiteRow[]> {
  return db.select().from(sites).where(eq(sites.isActive, true)).orderBy(asc(sites.name));
}
