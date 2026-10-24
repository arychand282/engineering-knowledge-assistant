import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { db, pool } from "@/lib/db";
import { auditEvents, documents, users } from "@/lib/db/schema";
import {
  findDocumentById,
  listDocuments as listDocumentsRepo,
} from "@/server/repositories/document.repository";
import { DocumentNotFoundError, SelfSupersedeError } from "@/server/usecases/documents/errors";
import { updateDocument } from "@/server/usecases/documents/update-document.usecase";

let userId: string;
let userEmail: string;
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
  userEmail = user.email;
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

  it("stamps approvedBy/approvedAt (server-controlled) when status newly becomes effective", async () => {
    const doc = await insertDoc({ status: "draft" });
    expect(doc.approvedBy).toBeNull();
    expect(doc.approvedAt).toBeNull();

    const before = new Date();
    const updated = await updateDocument({
      documentId: doc.id,
      patch: { status: "effective" },
      actorUserId: userId,
    });

    expect(updated.approvedBy).toBe(userId);
    expect(updated.approvedAt).not.toBeNull();
    expect(updated.approvedAt!.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });

  it("resolves the approver's email via findDocumentById/listDocuments (not the PATCH response itself)", async () => {
    const doc = await insertDoc({ status: "draft" });

    const patched = await updateDocument({
      documentId: doc.id,
      patch: { status: "effective" },
      actorUserId: userId,
    });
    // The raw UPDATE...RETURNING result has no join — email resolution is a read-side
    // concern (findDocumentById/listDocuments), not something PATCH's response carries.
    expect("approvedByEmail" in patched).toBe(false);

    const fetched = await findDocumentById(doc.id);
    expect(fetched?.approvedByEmail).toBe(userEmail);

    const { items } = await listDocumentsRepo({ page: 1, pageSize: 50 });
    const listed = items.find((item) => item.id === doc.id);
    expect(listed?.approvedByEmail).toBe(userEmail);
  });

  it("does not re-stamp approvedAt when already effective and re-patched", async () => {
    const doc = await insertDoc({ status: "draft" });
    const firstApproval = await updateDocument({
      documentId: doc.id,
      patch: { status: "effective" },
      actorUserId: userId,
    });

    const secondUpdate = await updateDocument({
      documentId: doc.id,
      patch: { title: "Judul diubah setelah efektif" },
      actorUserId: userId,
    });

    expect(secondUpdate.approvedAt!.getTime()).toBe(firstApproval.approvedAt!.getTime());
    expect(secondUpdate.approvedBy).toBe(firstApproval.approvedBy);
  });

  it("preserves approvedBy/approvedAt as history when status moves away from effective", async () => {
    const doc = await insertDoc({ status: "draft" });
    const approved = await updateDocument({
      documentId: doc.id,
      patch: { status: "effective" },
      actorUserId: userId,
    });

    const superseded = await updateDocument({
      documentId: doc.id,
      patch: { status: "superseded" },
      actorUserId: userId,
    });

    expect(superseded.status).toBe("superseded");
    expect(superseded.approvedBy).toBe(approved.approvedBy);
    expect(superseded.approvedAt!.getTime()).toBe(approved.approvedAt!.getTime());
  });

  it("records a separate approve_document audit event only on a genuine transition to effective", async () => {
    const doc = await insertDoc({ status: "draft" });

    await updateDocument({
      documentId: doc.id,
      patch: { title: "Bukan perubahan status" },
      actorUserId: userId,
    });
    const beforeApproval = await db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.resourceId, doc.id), eq(auditEvents.action, "approve_document")));
    expect(beforeApproval).toHaveLength(0);

    await updateDocument({
      documentId: doc.id,
      patch: { status: "effective" },
      actorUserId: userId,
    });
    const afterApproval = await db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.resourceId, doc.id), eq(auditEvents.action, "approve_document")));
    expect(afterApproval).toHaveLength(1);
    expect(afterApproval[0]).toMatchObject({ actorUserId: userId, result: "success" });
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
