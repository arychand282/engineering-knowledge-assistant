import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { roles } from "@/lib/db/schema";

export type RoleRow = typeof roles.$inferSelect;

export async function listRoles(): Promise<RoleRow[]> {
  return db.select().from(roles);
}

export async function findRoleIdsByNames(names: string[]): Promise<string[]> {
  if (names.length === 0) {
    return [];
  }
  const rows = await db.select({ id: roles.id }).from(roles).where(inArray(roles.name, names));
  return rows.map((row) => row.id);
}

export async function findRoleByName(name: string): Promise<RoleRow | null> {
  const [row] = await db.select().from(roles).where(eq(roles.name, name));
  return row ?? null;
}
