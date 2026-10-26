import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";

export type ProjectRow = typeof projects.$inferSelect;

/** Active projects only — used to populate the document metadata form's projectId
 * picker, not a general management listing (no create/update/delete API exists yet;
 * these rows are seeded directly, see PLANNING.md §18 decision 12). */
export async function listActiveProjects(): Promise<ProjectRow[]> {
  return db.select().from(projects).where(eq(projects.isActive, true)).orderBy(asc(projects.name));
}
