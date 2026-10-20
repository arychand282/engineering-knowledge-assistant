import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, pool } from "@/lib/db";
import { conversations, messages, users } from "@/lib/db/schema";
import {
  getConversation,
  listConversations,
  removeConversation,
} from "@/server/usecases/chat/manage-conversation.usecase";
import { ConversationNotFoundError } from "@/server/usecases/chat/errors";

let ownerId: string;
let strangerId: string;
const createdConversationIds: string[] = [];

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
