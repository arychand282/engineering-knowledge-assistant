import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { db, pool } from "@/lib/db";
import { auditEvents, documentAccess, documents, roles, userRoles, users } from "@/lib/db/schema";
import { getAccessibleDocumentIds } from "@/server/repositories/document-access.repository";
import {
  AccessGrantNotFoundError,
  DocumentNotFoundError,
  DuplicateAccessGrantError,
  UnknownRoleError,
} from "@/server/usecases/documents/errors";
import { grantDocumentAccess } from "@/server/usecases/documents/grant-document-access.usecase";
import { listDocumentAccess } from "@/server/usecases/documents/list-document-access.usecase";
import { revokeDocumentAccess } from "@/server/usecases/documents/revoke-document-access.usecase";

let userId: string;
let engineerRoleId: string;
const createdDocumentIds: string[] = [];

async function ensureRoleId(name: string): Promise<string> {
  const [existing] = await db.select().from(roles).where(eq(roles.name, name));
  if (existing) {
    return existing.id;
  }
  const [created] = await db.insert(roles).values({ name }).returning();
  return created.id;
}

function fakeDocument(overrides: Partial<typeof documents.$inferInsert> = {}) {
  return {
    title: "Dokumen Uji Akses",
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
    .values({ email: `access-test-${randomUUID()}@example.test`, name: "Access Test User" })
    .returning();
  userId = user.id;
  engineerRoleId = await ensureRoleId("engineer");
});

afterEach(async () => {
  for (const id of createdDocumentIds.splice(0)) {
    await db.delete(documents).where(eq(documents.id, id));
  }
});

afterAll(async () => {
  await db.delete(users).where(eq(users.id, userId));
  await pool.end();
});

