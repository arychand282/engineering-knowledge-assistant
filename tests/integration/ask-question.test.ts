import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ai/ollama-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/ollama-client")>();
  return { ...actual, generateChatCompletion: vi.fn() };
});

import { OllamaUnavailableError, embedTexts, generateChatCompletion } from "@/lib/ai/ollama-client";
import { db, pool } from "@/lib/db";
import {
  conversations,
  documentAccess,
  documentChunks,
  documents,
  messageSources,
  roles,
  userRoles,
  users,
} from "@/lib/db/schema";
import { askQuestion } from "@/server/usecases/chat/ask-question.usecase";
import { ConversationNotFoundError } from "@/server/usecases/chat/errors";

const mockedGenerateChatCompletion = vi.mocked(generateChatCompletion);

let userId: string;
let otherUserId: string;
let roleId: string;
const createdDocumentIds: string[] = [];
const createdConversationIds: string[] = [];

function fakeDocument(overrides: Partial<typeof documents.$inferInsert> & { uploadedBy: string }) {
  return {
    title: "Dokumen Uji Chat",
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
  const [user] = await db
    .insert(users)
    .values({ email: `chat-${randomUUID()}@example.test`, name: "Chat Test User" })
    .returning();
  const [otherUser] = await db
    .insert(users)
    .values({ email: `other-chat-${randomUUID()}@example.test`, name: "Other User" })
    .returning();
  userId = user.id;
  otherUserId = otherUser.id;

  const [role] = await db
    .insert(roles)
    .values({ name: `chat-role-${randomUUID()}` })
    .returning();
  roleId = role.id;
  await db.insert(userRoles).values({ userId, roleId });
}, 30_000);

afterEach(async () => {
  vi.clearAllMocks();
  for (const id of createdConversationIds.splice(0)) {
    await db.delete(conversations).where(inArray(conversations.id, [id]));
  }
  // Reverse order: a "newer" doc created after its "older" one may reference it via
  // supersedesDocumentId, so delete newest-first to satisfy the FK.
  for (const id of createdDocumentIds.splice(0).reverse()) {
    await db.delete(documentChunks).where(inArray(documentChunks.documentId, [id]));
    await db.delete(documentAccess).where(inArray(documentAccess.documentId, [id]));
    await db.delete(documents).where(inArray(documents.id, [id]));
  }
});

afterAll(async () => {
  await db.delete(userRoles).where(inArray(userRoles.userId, [userId]));
  await db.delete(roles).where(inArray(roles.id, [roleId]));
  await db.delete(users).where(inArray(users.id, [userId, otherUserId]));
  await pool.end();
});

async function seedAccessibleChunk(content: string) {
  const [doc] = await db
    .insert(documents)
    .values(fakeDocument({ uploadedBy: userId }))
    .returning();
  createdDocumentIds.push(doc.id);
  await db.insert(documentAccess).values({ documentId: doc.id, roleId });
  const [embedding] = await embedTexts([content]);
  const [chunk] = await db
    .insert(documentChunks)
    .values({ documentId: doc.id, pageStart: 1, pageEnd: 1, chunkIndex: 0, content, embedding })
    .returning();
  return { doc, chunk };
}

