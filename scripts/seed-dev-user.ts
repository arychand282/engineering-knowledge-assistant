/**
 * Dev-only convenience: creates (or reuses) a single user row so upload requests have
 * a valid `x-user-id` to send, since Task 6 (real authentication) doesn't exist yet.
 * Not meant for production use.
 */
import { eq } from "drizzle-orm";
import { db, pool } from "@/lib/db";
import { users } from "@/lib/db/schema";

const DEV_EMAIL = "dev@example.local";

async function main() {
  const [existing] = await db.select().from(users).where(eq(users.email, DEV_EMAIL));
  if (existing) {
    console.log(existing.id);
    return;
  }

  const [created] = await db
    .insert(users)
    .values({ email: DEV_EMAIL, name: "Dev User" })
    .returning();
  console.log(created.id);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
