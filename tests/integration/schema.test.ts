import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db, pool } from "@/lib/db";
import {
  auditEvents,
  companySettings,
  conversations,
  documentAccess,
  documentChunks,
  documentPages,
  documents,
  messageSources,
  messages,
  projects,
  roles,
  sites,
  users,
} from "@/lib/db/schema";

class RollbackSignal extends Error {}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function inRolledBackTransaction(run: (tx: Tx) => Promise<void>) {
  await expect(
    db.transaction(async (tx) => {
      await run(tx);
      throw new RollbackSignal();
    }),
  ).rejects.toThrow(RollbackSignal);
}

afterAll(async () => {
  await pool.end();
});

describe("database schema (requires docker compose db running + migrations applied)", () => {
  it("connects and has the pgvector extension installed", async () => {
    const result = await db.execute<{ extname: string }>(
      sql`SELECT extname FROM pg_extension WHERE extname = 'vector'`,
    );
    expect(result.rows).toHaveLength(1);
  });

  it("supports the full ingestion + chat graph with correct constraints", async () => {
    await inRolledBackTransaction(async (tx) => {
      const [site] = await tx
        .insert(sites)
        .values({ code: `SITE-${randomUUID()}`, name: "Test Site", siteType: "office" })
        .returning();

      const [role] = await tx
        .insert(roles)
        .values({ name: `role-${randomUUID()}` })
        .returning();

      const [user] = await tx
        .insert(users)
        .values({ email: `user-${randomUUID()}@example.test`, name: "Test User" })
        .returning();

      const [project] = await tx
        .insert(projects)
        .values({ code: `PRJ-${randomUUID()}`, name: "Test Project", siteId: site.id })
        .returning();

      const [document] = await tx
        .insert(documents)
        .values({
          title: "Test Document",
          documentNumber: "DOC-001",
          documentType: "procedure",
          projectId: project.id,
          siteId: site.id,
          revision: "0",
          originalFilename: "test-document.pdf",
          mimeType: "application/pdf",
          fileSize: 1024,
          sha256: "0".repeat(64),
          storageKey: `storage/${randomUUID()}.pdf`,
          uploadedBy: user.id,
        })
        .returning();

      await tx.insert(documentAccess).values({ documentId: document.id, roleId: role.id });

      const [page] = await tx
        .insert(documentPages)
        .values({
          documentId: document.id,
          pageNumber: 1,
          extractedText: "Page 1 content",
          extractionStatus: "success",
        })
        .returning();

      const [chunk] = await tx
        .insert(documentChunks)
        .values({
          documentId: document.id,
          pageStart: page.pageNumber,
          pageEnd: page.pageNumber,
          chunkIndex: 0,
          content: "Page 1 text chunk",
          embedding: Array.from({ length: 768 }, () => 0),
        })
        .returning();

      const [conversation] = await tx
        .insert(conversations)
        .values({ userId: user.id, title: "Test Conversation" })
        .returning();

      const [message] = await tx
        .insert(messages)
        .values({
          conversationId: conversation.id,
          role: "assistant",
          content: "Answer based on the test document.",
          answerStatus: "answered",
        })
        .returning();

      await tx.insert(messageSources).values({
        messageId: message.id,
        documentId: document.id,
        chunkId: chunk.id,
        pageNumber: page.pageNumber,
        quotedText: "Page 1 content",
      });

      await tx.insert(auditEvents).values({
        actorUserId: user.id,
        action: "document.upload",
        resourceType: "document",
        resourceId: document.id,
        result: "success",
      });

      // Rejects a second row in the document_pages unique(document_id, page_number) index.
      await expect(
        tx
          .insert(documentPages)
          .values({ documentId: document.id, pageNumber: 1, extractionStatus: "success" }),
      ).rejects.toThrow();

      // Rejects a page_start/page_end pair that violates the ordering check constraint.
      await expect(
        tx.insert(documentChunks).values({
          documentId: document.id,
          pageStart: 5,
          pageEnd: 1,
          chunkIndex: 1,
          content: "Invalid page range",
        }),
      ).rejects.toThrow();
    });
  });

  it("enforces the company_settings singleton via CHECK (id = 1)", async () => {
    await inRolledBackTransaction(async (tx) => {
      await expect(
        tx.insert(companySettings).values({ id: 2, companyName: "Another Test Company" }),
      ).rejects.toThrow();
    });
  });
});
