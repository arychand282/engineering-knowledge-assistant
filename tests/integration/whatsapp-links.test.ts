import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { db, pool } from "@/lib/db";
import { auditEvents, users } from "@/lib/db/schema";
import {
  PhoneAlreadyLinkedError,
  UserAlreadyLinkedError,
  UserNotFoundError,
  WhatsappLinkNotFoundError,
} from "@/server/usecases/whatsapp/errors";
import { linkWhatsappNumber } from "@/server/usecases/whatsapp/link-whatsapp-number.usecase";
import { listWhatsappLinks } from "@/server/usecases/whatsapp/list-whatsapp-links.usecase";
import { unlinkWhatsappNumber } from "@/server/usecases/whatsapp/unlink-whatsapp-number.usecase";

let adminId: string;
const createdUserIds: string[] = [];

async function createUser(email?: string) {
  const [user] = await db
    .insert(users)
    .values({ email: email ?? `wa-link-${randomUUID()}@example.test`, name: "WA Link Test User" })
    .returning();
  createdUserIds.push(user.id);
  return user;
}

beforeAll(async () => {
  const admin = await createUser(`wa-admin-${randomUUID()}@example.test`);
  adminId = admin.id;
});

afterEach(async () => {
  for (const id of createdUserIds.splice(0)) {
    if (id === adminId) continue; // keep the admin around for afterAll
    await db.delete(users).where(eq(users.id, id));
  }
});

afterAll(async () => {
  await db.delete(users).where(eq(users.id, adminId));
  await pool.end();
});

describe("linkWhatsappNumber", () => {
  it("creates a link", async () => {
    const user = await createUser();
    const link = await linkWhatsappNumber({
      phoneNumber: "6281111111111",
      userId: user.id,
      actorUserId: adminId,
    });
    expect(link).toMatchObject({ phoneNumber: "6281111111111", userId: user.id });
  });

  it("throws UserNotFoundError for an unknown user id", async () => {
    await expect(
      linkWhatsappNumber({
        phoneNumber: "6281111111112",
        userId: randomUUID(),
        actorUserId: adminId,
      }),
    ).rejects.toBeInstanceOf(UserNotFoundError);
  });

  it("rejects linking a phone number that's already linked to someone else", async () => {
    const userA = await createUser();
    const userB = await createUser();
    await linkWhatsappNumber({
      phoneNumber: "6281111111113",
      userId: userA.id,
      actorUserId: adminId,
    });

    await expect(
      linkWhatsappNumber({
        phoneNumber: "6281111111113",
        userId: userB.id,
        actorUserId: adminId,
      }),
    ).rejects.toBeInstanceOf(PhoneAlreadyLinkedError);
  });

  it("rejects linking a second phone number to a user who already has one", async () => {
    const user = await createUser();
    await linkWhatsappNumber({
      phoneNumber: "6281111111114",
      userId: user.id,
      actorUserId: adminId,
    });

    await expect(
      linkWhatsappNumber({
        phoneNumber: "6281111111115",
        userId: user.id,
        actorUserId: adminId,
      }),
    ).rejects.toBeInstanceOf(UserAlreadyLinkedError);
  });

  it("records an audit event", async () => {
    const user = await createUser();
    await linkWhatsappNumber({
      phoneNumber: "6281111111116",
      userId: user.id,
      actorUserId: adminId,
    });

    const [event] = await db.select().from(auditEvents).where(eq(auditEvents.resourceId, user.id));
    expect(event).toMatchObject({
      actorUserId: adminId,
      action: "link_whatsapp_number",
      resourceType: "user",
      result: "success",
    });
  });
});

describe("listWhatsappLinks", () => {
  it("lists links with the linked user's email resolved", async () => {
    const user = await createUser();
    await linkWhatsappNumber({
      phoneNumber: "6281111111117",
      userId: user.id,
      actorUserId: adminId,
    });

    const links = await listWhatsappLinks();
    const found = links.find((l) => l.phoneNumber === "6281111111117");
    expect(found?.userEmail).toBe(user.email);
  });
});

describe("unlinkWhatsappNumber", () => {
  it("removes a link", async () => {
    const user = await createUser();
    const link = await linkWhatsappNumber({
      phoneNumber: "6281111111118",
      userId: user.id,
      actorUserId: adminId,
    });

    await unlinkWhatsappNumber({ linkId: link.id, actorUserId: adminId });

    const links = await listWhatsappLinks();
    expect(links.find((l) => l.id === link.id)).toBeUndefined();
  });

  it("throws WhatsappLinkNotFoundError for an unknown link id", async () => {
    await expect(
      unlinkWhatsappNumber({ linkId: randomUUID(), actorUserId: adminId }),
    ).rejects.toBeInstanceOf(WhatsappLinkNotFoundError);
  });
});
