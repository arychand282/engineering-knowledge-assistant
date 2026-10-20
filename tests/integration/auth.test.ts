import { createHash, randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { hashPassword } from "@/lib/auth/password";
import { resetRateLimits } from "@/lib/auth/rate-limit";
import { db, pool } from "@/lib/db";
import {
  documentAccess,
  documentChunks,
  documents,
  roles,
  sessions,
  userRoles,
  users,
} from "@/lib/db/schema";
import { env } from "@/lib/env";
import { ALL_ROLES } from "@/server/auth/roles";
import { recordAuditEvent } from "@/server/repositories/audit-event.repository";
import { findActiveSessionByTokenHash } from "@/server/repositories/session.repository";
import { updateUser } from "@/server/usecases/admin/update-user.usecase";
import { UnknownRoleError, UserNotFoundError } from "@/server/usecases/admin/errors";
import {
  AccountDisabledError,
  InvalidCredentialsError,
  RateLimitedError,
} from "@/server/usecases/auth/errors";
import { login } from "@/server/usecases/auth/login.usecase";
import { logout } from "@/server/usecases/auth/logout.usecase";
import { resolveActorFromToken } from "@/server/usecases/auth/resolve-actor.usecase";
import { getDocument } from "@/server/usecases/documents/get-document.usecase";
import { DocumentNotFoundError } from "@/server/usecases/documents/errors";
import { listDocuments } from "@/server/usecases/documents/list-documents.usecase";

/** Reuses the real role rows if a previous seed already created them (PLANNING.md #10 base roles); never deletes them. */
async function ensureRoleId(name: string): Promise<string> {
  const [existing] = await db.select().from(roles).where(eq(roles.name, name));
  if (existing) {
    return existing.id;
  }
  const [created] = await db.insert(roles).values({ name }).returning();
  return created.id;
}

const PASSWORD = "CorrectHorseBatteryStaple1!";

let adminRoleId: string;
let documentControllerRoleId: string;
let engineerRoleId: string;
let viewerRoleId: string;

const createdUserIds: string[] = [];
const createdDocumentIds: string[] = [];

function fakeDocument(overrides: Partial<typeof documents.$inferInsert> & { uploadedBy: string }) {
  return {
    title: "Dokumen Uji Auth",
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

async function createUser(email: string, roleIds: string[] = [], isActive = true) {
  const passwordHash = await hashPassword(PASSWORD);
  const [user] = await db
    .insert(users)
    .values({ email, name: "Test User", passwordHash, isActive })
    .returning();
  createdUserIds.push(user.id);
  if (roleIds.length > 0) {
    await db.insert(userRoles).values(roleIds.map((roleId) => ({ userId: user.id, roleId })));
  }
  return user;
}

beforeAll(async () => {
  expect(ALL_ROLES).toContain("admin");
  adminRoleId = await ensureRoleId("admin");
  documentControllerRoleId = await ensureRoleId("document_controller");
  engineerRoleId = await ensureRoleId("engineer");
  viewerRoleId = await ensureRoleId("viewer");
});

afterEach(() => {
  resetRateLimits();
});

afterAll(async () => {
  await db.delete(documentChunks).where(inArray(documentChunks.documentId, createdDocumentIds));
  await db.delete(documentAccess).where(inArray(documentAccess.documentId, createdDocumentIds));
  await db.delete(documents).where(inArray(documents.id, createdDocumentIds));
  await db.delete(sessions).where(inArray(sessions.userId, createdUserIds));
  await db.delete(userRoles).where(inArray(userRoles.userId, createdUserIds));
  await db.delete(users).where(inArray(users.id, createdUserIds));
  await pool.end();
});

describe("login usecase", () => {
  it("logs in with correct credentials and creates a session", async () => {
    const user = await createUser(`login-ok-${randomUUID()}@example.test`, [viewerRoleId]);

    const result = await login({ email: user.email, password: PASSWORD, userAgent: null });

    expect(result.actor.id).toBe(user.id);
    expect(result.actor.roles).toEqual(["viewer"]);

    const actor = await resolveActorFromToken(result.token);
    expect(actor.id).toBe(user.id);
  });

  it("rejects a wrong password with the same error as an unknown email (no user enumeration)", async () => {
    const user = await createUser(`login-badpw-${randomUUID()}@example.test`);

    await expect(
      login({ email: user.email, password: "wrong-password", userAgent: null }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);

    await expect(
      login({
        email: `nobody-${randomUUID()}@example.test`,
        password: PASSWORD,
        userAgent: null,
      }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
  });

  it("rejects login for a deactivated account even with the correct password", async () => {
    const user = await createUser(`login-disabled-${randomUUID()}@example.test`, [], false);

    await expect(
      login({ email: user.email, password: PASSWORD, userAgent: null }),
    ).rejects.toBeInstanceOf(AccountDisabledError);
  });

  it("rate-limits repeated failed login attempts for the same email", async () => {
    const user = await createUser(`login-ratelimit-${randomUUID()}@example.test`);
    const original = env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS;
    env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS = 2;
    try {
      await login({ email: user.email, password: "wrong", userAgent: null }).catch(() => {});
      await login({ email: user.email, password: "wrong", userAgent: null }).catch(() => {});
      await expect(
        login({ email: user.email, password: "wrong", userAgent: null }),
      ).rejects.toBeInstanceOf(RateLimitedError);
    } finally {
      env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS = original;
    }
  });
});

describe("logout / session revocation", () => {
  it("invalidates the session immediately on logout", async () => {
    const user = await createUser(`logout-${randomUUID()}@example.test`, [viewerRoleId]);
    const { token } = await login({ email: user.email, password: PASSWORD, userAgent: null });

    await resolveActorFromToken(token); // sanity check: valid before logout
    await logout(token);

    await expect(resolveActorFromToken(token)).rejects.toThrow();
  });

  it("rejects an unknown/garbage token", async () => {
    await expect(resolveActorFromToken("not-a-real-token")).rejects.toThrow();
    await expect(resolveActorFromToken(null)).rejects.toThrow();
  });

  it("rejects a session whose expiry has already passed", async () => {
    const user = await createUser(`expired-${randomUUID()}@example.test`, [viewerRoleId]);
    const { token } = await login({ email: user.email, password: PASSWORD, userAgent: null });

    await db
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(sessions.userId, user.id));

    await expect(resolveActorFromToken(token)).rejects.toThrow();
  });
});

describe("admin updateUser", () => {
  it("revokes every active session immediately when an account is deactivated", async () => {
    const user = await createUser(`deactivate-${randomUUID()}@example.test`, [viewerRoleId]);
    const { token } = await login({ email: user.email, password: PASSWORD, userAgent: null });

    await updateUser({ userId: user.id, isActive: false, actorUserId: user.id });

    await expect(resolveActorFromToken(token)).rejects.toThrow();
    const stillHasActiveSession = await findActiveSessionByTokenHash(
      createHash("sha256").update(token).digest("hex"),
    );
    expect(stillHasActiveSession).toBeNull();
  });

  it("replaces a user's roles", async () => {
    const user = await createUser(`replace-roles-${randomUUID()}@example.test`, [viewerRoleId]);

    await updateUser({ userId: user.id, roleNames: ["engineer"], actorUserId: user.id });

    const { actor } = await login({ email: user.email, password: PASSWORD, userAgent: null });
    expect(actor.roles).toEqual(["engineer"]);
  });

  it("rejects an unknown role name", async () => {
    const user = await createUser(`unknown-role-${randomUUID()}@example.test`);
    await expect(
      updateUser({ userId: user.id, roleNames: ["superuser"], actorUserId: user.id }),
    ).rejects.toBeInstanceOf(UnknownRoleError);
  });

  it("rejects an unknown user id", async () => {
    await expect(
      updateUser({ userId: randomUUID(), isActive: false, actorUserId: randomUUID() }),
    ).rejects.toBeInstanceOf(UserNotFoundError);
  });
});

describe("document management RBAC (finalized Task 6 policy)", () => {
  it("lets document_controller/admin see a document with no document_access grant at all", async () => {
    const admin = await createUser(`admin-${randomUUID()}@example.test`, [adminRoleId]);
    const controller = await createUser(`controller-${randomUUID()}@example.test`, [
      documentControllerRoleId,
    ]);
    const [doc] = await db
      .insert(documents)
      .values(fakeDocument({ uploadedBy: admin.id }))
      .returning();
    createdDocumentIds.push(doc.id);
    // Deliberately no document_access row — bypass roles must still see it.

    const viaAdmin = await getDocument(doc.id, { id: admin.id, roles: ["admin"] });
    const viaController = await getDocument(doc.id, {
      id: controller.id,
      roles: ["document_controller"],
    });
    expect(viaAdmin.document.id).toBe(doc.id);
    expect(viaController.document.id).toBe(doc.id);

    const listedForAdmin = await listDocuments(
      { page: 1, pageSize: 50 },
      { id: admin.id, roles: ["admin"] },
    );
    expect(listedForAdmin.items.some((item) => item.id === doc.id)).toBe(true);
  });

  it("hides the same ungranted document from engineer/viewer (IDOR-safe: 404, not 403)", async () => {
    const engineer = await createUser(`engineer-${randomUUID()}@example.test`, [engineerRoleId]);
    const [doc] = await db
      .insert(documents)
      .values(fakeDocument({ uploadedBy: engineer.id }))
      .returning();
    createdDocumentIds.push(doc.id);

    await expect(
      getDocument(doc.id, { id: engineer.id, roles: ["engineer"] }),
    ).rejects.toBeInstanceOf(DocumentNotFoundError);

    const listedForEngineer = await listDocuments(
      { page: 1, pageSize: 50 },
      { id: engineer.id, roles: ["engineer"] },
    );
    expect(listedForEngineer.items.some((item) => item.id === doc.id)).toBe(false);
  });

  it("lets viewer see a document once explicitly granted via document_access", async () => {
    const viewer = await createUser(`viewer-${randomUUID()}@example.test`, [viewerRoleId]);
    const [doc] = await db
      .insert(documents)
      .values(fakeDocument({ uploadedBy: viewer.id }))
      .returning();
    createdDocumentIds.push(doc.id);
    await db.insert(documentAccess).values({ documentId: doc.id, roleId: viewerRoleId });

    const result = await getDocument(doc.id, { id: viewer.id, roles: ["viewer"] });
    expect(result.document.id).toBe(doc.id);
  });
});

// Keep the audit-event write path exercised here too (no dedicated endpoint test needed —
// recordAuditEvent is fire-and-forget and must never throw into its caller).
describe("recordAuditEvent", () => {
  it("does not throw even when given an actor id that references no real user", async () => {
    await expect(
      recordAuditEvent({
        actorUserId: randomUUID(),
        action: "login",
        resourceType: "session",
        result: "failure",
      }),
    ).resolves.toBeUndefined();
  });
});