describe("grantDocumentAccess", () => {
  it("creates a grant and returns it with the resolved role name", async () => {
    const doc = await insertDoc();

    const grant = await grantDocumentAccess({
      documentId: doc.id,
      roleName: "engineer",
      actorUserId: userId,
    });

    expect(grant).toMatchObject({
      documentId: doc.id,
      roleId: engineerRoleId,
      roleName: "engineer",
    });
  });

  it("actually grants retrieval access (ties into getAccessibleDocumentIds)", async () => {
    const doc = await insertDoc();
    const [grantee] = await db
      .insert(users)
      .values({ email: `grantee-${randomUUID()}@example.test`, name: "Grantee" })
      .returning();
    try {
      const before = await getAccessibleDocumentIds(grantee.id);
      expect(before).not.toContain(doc.id);

      await grantDocumentAccess({ documentId: doc.id, roleName: "engineer", actorUserId: userId });
      await db.insert(userRoles).values({ userId: grantee.id, roleId: engineerRoleId });

      const after = await getAccessibleDocumentIds(grantee.id);
      expect(after).toContain(doc.id);
    } finally {
      await db.delete(userRoles).where(eq(userRoles.userId, grantee.id));
      await db.delete(users).where(eq(users.id, grantee.id));
    }
  });

  it("rejects a duplicate grant for the same role", async () => {
    const doc = await insertDoc();
    await grantDocumentAccess({ documentId: doc.id, roleName: "engineer", actorUserId: userId });

    await expect(
      grantDocumentAccess({ documentId: doc.id, roleName: "engineer", actorUserId: userId }),
    ).rejects.toBeInstanceOf(DuplicateAccessGrantError);
  });

  it("rejects a duplicate grant under a real race (concurrent requests, not sequential) — regression: the pre-insert SELECT check alone had a TOCTOU gap with nothing backing it at the DB level, so a race could silently create two access-control rows for the same document+role instead of one request winning and the other getting a clean 409", async () => {
    const doc = await insertDoc();

    const results = await Promise.allSettled([
      grantDocumentAccess({ documentId: doc.id, roleName: "engineer", actorUserId: userId }),
      grantDocumentAccess({ documentId: doc.id, roleName: "engineer", actorUserId: userId }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(DuplicateAccessGrantError);

    const grants = await db
      .select()
      .from(documentAccess)
      .where(and(eq(documentAccess.documentId, doc.id), eq(documentAccess.roleId, engineerRoleId)));
    expect(grants).toHaveLength(1);
  });

  it("rejects an unknown role name", async () => {
    const doc = await insertDoc();
    await expect(
      grantDocumentAccess({ documentId: doc.id, roleName: "superuser", actorUserId: userId }),
    ).rejects.toBeInstanceOf(UnknownRoleError);
  });

  it("throws DocumentNotFoundError for an unknown document id", async () => {
    await expect(
      grantDocumentAccess({ documentId: randomUUID(), roleName: "engineer", actorUserId: userId }),
    ).rejects.toBeInstanceOf(DocumentNotFoundError);
  });

  it("records an audit event", async () => {
    const doc = await insertDoc();
    await grantDocumentAccess({ documentId: doc.id, roleName: "viewer", actorUserId: userId });

    const [event] = await db.select().from(auditEvents).where(eq(auditEvents.resourceId, doc.id));
    expect(event).toMatchObject({
      actorUserId: userId,
      action: "grant_document_access",
      resourceType: "document",
      result: "success",
    });
  });
});

describe("listDocumentAccess", () => {
  it("lists every current grant for a document", async () => {
    const doc = await insertDoc();
    await grantDocumentAccess({ documentId: doc.id, roleName: "engineer", actorUserId: userId });
    await grantDocumentAccess({ documentId: doc.id, roleName: "viewer", actorUserId: userId });

    const grants = await listDocumentAccess(doc.id);
    expect(grants.map((g) => g.roleName).sort()).toEqual(["engineer", "viewer"]);
  });

  it("throws DocumentNotFoundError for an unknown document id", async () => {
    await expect(listDocumentAccess(randomUUID())).rejects.toBeInstanceOf(DocumentNotFoundError);
  });
});

describe("revokeDocumentAccess", () => {
  it("removes a grant", async () => {
    const doc = await insertDoc();
    const grant = await grantDocumentAccess({
      documentId: doc.id,
      roleName: "engineer",
      actorUserId: userId,
    });

    await revokeDocumentAccess({ documentId: doc.id, accessId: grant.id, actorUserId: userId });

    const remaining = await listDocumentAccess(doc.id);
    expect(remaining).toHaveLength(0);
  });

  it("throws AccessGrantNotFoundError for an unknown access id", async () => {
    const doc = await insertDoc();
    await expect(
      revokeDocumentAccess({ documentId: doc.id, accessId: randomUUID(), actorUserId: userId }),
    ).rejects.toBeInstanceOf(AccessGrantNotFoundError);
  });

  it("refuses to revoke a grant that belongs to a different document", async () => {
    const docA = await insertDoc();
    const docB = await insertDoc();
    const grant = await grantDocumentAccess({
      documentId: docA.id,
      roleName: "engineer",
      actorUserId: userId,
    });

    await expect(
      revokeDocumentAccess({ documentId: docB.id, accessId: grant.id, actorUserId: userId }),
    ).rejects.toBeInstanceOf(AccessGrantNotFoundError);
    // Still there on the document it actually belongs to.
    expect(await listDocumentAccess(docA.id)).toHaveLength(1);
  });

  it("records an audit event", async () => {
    const doc = await insertDoc();
    const grant = await grantDocumentAccess({
      documentId: doc.id,
      roleName: "engineer",
      actorUserId: userId,
    });
    await revokeDocumentAccess({ documentId: doc.id, accessId: grant.id, actorUserId: userId });

    const [event] = await db
      .select()
      .from(auditEvents)
      .where(
        and(eq(auditEvents.action, "revoke_document_access"), eq(auditEvents.resourceId, doc.id)),
      );
    expect(event).toMatchObject({
      actorUserId: userId,
      resourceType: "document",
      resourceId: doc.id,
      result: "success",
    });
  });
});
