import { readFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { hashPassword } from "@/lib/auth/password";
import { db } from "@/lib/db";
import { conversations, documents, roles, userRoles, users } from "@/lib/db/schema";
import { ROLE_ADMIN } from "@/server/auth/roles";
import { deleteStoredFile } from "@/lib/storage";
import { grantDocumentAccess } from "@/server/usecases/documents/grant-document-access.usecase";
import { updateDocument } from "@/server/usecases/documents/update-document.usecase";
import { uploadDocument } from "@/server/usecases/documents/upload-document.usecase";

/**
 * Public demo reset — this project's live deployment shares one admin login
 * (dev@example.local) publicly (Upwork portfolio/proposals), so anyone with those
 * credentials has full admin rights: they can upload arbitrary files, start
 * conversations, or (via PATCH /admin/users) deactivate/demote the shared account
 * itself. There is no self-registration and no password-change endpoint in this app
 * (verified by inspection — not assumed), so those are the only two realistic ways a
 * visitor can leave the demo unusable for the next visitor. This brings the demo back
 * to a known-good state: wipes all conversations/documents, restores the dev account
 * (active + admin role, regardless of what a visitor changed), and re-uploads the
 * sample PDFs through the real upload pipeline (exercises extraction/chunking/
 * embedding exactly like a real upload, not a DB-row shortcut).
 *
 * Deletion order matters: message_sources.documentId is ON DELETE RESTRICT (not
 * cascade — see document-chunks.ts schema comment), so documents can't be deleted
 * while any conversation still cites them. Conversations (which cascade to messages
 * then message_sources) must go first.
 *
 * One seed pair (`concrete-curing-rev-a`/`-rev-b`) is wired with `supersedesKey` so the
 * demo can show `conflict_detected` live (see `findSupersedesConflictPairs`), not just
 * via the eval suite — the crane SOP stays single-revision on purpose so its `answered`/
 * `insufficient_evidence` demo questions keep behaving the same regardless of this pair.
 */

const DEV_EMAIL = "dev@example.local";
const DEV_PASSWORD = "DevPassword123!";

interface SeedDocument {
  key: string;
  file: string;
  title: string;
  documentNumber: string;
  documentType: string;
  revision: string;
  /** Must name a `key` seeded earlier in this array — order matters. */
  supersedesKey?: string;
}

const SEED_DOCUMENTS: SeedDocument[] = [
  {
    key: "crane-sop",
    file: "sop-crane-safety.pdf",
    title: "Tower Crane Pre-Operation Inspection SOP",
    documentNumber: "SOP-CRANE-004",
    documentType: "sop",
    revision: "A",
  },
  {
    key: "concrete-curing-rev-a",
    file: "guideline-concrete-curing.pdf",
    title: "Concrete Curing for Structural Columns",
    documentNumber: "ENG-GL-012",
    documentType: "guideline",
    revision: "A",
  },
  {
    key: "concrete-curing-rev-b",
    file: "guideline-concrete-curing-rev-b.pdf",
    title: "Concrete Curing for Structural Columns",
    documentNumber: "ENG-GL-012",
    documentType: "guideline",
    revision: "B",
    supersedesKey: "concrete-curing-rev-a",
  },
];

export interface ResetDemoResult {
  conversationsDeleted: number;
  documentsDeleted: number;
  documentsReseeded: number;
}

export async function resetDemo(): Promise<ResetDemoResult> {
  const deletedConversations = await db
    .delete(conversations)
    .returning({ id: conversations.id });

  const existingDocs = await db
    .select({ id: documents.id, storageKey: documents.storageKey })
    .from(documents);

  for (const doc of existingDocs) {
    // Best-effort: an already-missing blob must never block the reset itself.
    await deleteStoredFile(doc.storageKey).catch((error) => {
      console.error(`[reset-demo] failed to delete blob for document ${doc.id}:`, error);
    });
  }
  if (existingDocs.length > 0) {
    await db.delete(documents);
  }

  const devUser = await restoreDevUser();

  let reseeded = 0;
  const seededIds: Record<string, string> = {};
  for (const seed of SEED_DOCUMENTS) {
    const buffer = await readFile(path.join(process.cwd(), "scripts/demo-seed-data", seed.file));
    const { document } = await uploadDocument({
      file: { buffer, mimeType: "application/pdf", originalFilename: seed.file },
      metadata: {
        title: seed.title,
        documentNumber: seed.documentNumber,
        documentType: seed.documentType,
        revision: seed.revision,
      },
      uploadedBy: devUser.id,
    });
    seededIds[seed.key] = document.id;

    if (seed.supersedesKey) {
      const supersededId = seededIds[seed.supersedesKey];
      if (!supersededId) {
        // Fails loudly instead of silently seeding a document with no conflict pair —
        // SEED_DOCUMENTS order must list the superseded entry first.
        throw new Error(
          `[reset-demo] supersedesKey "${seed.supersedesKey}" (for "${seed.key}") was not ` +
            "seeded before this entry — check SEED_DOCUMENTS order.",
        );
      }
      await updateDocument({
        documentId: document.id,
        patch: { supersedesDocumentId: supersededId },
        actorUserId: devUser.id,
      });
    }

    await grantDocumentAccess({
      documentId: document.id,
      roleName: ROLE_ADMIN,
      actorUserId: devUser.id,
    });
    reseeded += 1;
  }

  return {
    conversationsDeleted: deletedConversations.length,
    documentsDeleted: existingDocs.length,
    documentsReseeded: reseeded,
  };
}

/** Restores the shared demo account regardless of what a visitor changed via the admin
 * panel — active status, admin role membership, and password are all force-set, not
 * just created-if-missing (unlike scripts/seed-dev-user.ts, which is first-run only). */
async function restoreDevUser(): Promise<{ id: string }> {
  const passwordHash = await hashPassword(DEV_PASSWORD);

  let [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, DEV_EMAIL));
  if (!user) {
    [user] = await db
      .insert(users)
      .values({ email: DEV_EMAIL, name: "Dev User", passwordHash, isActive: true })
      .returning({ id: users.id });
  } else {
    await db
      .update(users)
      .set({ passwordHash, isActive: true })
      .where(eq(users.id, user.id));
  }

  const [adminRole] = await db.select({ id: roles.id }).from(roles).where(eq(roles.name, ROLE_ADMIN));
  if (!adminRole) {
    throw new Error(`Role '${ROLE_ADMIN}' not found — run seed-roles first.`);
  }

  await db
    .insert(userRoles)
    .values({ userId: user.id, roleId: adminRole.id })
    .onConflictDoNothing();

  return user;
}
