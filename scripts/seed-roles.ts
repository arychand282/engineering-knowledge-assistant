/**
 * Idempotent: inserts the four base roles (PLANNING.md #10) if they don't already
 * exist. Called from seed-dev-user.ts — not meant to be run standalone, since it does
 * not own the DB connection pool's lifecycle.
 */
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { roles } from "@/lib/db/schema";
import { ALL_ROLES } from "@/server/auth/roles";

const ROLE_DESCRIPTIONS: Record<string, string> = {
  admin: "Mengelola pengguna, konfigurasi, dan akses.",
  document_controller: "Upload, metadata, status, revisi, dan publikasi dokumen.",
  engineer: "Mencari dan bertanya pada dokumen yang diizinkan; memberi feedback.",
  viewer: "Akses baca sesuai proyek dan klasifikasi yang diizinkan.",
};

export async function seedRoles(): Promise<void> {
  for (const name of ALL_ROLES) {
    const [existing] = await db.select().from(roles).where(eq(roles.name, name));
    if (!existing) {
      await db.insert(roles).values({ name, description: ROLE_DESCRIPTIONS[name] });
    }
  }
}
