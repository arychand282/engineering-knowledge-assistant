import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ai/ollama-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/ollama-client")>();
  return { ...actual, generateChatCompletion: vi.fn() };
});

import { embedTexts, generateChatCompletion } from "@/lib/ai/ollama-client";
import { env } from "@/lib/env";
import { resetRateLimits } from "@/lib/auth/rate-limit";
import { handleIncomingWhatsappMessage } from "@/lib/whatsapp/handle-incoming-message";
import { db, pool } from "@/lib/db";
import {
  conversations,
  documentAccess,
  documentChunks,
  documents,
  roles,
  userRoles,
  users,
  whatsappLinks,
} from "@/lib/db/schema";

const mockedGenerateChatCompletion = vi.mocked(generateChatCompletion);

let userId: string;
let roleId: string;
const createdDocumentIds: string[] = [];
const PHONE = "6281234567890";

function fakeDocument(overrides: Partial<typeof documents.$inferInsert> & { uploadedBy: string }) {
  return {
    title: "Dokumen Uji WhatsApp",
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
    .values({ email: `wa-test-${randomUUID()}@example.test`, name: "WA Test User" })
    .returning();
  userId = user.id;

  const [role] = await db
    .insert(roles)
    .values({ name: `wa-role-${randomUUID()}` })
    .returning();
  roleId = role.id;
  await db.insert(userRoles).values({ userId, roleId });
}, 30_000);

afterEach(async () => {
  vi.clearAllMocks();
  resetRateLimits();
  await db.delete(whatsappLinks).where(eq(whatsappLinks.userId, userId));
  for (const id of createdDocumentIds.splice(0).reverse()) {
    await db.delete(documentChunks).where(inArray(documentChunks.documentId, [id]));
    await db.delete(documentAccess).where(inArray(documentAccess.documentId, [id]));
    await db.delete(documents).where(inArray(documents.id, [id]));
  }
});

afterAll(async () => {
  await db.delete(userRoles).where(eq(userRoles.userId, userId));
  await db.delete(roles).where(eq(roles.id, roleId));
  await db.delete(users).where(eq(users.id, userId));
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

describe("handleIncomingWhatsappMessage", () => {
  it("replies with a not-registered message for an unlinked phone number", async () => {
    const reply = await handleIncomingWhatsappMessage({
      phoneNumber: "6289999999999",
      text: "halo",
    });
    expect(reply).toContain("belum terdaftar");
  });

  it("answers via the real askQuestion pipeline and folds sources into plain text", async () => {
    const { chunk } = await seedAccessibleChunk(
      "Prosedur keselamatan kerja boiler tekanan tinggi harus diperiksa setiap hari.",
    );
    await db.insert(whatsappLinks).values({ phoneNumber: PHONE, userId, linkedBy: userId });

    mockedGenerateChatCompletion.mockResolvedValue(
      JSON.stringify({
        status: "answered",
        answer: "Teknisi bersertifikat memeriksa tekanan boiler setiap hari.",
        claims: [
          { text: "Teknisi bersertifikat memeriksa tekanan boiler.", source_chunk_ids: [chunk.id] },
        ],
      }),
    );

    const reply = await handleIncomingWhatsappMessage({
      phoneNumber: PHONE,
      text: "Siapa yang memeriksa tekanan boiler?",
    });

    expect(reply).toContain("Teknisi bersertifikat memeriksa tekanan boiler setiap hari.");
    expect(reply).toContain("Sumber:");
    expect(reply).toContain("Dokumen Uji WhatsApp");
  });

  it("reuses the same conversation across messages (history-aware, like web chat)", async () => {
    const { chunk } = await seedAccessibleChunk("Tekanan maksimum boiler adalah 12 bar.");
    await db.insert(whatsappLinks).values({ phoneNumber: PHONE, userId, linkedBy: userId });

    mockedGenerateChatCompletion.mockResolvedValueOnce(
      JSON.stringify({
        status: "answered",
        answer: "Tekanan maksimum boiler adalah 12 bar.",
        claims: [{ text: "12 bar.", source_chunk_ids: [chunk.id] }],
      }),
    );
    await handleIncomingWhatsappMessage({ phoneNumber: PHONE, text: "Berapa tekanan maksimum?" });

    const [linkAfterFirst] = await db
      .select()
      .from(whatsappLinks)
      .where(eq(whatsappLinks.phoneNumber, PHONE));
    expect(linkAfterFirst.currentConversationId).not.toBeNull();

    mockedGenerateChatCompletion.mockResolvedValueOnce(
      JSON.stringify({ status: "answered", answer: "Masih 12 bar.", claims: [] }),
    );
    await handleIncomingWhatsappMessage({ phoneNumber: PHONE, text: "Yakin?" });

    const [linkAfterSecond] = await db
      .select()
      .from(whatsappLinks)
      .where(eq(whatsappLinks.phoneNumber, PHONE));
    expect(linkAfterSecond.currentConversationId).toBe(linkAfterFirst.currentConversationId);

    const secondCallMessages = mockedGenerateChatCompletion.mock.calls[1][0];
    expect(secondCallMessages).toContainEqual({
      role: "user",
      content: "Berapa tekanan maksimum?",
    });

    await db
      .delete(conversations)
      .where(eq(conversations.id, linkAfterFirst.currentConversationId!));
  });

  it("treats a deactivated user's linked number as not registered", async () => {
    const [deactivated] = await db
      .insert(users)
      .values({ email: `wa-deactivated-${randomUUID()}@example.test`, name: "Deactivated" })
      .returning();
    await db.insert(whatsappLinks).values({
      phoneNumber: "6287777777777",
      userId: deactivated.id,
      linkedBy: userId,
    });
    await db.update(users).set({ isActive: false }).where(eq(users.id, deactivated.id));

    try {
      const reply = await handleIncomingWhatsappMessage({
        phoneNumber: "6287777777777",
        text: "halo",
      });
      expect(reply).toContain("belum terdaftar");
      expect(mockedGenerateChatCompletion).not.toHaveBeenCalled();
    } finally {
      await db.delete(whatsappLinks).where(eq(whatsappLinks.userId, deactivated.id));
      await db.delete(users).where(eq(users.id, deactivated.id));
    }
  });

  it("shares the same rate-limit bucket as web chat (keyed by userId, not phone number)", async () => {
    await seedAccessibleChunk("Konten apa saja.");
    await db.insert(whatsappLinks).values({ phoneNumber: PHONE, userId, linkedBy: userId });

    const original = env.CHAT_RATE_LIMIT_MAX_ATTEMPTS;
    env.CHAT_RATE_LIMIT_MAX_ATTEMPTS = 1;
    try {
      mockedGenerateChatCompletion.mockResolvedValue(
        JSON.stringify({ status: "insufficient_evidence", answer: "", claims: [] }),
      );
      await handleIncomingWhatsappMessage({ phoneNumber: PHONE, text: "pertanyaan 1" });
      const reply = await handleIncomingWhatsappMessage({
        phoneNumber: PHONE,
        text: "pertanyaan 2",
      });
      expect(reply).toContain("Terlalu banyak pertanyaan");
    } finally {
      env.CHAT_RATE_LIMIT_MAX_ATTEMPTS = original;
    }
  });
});
