/**
 * Dev-only convenience: creates (or upgrades) a single admin user with a known password
 * so you can actually log in locally without a real onboarding flow. Not meant for
 * production use — the password below is intentionally public knowledge for dev.
 */
import { and, eq } from "drizzle-orm";
import { hashPassword } from "@/lib/auth/password";
import { db, pool } from "@/lib/db";
import { roles, userRoles, users } from "@/lib/db/schema";
import { ROLE_ADMIN } from "@/server/auth/roles";
import { seedRoles } from "./seed-roles";

const DEV_EMAIL = "dev@example.local";
const DEV_PASSWORD = "DevPassword123!";

async function main() {
  await seedRoles();

  const [adminRole] = await db.select().from(roles).where(eq(roles.name, ROLE_ADMIN));
  if (!adminRole) {
    throw new Error("Role 'admin' tidak ditemukan setelah seedRoles().");
  }

  let [user] = await db.select().from(users).where(eq(users.email, DEV_EMAIL));
  const passwordHash = await hashPassword(DEV_PASSWORD);

  if (!user) {
    [user] = await db
      .insert(users)
      .values({ email: DEV_EMAIL, name: "Dev User", passwordHash })
      .returning();
  } else if (!user.passwordHash) {
    await db.update(users).set({ passwordHash }).where(eq(users.id, user.id));
  }

  const [existingAdminAssignment] = await db
    .select()
    .from(userRoles)
    .where(and(eq(userRoles.userId, user.id), eq(userRoles.roleId, adminRole.id)));
  if (!existingAdminAssignment) {
    await db.insert(userRoles).values({ userId: user.id, roleId: adminRole.id });
  }

  console.log(`user id: ${user.id}`);
  console.log(`email: ${DEV_EMAIL}`);
  console.log(`password: ${DEV_PASSWORD}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
