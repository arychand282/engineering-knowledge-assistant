import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { embedTexts } from "@/lib/ai/ollama-client";
import { db, pool } from "@/lib/db";
import {
  conversations,
  documentChunks,
  documentPages,
  documents,
  messages,
  messageSources,
  users,
} from "@/lib/db/schema";
import {
  getConversation,
  listConversations,
  removeConversation,
} from "@/server/usecases/chat/manage-conversation.usecase";
import { ConversationNotFoundError } from "@/server/usecases/chat/errors";

let ownerId: string;
let strangerId: string;
const createdConversationIds: string[] = [];
const createdDocumentIds: string[] = [];

function fakeDocument(overrides: Partial<typeof documents.$inferInsert> & { uploadedBy: string }) {
  return {
    title: "Dokumen Uji Riwayat Chat",
    documentNumber: `DOC-${randomUUID()}`,
    documentType: "procedure",
    revision: "2",
    originalFilename: "uji.pdf",
    mimeType: "application/pdf",
    fileSize: 10,
    sha256: randomUUID().replace(/-/g, "").padEnd(64, "0"),
    storageKey: `documents/${randomUUID()}.pdf`,
    ...overrides,
  };
}

beforeAll(async () => {
  const [owner] = await db
    .insert(users)
    .values({ email: `owner-${randomUUID()}@example.test`, name: "Owner" })
    .returning();
  const [stranger] = await db
    .insert(users)
    .values({ email: `stranger-${randomUUID()}@example.test`, name: "Stranger" })
    .returning();
  ownerId = owner.id;
  strangerId = stranger.id;
});

afterAll(async () => {
  await db.delete(conversations).where(inArray(conversations.id, createdConversationIds));
  for (const id of createdDocumentIds) {
    await db.delete(documents).where(inArray(documents.id, [id]));
  }
  await db.delete(users).where(inArray(users.id, [ownerId, strangerId]));
  await pool.end();
});

describe("manage-conversation usecases", () => {
  it("lists only the requesting user's conversations", async () => {
    const [ownConversation] = await db
      .insert(conversations)
      .values({ userId: ownerId, title: "Punya owner" })
      .returning();
    const [otherConversation] = await db
      .insert(conversations)
      .values({ userId: strangerId, title: "Punya stranger" })
      .returning();
    createdConversationIds.push(ownConversation.id, otherConversation.id);

    const result = await listConversations(ownerId);

    expect(result.map((c) => c.id)).toContain(ownConversation.id);
    expect(result.map((c) => c.id)).not.toContain(otherConversation.id);
  });

  it("returns messages with their sources for the owner", async () => {
    const [conversation] = await db.insert(conversations).values({ userId: ownerId }).returning();
    createdConversationIds.push(conversation.id);
    const [message] = await db
      .insert(messages)
      .values({
        conversationId: conversation.id,
        role: "assistant",
        content: "jawaban",
        answerStatus: "answered",
      })
      .returning();

    const result = await getConversation(conversation.id, ownerId);

    expect(result.conversation.id).toBe(conversation.id);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].id).toBe(message.id);
    expect(result.messages[0].sources).toEqual([]);
  });

  it("resolves documentTitle/documentNumber/revision and OCR provenance for a real source (regression: history view previously returned raw message_sources rows with no document join, so the chat UI's source card rendered 'undefined' for a reopened past conversation)", async () => {
    const [doc] = await db
      .insert(documents)
      .values(fakeDocument({ uploadedBy: ownerId }))
      .returning();
    createdDocumentIds.push(doc.id);
    await db.insert(documentPages).values({
      documentId: doc.id,
      pageNumber: 3,
      extractionStatus: "success",
      isOcr: true,
      ocrConfidence: 87.5,
    });
    const [embedding] = await embedTexts(["Konten halaman hasil OCR."]);
    const [chunk] = await db
      .insert(documentChunks)
      .values({
        documentId: doc.id,
        pageStart: 3,
        pageEnd: 3,
        chunkIndex: 0,
        content: "Konten halaman hasil OCR.",
        embedding,
      })
      .returning();

    const [conversation] = await db.insert(conversations).values({ userId: ownerId }).returning();
    createdConversationIds.push(conversation.id);
    const [message] = await db
      .insert(messages)
      .values({
        conversationId: conversation.id,
        role: "assistant",
        content: "jawaban",
        answerStatus: "answered",
      })
      .returning();
    await db.insert(messageSources).values({
      messageId: message.id,
      documentId: doc.id,
      chunkId: chunk.id,
      pageNumber: 3,
      quotedText: "Konten halaman hasil OCR.",
    });

    const result = await getConversation(conversation.id, ownerId);

    expect(result.messages[0].sources).toHaveLength(1);
    expect(result.messages[0].sources[0]).toMatchObject({
      documentTitle: doc.title,
      documentNumber: doc.documentNumber,
      revision: doc.revision,
      pageNumber: 3,
      isOcr: true,
      ocrConfidence: 87.5,
    });
  }, 30_000);

  it("prevents a different user (IDOR) from reading someone else's conversation", async () => {
    const [conversation] = await db.insert(conversations).values({ userId: ownerId }).returning();
    createdConversationIds.push(conversation.id);

    await expect(getConversation(conversation.id, strangerId)).rejects.toBeInstanceOf(
      ConversationNotFoundError,
    );
  });

  it("prevents a different user (IDOR) from deleting someone else's conversation", async () => {
    const [conversation] = await db.insert(conversations).values({ userId: ownerId }).returning();
    createdConversationIds.push(conversation.id);

    await expect(removeConversation(conversation.id, strangerId)).rejects.toBeInstanceOf(
      ConversationNotFoundError,
    );

    const stillExists = await db
      .select()
      .from(conversations)
      .where(inArray(conversations.id, [conversation.id]));
    expect(stillExists).toHaveLength(1);
  });

  it("deletes the conversation (and cascades messages/sources) for its owner", async () => {
    const [conversation] = await db.insert(conversations).values({ userId: ownerId }).returning();
    const [message] = await db
      .insert(messages)
      .values({ conversationId: conversation.id, role: "user", content: "pertanyaan" })
      .returning();

    await removeConversation(conversation.id, ownerId);

    const remainingConversation = await db
      .select()
      .from(conversations)
      .where(inArray(conversations.id, [conversation.id]));
    const remainingMessage = await db
      .select()
      .from(messages)
      .where(inArray(messages.id, [message.id]));
    expect(remainingConversation).toHaveLength(0);
    expect(remainingMessage).toHaveLength(0);
  });
});
