import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { db, pool } from "@/lib/db";
import { auditEvents, documents, users } from "@/lib/db/schema";
import { DocumentNotFoundError, SelfSupersedeError } from "@/server/usecases/documents/errors";
import { updateDocument } from "@/server/usecases/documents/update-document.usecase";

let userId: string;
const createdDocumentIds: string[] = [];

function fakeDocument(overrides: Partial<typeof documents.$inferInsert> = {}) {
  return {
    title: "Dokumen Uji Update",
    documentNumber: `DOC-${randomUUID()}`,
    documentType: "procedure",
    revision: "0",
    originalFilename: "uji.pdf",
    mimeType: "application/pdf",
    fileSize: 10,
    sha256: randomUUID().replace(/-/g, "").padEnd(64, "0"),
    storageKey: `documents/${randomUUID()}.pdf`,
    uploadedBy: userId,
    ...overrides,
  };
}

async function insertDoc(overrides: Partial<typeof documents.$inferInsert> = {}) {
  const [doc] = await db.insert(documents).values(fakeDocument(overrides)).returning();
  createdDocumentIds.push(doc.id);
  return doc;
}

beforeAll(async () => {
  const [user] = await db
    .insert(users)
    .values({ email: `update-doc-${randomUUID()}@example.test`, name: "Update Doc Test User" })
    .returning();
  userId = user.id;
});

afterEach(async () => {
  // Reverse order: a later document may have `supersedesDocumentId` pointing at an
  // earlier one, and that FK isn't cascading.
  for (const id of createdDocumentIds.splice(0).reverse()) {
    await db.delete(documents).where(eq(documents.id, id));
  }
});

afterAll(async () => {
  await db.delete(users).where(eq(users.id, userId));
  await pool.end();
});

describe("updateDocument", () => {
  it("updates the given fields and leaves the rest unchanged", async () => {
    const doc = await insertDoc({ title: "Judul Lama", documentType: "procedure" });

    const updated = await updateDocument({
      documentId: doc.id,
      patch: { title: "Judul Baru" },
      actorUserId: userId,
    });

    expect(updated.title).toBe("Judul Baru");
    expect(updated.documentType).toBe("procedure"); // untouched
    expect(updated.updatedAt.getTime()).toBeGreaterThan(doc.updatedAt.getTime());
  });

  it("changes status", async () => {
    const doc = await insertDoc({ status: "draft" });

    const updated = await updateDocument({
      documentId: doc.id,
      patch: { status: "effective" },
      actorUserId: userId,
    });

    expect(updated.status).toBe("effective");
  });

  it("sets and then clears a nullable field (effectiveDate) via explicit null", async () => {
    const doc = await insertDoc();

    const withDate = await updateDocument({
      documentId: doc.id,
      patch: { effectiveDate: "2026-01-01" },
      actorUserId: userId,
    });
    expect(withDate.effectiveDate).toBe("2026-01-01");

    const cleared = await updateDocument({
      documentId: doc.id,
      patch: { effectiveDate: null },
      actorUserId: userId,
    });
    expect(cleared.effectiveDate).toBeNull();
  });

  it("sets supersedesDocumentId to another existing document", async () => {
    const original = await insertDoc();
    const revision = await insertDoc();

    const updated = await updateDocument({
      documentId: revision.id,
      patch: { supersedesDocumentId: original.id },
      actorUserId: userId,
    });

    expect(updated.supersedesDocumentId).toBe(original.id);
  });

  it("rejects a document superseding itself", async () => {
    const doc = await insertDoc();

    await expect(
      updateDocument({
        documentId: doc.id,
        patch: { supersedesDocumentId: doc.id },
        actorUserId: userId,
      }),
    ).rejects.toBeInstanceOf(SelfSupersedeError);
  });

  it("throws DocumentNotFoundError for an unknown document id", async () => {
    await expect(
      updateDocument({
        documentId: randomUUID(),
        patch: { title: "Tidak ada" },
        actorUserId: userId,
      }),
    ).rejects.toBeInstanceOf(DocumentNotFoundError);
  });

  it("records an audit event for a successful update", async () => {
    const doc = await insertDoc();

    await updateDocument({
      documentId: doc.id,
      patch: { title: "Dicatat di audit" },
      actorUserId: userId,
    });

    const [event] = await db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.resourceId, doc.id))
      .orderBy(desc(auditEvents.createdAt))
      .limit(1);

    expect(event).toMatchObject({
      actorUserId: userId,
      action: "update_document",
      resourceType: "document",
      result: "success",
    });
  });
});
