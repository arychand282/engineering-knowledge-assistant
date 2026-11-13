import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ai/ollama-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/ollama-client")>();
  return { ...actual, generateChatCompletion: vi.fn(actual.generateChatCompletion) };
});

import { embedTexts, generateChatCompletion } from "@/lib/ai/ollama-client";
import { db, pool } from "@/lib/db";
import {
  documentAccess,
  documentChunks,
  documents,
  roles,
  userRoles,
  users,
} from "@/lib/db/schema";
import { env } from "@/lib/env";
import { searchDocuments } from "@/server/usecases/retrieval/search-documents.usecase";

const mockedGenerateChatCompletion = vi.mocked(generateChatCompletion);

afterEach(() => {
  vi.clearAllMocks();
});

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
let chunkA1Id: string;
let chunkA2Id: string;
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
  // Second chunk of docA itself (not a separate document) — scores close to contentA for
  // the shared test query (~0.90 vs ~0.92, well inside VECTOR_SIMILARITY_MARGIN's default
  // 0.2 gap), unlike docB/docC which score ~0.6 and get filtered out post-fix. The
  // RERANK_ENABLED tests below need two genuinely-plausible candidates to reorder between;
  // reusing an unrelated document for that (as before this fix) no longer reflects reality.
  const contentA2 =
    "Katup pelepas tekanan boiler wajib diuji oleh teknisi bersertifikat setiap minggu untuk menjaga keselamatan.";

  const [embeddingA, embeddingB, embeddingC, embeddingA2] = await embedTexts([
    contentA,
    contentB,
    contentC,
    contentA2,
  ]);

  const insertedChunks = await db
    .insert(documentChunks)
    .values([
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
      {
        documentId: docAId,
        pageStart: 1,
        pageEnd: 1,
        chunkIndex: 1,
        content: contentA2,
        embedding: embeddingA2,
      },
    ])
    .returning();

  chunkA1Id = insertedChunks.find((c) => c.content === contentA)!.id;
  chunkA2Id = insertedChunks.find((c) => c.content === contentA2)!.id;
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

  it("excludes an accessible but semantically unrelated chunk (VECTOR_SIMILARITY_MARGIN)", async () => {
    const result = await searchDocuments({
      query: "keselamatan boiler tekanan tinggi",
      userId: userGrantedId,
    });

    // docC ("pemesanan alat tulis kantor") is accessible to this user — same role as
    // docA — but has nothing to do with the query. On a corpus this small there aren't
    // enough real candidates to naturally push an unrelated chunk out of the top-K by
    // rank alone; without a minimum similarity floor it would still show up here.
    expect(result.results.some((r) => r.documentId === docCId)).toBe(false);
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

  it("never calls the reranker when RERANK_ENABLED is off (the default)", async () => {
    const result = await searchDocuments({
      query: "keselamatan boiler tekanan tinggi",
      userId: userGrantedId,
    });

    expect(result.reranked).toBe(false);
    expect(mockedGenerateChatCompletion).not.toHaveBeenCalled();
  });
});

describe("searchDocuments with RERANK_ENABLED", () => {
  const originalRerankEnabled = env.RERANK_ENABLED;
  const originalChatProvider = env.CHAT_PROVIDER;

  afterEach(() => {
    env.RERANK_ENABLED = originalRerankEnabled;
    env.CHAT_PROVIDER = originalChatProvider;
  });

  it("reorders results using the reranker's relevance scores", async () => {
    env.RERANK_ENABLED = true;
    env.CHAT_PROVIDER = "local";

    // Without reranking, chunkA1 wins this query (asserted in the sibling test above —
    // both chunkA1/chunkA2 belong to docA and are close enough in score to both survive
    // VECTOR_SIMILARITY_MARGIN, unlike docB/docC which are filtered out as irrelevant).
    // The mock gives the LAST-listed candidate the highest score — since chunkA1 naturally
    // ranks first (so is listed first), this forces a real order flip: chunkA2 must win
    // instead, proving the final order actually came from the reranker.
    mockedGenerateChatCompletion.mockImplementationOnce(async (messages) => {
      const prompt = messages[messages.length - 1].content;
      const chunkIdMatches = [...prompt.matchAll(/\[chunk:([0-9a-f-]+)\]/g)].map((m) => m[1]);
      const ranking = chunkIdMatches.map((chunk_id, index) => ({ chunk_id, relevance: index }));
      return JSON.stringify({ ranking });
    });

    const result = await searchDocuments({
      query: "keselamatan boiler tekanan tinggi",
      userId: userGrantedId,
    });

    expect(mockedGenerateChatCompletion).toHaveBeenCalledTimes(1);
    expect(result.reranked).toBe(true);
    expect(result.results[0].chunkId).toBe(chunkA2Id);
  });

  it("falls back to the original (unreranked) order when the model returns malformed JSON", async () => {
    env.RERANK_ENABLED = true;
    env.CHAT_PROVIDER = "local";
    mockedGenerateChatCompletion.mockResolvedValueOnce("not valid json");

    const result = await searchDocuments({
      query: "keselamatan boiler tekanan tinggi",
      userId: userGrantedId,
    });

    expect(result.reranked).toBe(false);
    expect(result.results[0].chunkId).toBe(chunkA1Id); // same winner as the non-rerank test
  });

  it("skips reranking entirely when CHAT_PROVIDER is not local", async () => {
    env.RERANK_ENABLED = true;
    env.CHAT_PROVIDER = "gemini";

    const result = await searchDocuments({
      query: "keselamatan boiler tekanan tinggi",
      userId: userGrantedId,
    });

    expect(result.reranked).toBe(false);
    expect(mockedGenerateChatCompletion).not.toHaveBeenCalled();
  });
});
