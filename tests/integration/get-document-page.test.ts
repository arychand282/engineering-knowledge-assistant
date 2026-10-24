import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { db, pool } from "@/lib/db";
import { documentAccess, documentPages, documents, roles, userRoles, users } from "@/lib/db/schema";
import { getDocumentPage } from "@/server/usecases/documents/get-document-page.usecase";
import { DocumentNotFoundError, PageNotFoundError } from "@/server/usecases/documents/errors";

let engineerRoleId: string;
const createdUserIds: string[] = [];
const createdDocumentIds: string[] = [];

async function ensureRoleId(name: string): Promise<string> {
  const [existing] = await db.select().from(roles).where(eq(roles.name, name));
  if (existing) {
    return existing.id;
  }
  const [created] = await db.insert(roles).values({ name }).returning();
  return created.id;
}

async function createUser(roleIds: string[] = []) {
  const [user] = await db
    .insert(users)
    .values({ email: `page-test-${randomUUID()}@example.test`, name: "Page Test User" })
    .returning();
  createdUserIds.push(user.id);
  if (roleIds.length > 0) {
    await db.insert(userRoles).values(roleIds.map((roleId) => ({ userId: user.id, roleId })));
  }
  return user;
}

async function insertDocumentWithPage(uploadedBy: string, pageText: string) {
  const [doc] = await db
    .insert(documents)
    .values({
      title: "Dokumen Uji Halaman",
      documentNumber: `DOC-${randomUUID()}`,
      documentType: "procedure",
      revision: "0",
      originalFilename: "uji.pdf",
      mimeType: "application/pdf",
      fileSize: 10,
      sha256: randomUUID().replace(/-/g, "").padEnd(64, "0"),
      storageKey: `documents/${randomUUID()}.pdf`,
      uploadedBy,
    })
    .returning();
  createdDocumentIds.push(doc.id);

  await db.insert(documentPages).values({
    documentId: doc.id,
    pageNumber: 1,
    extractedText: pageText,
    extractionStatus: "success",
  });

  return doc;
}

beforeAll(async () => {
  engineerRoleId = await ensureRoleId("engineer");
});

afterEach(async () => {
  for (const id of createdDocumentIds.splice(0)) {
    await db.delete(documentPages).where(eq(documentPages.documentId, id));
    await db.delete(documentAccess).where(eq(documentAccess.documentId, id));
    await db.delete(documents).where(eq(documents.id, id));
  }
});

afterAll(async () => {
  await db.delete(userRoles).where(inArray(userRoles.userId, createdUserIds));
  await db.delete(users).where(inArray(users.id, createdUserIds));
  await pool.end();
});

describe("getDocumentPage", () => {
  it("returns the requested page for a document the actor can access", async () => {
    const uploader = await createUser();
    const engineer = await createUser([engineerRoleId]);
    const doc = await insertDocumentWithPage(uploader.id, "Isi halaman pertama.");
    await db.insert(documentAccess).values({ documentId: doc.id, roleId: engineerRoleId });

    const result = await getDocumentPage(doc.id, 1, { id: engineer.id, roles: ["engineer"] });

    expect(result.document.id).toBe(doc.id);
    expect(result.page).toMatchObject({
      pageNumber: 1,
      extractedText: "Isi halaman pertama.",
      extractionStatus: "success",
    });
  });

  it("lets admin/document_controller read a page with no document_access grant at all", async () => {
    const uploader = await createUser();
    const doc = await insertDocumentWithPage(uploader.id, "Isi untuk admin.");
    // Deliberately no document_access row.

    const result = await getDocumentPage(doc.id, 1, { id: uploader.id, roles: ["admin"] });
    expect(result.page.extractedText).toBe("Isi untuk admin.");
  });

  it("hides a page from an engineer/viewer with no access grant (IDOR-safe: 404-style error)", async () => {
    const uploader = await createUser();
    const engineer = await createUser([engineerRoleId]);
    const doc = await insertDocumentWithPage(uploader.id, "Tidak boleh dilihat.");
    // Deliberately no document_access row for engineerRoleId.

    await expect(
      getDocumentPage(doc.id, 1, { id: engineer.id, roles: ["engineer"] }),
    ).rejects.toBeInstanceOf(DocumentNotFoundError);
  });

  it("throws DocumentNotFoundError for an unknown document id", async () => {
    await expect(
      getDocumentPage(randomUUID(), 1, { id: randomUUID(), roles: ["admin"] }),
    ).rejects.toBeInstanceOf(DocumentNotFoundError);
  });

  it("throws PageNotFoundError for a page number that doesn't exist on an accessible document", async () => {
    const uploader = await createUser();
    const doc = await insertDocumentWithPage(uploader.id, "Hanya ada halaman 1.");

    await expect(
      getDocumentPage(doc.id, 2, { id: uploader.id, roles: ["admin"] }),
    ).rejects.toBeInstanceOf(PageNotFoundError);
  });
});
