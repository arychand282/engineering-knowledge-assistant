import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ai/ollama-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/ollama-client")>();
  return { ...actual, generateChatCompletion: vi.fn() };
});

import { OllamaUnavailableError, embedTexts, generateChatCompletion } from "@/lib/ai/ollama-client";
import { db, pool } from "@/lib/db";
import { env } from "@/lib/env";
import {
  conversations,
  documentAccess,
  documentChunks,
  documentPages,
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
    title: "Chat Test Document",
    documentNumber: `DOC-${randomUUID()}`,
    documentType: "procedure",
    revision: "0",
    originalFilename: "test.pdf",
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
      message: "Question with no documents at all",
      userId: otherUserId,
    });
    createdConversationIds.push(result.conversationId);

    expect(result.message.answerStatus).toBe("insufficient_evidence");
    expect(result.sources).toEqual([]);
    expect(mockedGenerateChatCompletion).not.toHaveBeenCalled();
  });

  it("answers using the model when relevant accessible evidence exists, and persists sources", async () => {
    const { chunk } = await seedAccessibleChunk(
      "High-pressure boiler safety procedures must be inspected daily by a certified technician.",
    );

    mockedGenerateChatCompletion.mockResolvedValue(
      JSON.stringify({
        status: "answered",
        answer: "A certified technician must check the boiler pressure every day.",
        claims: [
          {
            text: "A certified technician checks the boiler pressure.",
            source_chunk_ids: [chunk.id],
          },
        ],
      }),
    );

    const result = await askQuestion({ message: "Who checks the boiler pressure?", userId });
    createdConversationIds.push(result.conversationId);

    expect(result.message.answerStatus).toBe("answered");
    expect(result.message.content).toContain("certified technician");
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]).toMatchObject({
      chunkId: chunk.id,
      documentTitle: "Chat Test Document",
      isOcr: false,
      ocrConfidence: null,
    });

    const storedSources = await db
      .select()
      .from(messageSources)
      .where(inArray(messageSources.chunkId, [chunk.id]));
    expect(storedSources).toHaveLength(1);
  });

  it("surfaces OCR provenance (isOcr/ocrConfidence) on a source whose page was OCR'd", async () => {
    const { doc, chunk } = await seedAccessibleChunk(
      "The maximum vessel pressure is 15 bar according to this scanned document.",
    );
    await db.insert(documentPages).values({
      documentId: doc.id,
      pageNumber: 1,
      extractionStatus: "success",
      isOcr: true,
      ocrConfidence: 72,
    });

    mockedGenerateChatCompletion.mockResolvedValue(
      JSON.stringify({
        status: "answered",
        answer: "The maximum vessel pressure is 15 bar.",
        claims: [{ text: "15 bar.", source_chunk_ids: [chunk.id] }],
      }),
    );

    const result = await askQuestion({ message: "What is the maximum vessel pressure?", userId });
    createdConversationIds.push(result.conversationId);

    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]).toMatchObject({ isOcr: true, ocrConfidence: 72 });
  });

  it("downgrades to insufficient_evidence when the model cites a chunk id that was never retrieved", async () => {
    await seedAccessibleChunk("Document content unrelated to the model's claim.");

    mockedGenerateChatCompletion.mockResolvedValue(
      JSON.stringify({
        status: "answered",
        answer: "An answer that fabricates its source.",
        claims: [{ text: "False claim.", source_chunk_ids: [randomUUID()] }],
      }),
    );

    const result = await askQuestion({ message: "Any question", userId });
    createdConversationIds.push(result.conversationId);

    expect(result.message.answerStatus).toBe("insufficient_evidence");
    expect(result.sources).toEqual([]);
  });

  it("overrides a model-claimed conflict_detected to answered when sources span only one document", async () => {
    const { chunk } = await seedAccessibleChunk(
      "Head office fire evacuation procedures are carried out by the safety team every shift.",
    );

    // The model itself (incorrectly) claims a conflict despite citing a single document —
    // this is the exact behavior observed from a real qwen2.5:3b-instruct response.
    mockedGenerateChatCompletion.mockResolvedValue(
      JSON.stringify({
        status: "conflict_detected",
        answer: "Safety Team",
        claims: [
          { text: "The safety team carries out the evacuation.", source_chunk_ids: [chunk.id] },
        ],
      }),
    );

    const result = await askQuestion({
      message: "Who is responsible for carrying out the fire evacuation?",
      userId,
    });
    createdConversationIds.push(result.conversationId);

    expect(result.message.answerStatus).toBe("answered");
    expect(result.message.content).toBe("Safety Team");
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
      "The maximum boiler pressure limit is 10 bar according to the old revision.",
      "The maximum boiler pressure limit is 12 bar according to the new revision.",
    ]);
    await db.insert(documentChunks).values([
      {
        documentId: oldDoc.id,
        pageStart: 1,
        pageEnd: 1,
        chunkIndex: 0,
        content: "The maximum boiler pressure limit is 10 bar according to the old revision.",
        embedding: embeddingOld,
      },
      {
        documentId: newDoc.id,
        pageStart: 1,
        pageEnd: 1,
        chunkIndex: 0,
        content: "The maximum boiler pressure limit is 12 bar according to the new revision.",
        embedding: embeddingNew,
      },
    ]);

    const result = await askQuestion({
      message: "What is the maximum boiler pressure limit?",
      userId,
    });
    createdConversationIds.push(result.conversationId);

    expect(result.message.answerStatus).toBe("conflict_detected");
    expect(result.message.content).toContain(newDoc.documentNumber);
    expect(result.message.content).toContain(oldDoc.documentNumber);
    expect(mockedGenerateChatCompletion).not.toHaveBeenCalled();
  });

  it("reports a safe error status when the local chat model is unreachable", async () => {
    await seedAccessibleChunk("Head office fire evacuation procedure.");
    mockedGenerateChatCompletion.mockRejectedValue(new OllamaUnavailableError());

    const result = await askQuestion({
      message: "What is the fire evacuation procedure?",
      userId,
    });
    createdConversationIds.push(result.conversationId);

    expect(result.message.answerStatus).toBe("error");
    expect(result.sources).toEqual([]);
  });

  it("substitutes a real message when the model self-reports insufficient_evidence with a blank answer", async () => {
    // Real behavior observed in Task 7 evaluation (CHAT_PROVIDER=local,
    // qwen2.5:3b-instruct): the model can self-report insufficient_evidence directly
    // (not via either backend downgrade) while leaving `answer` blank.
    await seedAccessibleChunk("Document content not relevant to the question.");
    mockedGenerateChatCompletion.mockResolvedValue(
      JSON.stringify({ status: "insufficient_evidence", answer: "", claims: [] }),
    );

    const result = await askQuestion({ message: "Irrelevant question", userId });
    createdConversationIds.push(result.conversationId);

    expect(result.message.answerStatus).toBe("insufficient_evidence");
    expect(result.message.content.trim().length).toBeGreaterThan(0);
  });

  it("never attaches cited sources to a message whose final status is insufficient_evidence", async () => {
    // Real behavior observed in Task 7 evaluation: the model self-reported
    // insufficient_evidence while still citing a validatable chunk — showing a source
    // card on a message that says "can't answer" is self-contradictory to the user.
    const { chunk } = await seedAccessibleChunk(
      "Stationery orders arrive within 3 business days after the form is submitted.",
    );
    mockedGenerateChatCompletion.mockResolvedValue(
      JSON.stringify({
        status: "insufficient_evidence",
        answer: "The exact information cannot be confirmed from the documents provided.",
        claims: [{ text: "Wait time of 3 business days.", source_chunk_ids: [chunk.id] }],
      }),
    );

    const result = await askQuestion({ message: "How long is the order wait time?", userId });
    createdConversationIds.push(result.conversationId);

    expect(result.message.answerStatus).toBe("insufficient_evidence");
    expect(result.sources).toEqual([]);
  });

  it("sends prior turns of the same conversation as history to the model", async () => {
    const { chunk } = await seedAccessibleChunk(
      "The maximum boiler pressure is 12 bar according to the latest SOP.",
    );

    mockedGenerateChatCompletion.mockResolvedValueOnce(
      JSON.stringify({
        status: "answered",
        answer: "The maximum boiler pressure is 12 bar.",
        claims: [{ text: "Maximum pressure 12 bar.", source_chunk_ids: [chunk.id] }],
      }),
    );
    const first = await askQuestion({
      message: "What is the maximum boiler pressure?",
      userId,
    });
    createdConversationIds.push(first.conversationId);

    mockedGenerateChatCompletion.mockResolvedValueOnce(
      JSON.stringify({
        status: "answered",
        answer: "Per the same latest SOP.",
        claims: [{ text: "Per the latest SOP.", source_chunk_ids: [chunk.id] }],
      }),
    );
    await askQuestion({
      conversationId: first.conversationId,
      message: "Which SOP?",
      userId,
    });

    expect(mockedGenerateChatCompletion).toHaveBeenCalledTimes(2);
    const secondCallMessages = mockedGenerateChatCompletion.mock.calls[1][0];
    expect(secondCallMessages).toContainEqual({
      role: "user",
      content: "What is the maximum boiler pressure?",
    });
    expect(secondCallMessages).toContainEqual({
      role: "assistant",
      content: "The maximum boiler pressure is 12 bar.",
    });
    // The current turn's question (with RAG context attached) must come after history,
    // not be swallowed by it.
    expect(secondCallMessages.at(-1)?.content).toContain("Which SOP?");
  });

  it("omits history entirely when CHAT_HISTORY_LIMIT is 0", async () => {
    const { chunk } = await seedAccessibleChunk(
      "Test document content for conversation history limit.",
    );
    const original = env.CHAT_HISTORY_LIMIT;
    env.CHAT_HISTORY_LIMIT = 0;
    try {
      mockedGenerateChatCompletion.mockResolvedValueOnce(
        JSON.stringify({
          status: "answered",
          answer: "First answer.",
          claims: [{ text: "First claim.", source_chunk_ids: [chunk.id] }],
        }),
      );
      const first = await askQuestion({ message: "First question", userId });
      createdConversationIds.push(first.conversationId);

      mockedGenerateChatCompletion.mockResolvedValueOnce(
        JSON.stringify({
          status: "answered",
          answer: "Second answer.",
          claims: [{ text: "Second claim.", source_chunk_ids: [chunk.id] }],
        }),
      );
      await askQuestion({
        conversationId: first.conversationId,
        message: "Second question",
        userId,
      });

      const secondCallMessages = mockedGenerateChatCompletion.mock.calls[1][0];
      expect(secondCallMessages).toHaveLength(2); // system + current turn only
    } finally {
      env.CHAT_HISTORY_LIMIT = original;
    }
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
        message: "Trying to access someone else's conversation",
        userId,
      }),
    ).rejects.toBeInstanceOf(ConversationNotFoundError);
  });
});