describe("askQuestion", () => {
  it("returns insufficient_evidence without calling the LLM when there is no accessible evidence", async () => {
    const result = await askQuestion({
      message: "Pertanyaan tanpa dokumen apa pun",
      userId: otherUserId,
    });
    createdConversationIds.push(result.conversationId);

    expect(result.message.answerStatus).toBe("insufficient_evidence");
    expect(result.sources).toEqual([]);
    expect(mockedGenerateChatCompletion).not.toHaveBeenCalled();
  });

  it("answers using the model when relevant accessible evidence exists, and persists sources", async () => {
    const { chunk } = await seedAccessibleChunk(
      "Prosedur keselamatan kerja boiler tekanan tinggi harus diperiksa setiap hari oleh teknisi bersertifikat.",
    );

    mockedGenerateChatCompletion.mockResolvedValue(
      JSON.stringify({
        status: "answered",
        answer: "Teknisi bersertifikat wajib memeriksa tekanan boiler setiap hari.",
        claims: [
          { text: "Teknisi bersertifikat memeriksa tekanan boiler.", source_chunk_ids: [chunk.id] },
        ],
      }),
    );

    const result = await askQuestion({ message: "Siapa yang memeriksa tekanan boiler?", userId });
    createdConversationIds.push(result.conversationId);

    expect(result.message.answerStatus).toBe("answered");
    expect(result.message.content).toContain("Teknisi bersertifikat");
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].chunkId).toBe(chunk.id);

    const storedSources = await db
      .select()
      .from(messageSources)
      .where(inArray(messageSources.chunkId, [chunk.id]));
    expect(storedSources).toHaveLength(1);
  });

  it("downgrades to insufficient_evidence when the model cites a chunk id that was never retrieved", async () => {
    await seedAccessibleChunk("Konten dokumen yang tidak terkait dengan klaim model.");

    mockedGenerateChatCompletion.mockResolvedValue(
      JSON.stringify({
        status: "answered",
        answer: "Jawaban yang mengarang sumber.",
        claims: [{ text: "Klaim palsu.", source_chunk_ids: [randomUUID()] }],
      }),
    );

    const result = await askQuestion({ message: "Pertanyaan apa saja", userId });
    createdConversationIds.push(result.conversationId);

    expect(result.message.answerStatus).toBe("insufficient_evidence");
    expect(result.sources).toEqual([]);
  });

  it("overrides a model-claimed conflict_detected to answered when sources span only one document", async () => {
    const { chunk } = await seedAccessibleChunk(
      "Prosedur evakuasi kebakaran gedung kantor pusat dilakukan oleh tim keselamatan setiap shift.",
    );

    // The model itself (incorrectly) claims a conflict despite citing a single document —
    // this is the exact behavior observed from a real qwen2.5:3b-instruct response.
    mockedGenerateChatCompletion.mockResolvedValue(
      JSON.stringify({
        status: "conflict_detected",
        answer: "Tim Keselamatan",
        claims: [{ text: "Tim keselamatan melakukan evakuasi.", source_chunk_ids: [chunk.id] }],
      }),
    );

    const result = await askQuestion({
      message: "Siapa yang bertugas melakukan evakuasi kebakaran?",
      userId,
    });
    createdConversationIds.push(result.conversationId);

    expect(result.message.answerStatus).toBe("answered");
    expect(result.message.content).toBe("Tim Keselamatan");
    expect(result.sources).toHaveLength(1);
  });

  it("detects a supersedes conflict and never calls the LLM", async () => {
    const [oldDoc] = await db
      .insert(documents)
      .values(fakeDocument({ uploadedBy: userId }))
      .returning();
    createdDocumentIds.push(oldDoc.id);
    const [newDoc] = await db
      .insert(documents)
      .values(fakeDocument({ uploadedBy: userId, supersedesDocumentId: oldDoc.id }))
      .returning();
    createdDocumentIds.push(newDoc.id);
    await db.insert(documentAccess).values([
      { documentId: oldDoc.id, roleId },
      { documentId: newDoc.id, roleId },
    ]);

    const [embeddingOld, embeddingNew] = await embedTexts([
      "Batas tekanan maksimum boiler adalah 10 bar menurut revisi lama.",
      "Batas tekanan maksimum boiler adalah 12 bar menurut revisi baru.",
    ]);
    await db.insert(documentChunks).values([
      {
        documentId: oldDoc.id,
        pageStart: 1,
        pageEnd: 1,
        chunkIndex: 0,
        content: "Batas tekanan maksimum boiler adalah 10 bar menurut revisi lama.",
        embedding: embeddingOld,
      },
      {
        documentId: newDoc.id,
        pageStart: 1,
        pageEnd: 1,
        chunkIndex: 0,
        content: "Batas tekanan maksimum boiler adalah 12 bar menurut revisi baru.",
        embedding: embeddingNew,
      },
    ]);

    const result = await askQuestion({ message: "Berapa batas tekanan maksimum boiler?", userId });
    createdConversationIds.push(result.conversationId);

    expect(result.message.answerStatus).toBe("conflict_detected");
    expect(result.message.content).toContain(newDoc.documentNumber);
    expect(result.message.content).toContain(oldDoc.documentNumber);
    expect(mockedGenerateChatCompletion).not.toHaveBeenCalled();
  });

  it("reports a safe error status when the local chat model is unreachable", async () => {
    await seedAccessibleChunk("Prosedur evakuasi kebakaran gedung kantor pusat.");
    mockedGenerateChatCompletion.mockRejectedValue(new OllamaUnavailableError());

    const result = await askQuestion({ message: "Bagaimana prosedur evakuasi kebakaran?", userId });
    createdConversationIds.push(result.conversationId);

    expect(result.message.answerStatus).toBe("error");
    expect(result.sources).toEqual([]);
  });

  it("substitutes a real message when the model self-reports insufficient_evidence with a blank answer", async () => {
    // Real behavior observed in Task 7 evaluation (CHAT_PROVIDER=local,
    // qwen2.5:3b-instruct): the model can self-report insufficient_evidence directly
    // (not via either backend downgrade) while leaving `answer` blank.
    await seedAccessibleChunk("Konten dokumen yang tidak relevan dengan pertanyaan.");
    mockedGenerateChatCompletion.mockResolvedValue(
      JSON.stringify({ status: "insufficient_evidence", answer: "", claims: [] }),
    );

    const result = await askQuestion({ message: "Pertanyaan tidak relevan", userId });
    createdConversationIds.push(result.conversationId);

    expect(result.message.answerStatus).toBe("insufficient_evidence");
    expect(result.message.content.trim().length).toBeGreaterThan(0);
  });

  it("never attaches cited sources to a message whose final status is insufficient_evidence", async () => {
    // Real behavior observed in Task 7 evaluation: the model self-reported
    // insufficient_evidence while still citing a validatable chunk — showing a source
    // card on a message that says "can't answer" is self-contradictory to the user.
    const { chunk } = await seedAccessibleChunk(
      "Pemesanan alat tulis kantor tiba dalam 3 hari kerja setelah formulir diajukan.",
    );
    mockedGenerateChatCompletion.mockResolvedValue(
      JSON.stringify({
        status: "insufficient_evidence",
        answer: "Informasi yang tepat tidak dapat dipastikan dari dokumen yang diberikan.",
        claims: [{ text: "Waktu tunggu 3 hari kerja.", source_chunk_ids: [chunk.id] }],
      }),
    );

    const result = await askQuestion({ message: "Berapa lama waktu tunggu pemesanan?", userId });
    createdConversationIds.push(result.conversationId);

    expect(result.message.answerStatus).toBe("insufficient_evidence");
    expect(result.sources).toEqual([]);
  });

  it("rejects asking into a conversation owned by a different user", async () => {
    const [conversation] = await db
      .insert(conversations)
      .values({ userId: otherUserId })
      .returning();
    createdConversationIds.push(conversation.id);

    await expect(
      askQuestion({
        conversationId: conversation.id,
        message: "Mencoba akses percakapan orang lain",
        userId,
      }),
    ).rejects.toBeInstanceOf(ConversationNotFoundError);
  });
});
