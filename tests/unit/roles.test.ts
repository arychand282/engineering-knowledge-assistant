import { describe, expect, it } from "vitest";
import { canBypassDocumentAccess, hasAnyRole } from "@/server/auth/roles";

describe("hasAnyRole", () => {
  it("is true when the actor has at least one allowed role", () => {
    expect(hasAnyRole(["engineer", "viewer"], ["admin", "viewer"])).toBe(true);
  });

  it("is false when the actor has none of the allowed roles", () => {
    expect(hasAnyRole(["engineer"], ["admin", "document_controller"])).toBe(false);
  });

  it("is false for an actor with no roles at all", () => {
    expect(hasAnyRole([], ["admin"])).toBe(false);
  });
});

describe("canBypassDocumentAccess", () => {
  it("is true for admin", () => {
    expect(canBypassDocumentAccess(["admin"])).toBe(true);
  });

  it("is true for document_controller", () => {
    expect(canBypassDocumentAccess(["document_controller"])).toBe(true);
  });

  it("is false for engineer and viewer", () => {
    expect(canBypassDocumentAccess(["engineer"])).toBe(false);
    expect(canBypassDocumentAccess(["viewer"])).toBe(false);
  });

  it("is false for a user with no roles", () => {
    expect(canBypassDocumentAccess([])).toBe(false);
  });
});
