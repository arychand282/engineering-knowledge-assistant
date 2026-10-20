import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { roles, userRoles, users } from "@/lib/db/schema";

export type UserRow = typeof users.$inferSelect;

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  const [row] = await db.select().from(users).where(eq(users.email, email));
  return row ?? null;
}

export async function findUserById(id: string): Promise<UserRow | null> {
  const [row] = await db.select().from(users).where(eq(users.id, id));
  return row ?? null;
}

export async function listRoleNamesForUser(userId: string): Promise<string[]> {
  const rows = await db
    .select({ name: roles.name })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(eq(userRoles.userId, userId));
  return rows.map((row) => row.name);
}

export interface UserWithRoles {
  id: string;
  email: string;
  name: string;
  isActive: boolean;
  roles: string[];
}

export async function listUsersWithRoles(): Promise<UserWithRoles[]> {
  const userRows = await db
    .select({ id: users.id, email: users.email, name: users.name, isActive: users.isActive })
    .from(users);

  if (userRows.length === 0) {
    return [];
  }

  const roleRows = await db
    .select({ userId: userRoles.userId, name: roles.name })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(
      inArray(
        userRoles.userId,
        userRows.map((row) => row.id),
      ),
    );

  const rolesByUserId = new Map<string, string[]>();
  for (const row of roleRows) {
    const list = rolesByUserId.get(row.userId) ?? [];
    list.push(row.name);
    rolesByUserId.set(row.userId, list);
  }

  return userRows.map((row) => ({ ...row, roles: rolesByUserId.get(row.id) ?? [] }));
}

export async function setUserActive(userId: string, isActive: boolean): Promise<void> {
  await db.update(users).set({ isActive, updatedAt: new Date() }).where(eq(users.id, userId));
}

export async function replaceUserRoles(userId: string, roleIds: string[]): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(userRoles).where(eq(userRoles.userId, userId));
    if (roleIds.length > 0) {
      await tx.insert(userRoles).values(roleIds.map((roleId) => ({ userId, roleId })));
    }
  });
}
