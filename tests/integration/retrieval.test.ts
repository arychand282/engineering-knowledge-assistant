import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { embedTexts } from "@/lib/ai/ollama-client";
import { db, pool } from "@/lib/db";
import {
  documentAccess,
  documentChunks,
  documents,
  roles,
  userRoles,
  users,
} from "@/lib/db/schema";
import { searchDocuments } from "@/server/usecases/retrieval/search-documents.usecase";

/**
 * Requires: `npm run db:up`, `npm run ai:up`, `npm run ai:pull-embedding-model`, and
 * migrations applied. Exercises real pgvector cosine search + Postgres full-text search
 * + real embeddings from the local Ollama runtime — not mocked.
 */

let userGrantedId: string;
let userOtherId: string;
let userNoRoleId: string;
let roleAId: string;
let roleBId: string;
let docAId: string;
let docBId: string;
let docCId: string;
const createdUserIds: string[] = [];
const createdRoleIds: string[] = [];
const createdDocumentIds: string[] = [];

function fakeDocument(overrides: Partial<typeof documents.$inferInsert> & { uploadedBy: string }) {
  return {
    title: "Dokumen Uji Retrieval",
    documentNumber: `DOC-${randomUUID()}`,
    documentType: "procedure",
    revision: "0",
    originalFilename: "uji.pdf",
    mimeType: "application/pdf",
    fileSize: 10,
    sha256: randomUUID().replace(/-/g, "").padEnd(64, "0"),
    storageKey: `documents/${randomUUID()}.pdf`,
    ...overrides,
  };
}

beforeAll(async () => {
  const [userGranted] = await db
    .insert(users)
    .values({ email: `granted-${randomUUID()}@example.test`, name: "User Granted" })
    .returning();
  const [userOther] = await db
    .insert(users)
    .values({ email: `other-${randomUUID()}@example.test`, name: "User Other" })
    .returning();
  const [userNoRole] = await db
    .insert(users)
    .values({ email: `norole-${randomUUID()}@example.test`, name: "User No Role" })
    .returning();
  userGrantedId = userGranted.id;
  userOtherId = userOther.id;
  userNoRoleId = userNoRole.id;
  createdUserIds.push(userGrantedId, userOtherId, userNoRoleId);

  const [roleA] = await db
    .insert(roles)
    .values({ name: `role-a-${randomUUID()}` })
    .returning();
  const [roleB] = await db
    .insert(roles)
    .values({ name: `role-b-${randomUUID()}` })
    .returning();
  roleAId = roleA.id;
  roleBId = roleB.id;
  createdRoleIds.push(roleAId, roleBId);

  await db.insert(userRoles).values([
    { userId: userGrantedId, roleId: roleAId },
    { userId: userOtherId, roleId: roleBId },
  ]);

  const [docA] = await db
    .insert(documents)
    .values(fakeDocument({ title: "Prosedur Boiler", uploadedBy: userGrantedId }))
    .returning();
  const [docB] = await db
    .insert(documents)
    .values(fakeDocument({ title: "Panduan Forklift", uploadedBy: userGrantedId }))
    .returning();
  const [docC] = await db
    .insert(documents)
    .values(
      fakeDocument({ title: "Prosedur Pemesanan Alat Tulis Kantor", uploadedBy: userGrantedId }),
    )
    .returning();
  docAId = docA.id;
  docBId = docB.id;
  docCId = docC.id;
  createdDocumentIds.push(docAId, docBId, docCId);

  // Default-deny: docA and docC only via roleA (userGranted); docB only via roleB (userOther).
  await db.insert(documentAccess).values([
    { documentId: docAId, roleId: roleAId },
    { documentId: docCId, roleId: roleAId },
    { documentId: docBId, roleId: roleBId },
  ]);

  const contentA =
    "Prosedur keselamatan kerja boiler tekanan tinggi harus diperiksa setiap hari oleh teknisi.";
  const contentB =
    "Panduan pemeliharaan forklift gudang logistik dilakukan setiap bulan oleh operator.";
  const contentC =
    "Prosedur pemesanan alat tulis kantor dilakukan melalui formulir permintaan barang.";

  const [embeddingA, embeddingB, embeddingC] = await embedTexts([contentA, contentB, contentC]);

  await db.insert(documentChunks).values([
    {
      documentId: docAId,
      pageStart: 1,
      pageEnd: 1,
      chunkIndex: 0,
      content: contentA,
      embedding: embeddingA,
    },
    {
      documentId: docBId,
      pageStart: 1,
      pageEnd: 1,
      chunkIndex: 0,
      content: contentB,
      embedding: embeddingB,
    },
    {
      documentId: docCId,
      pageStart: 1,
      pageEnd: 1,
      chunkIndex: 0,
      content: contentC,
      embedding: embeddingC,
    },
  ]);
}, 30_000);

afterAll(async () => {
  await db.delete(documentChunks).where(inArray(documentChunks.documentId, createdDocumentIds));
  await db.delete(documentAccess).where(inArray(documentAccess.documentId, createdDocumentIds));
  await db.delete(documents).where(inArray(documents.id, createdDocumentIds));
  await db.delete(userRoles).where(inArray(userRoles.userId, createdUserIds));
  await db.delete(roles).where(inArray(roles.id, createdRoleIds));
  await db.delete(users).where(inArray(users.id, createdUserIds));
  await pool.end();
});

describe("searchDocuments", () => {
  it("ranks the relevant accessible chunk above an unrelated accessible chunk", async () => {
    const result = await searchDocuments({
      query: "keselamatan boiler tekanan tinggi",
      userId: userGrantedId,
    });

    expect(result.vectorSearchAvailable).toBe(true);
    expect(result.results.length).toBeGreaterThan(0);
    expect(result.results[0].documentId).toBe(docAId);
    // docB belongs to a different role entirely — must never leak into userGranted's results.
    expect(result.results.some((r) => r.documentId === docBId)).toBe(false);
  });

  it("never returns a document outside the user's granted role (no cross-user leakage)", async () => {
    const result = await searchDocuments({
      query: "keselamatan boiler tekanan tinggi",
      userId: userOtherId,
    });

    // userOther can only ever see docB, regardless of how relevant docA/docC would be.
    expect(result.results.every((r) => r.documentId === docBId)).toBe(true);
  });

  it("returns nothing for a user with no role/document access at all", async () => {
    const result = await searchDocuments({
      query: "keselamatan boiler tekanan tinggi",
      userId: userNoRoleId,
    });

    expect(result.results).toEqual([]);
    expect(result.vectorSearchAvailable).toBe(false);
  });
});
