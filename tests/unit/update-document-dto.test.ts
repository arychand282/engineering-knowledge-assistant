import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { updateDocumentSchema } from "@/server/dto/documents.dto";

describe("updateDocumentSchema", () => {
  it("rejects an empty body (no field to update)", () => {
    expect(updateDocumentSchema.safeParse({}).success).toBe(false);
  });

  it("rejects a body with only unrecognized fields", () => {
    expect(updateDocumentSchema.safeParse({ foo: "bar" }).success).toBe(false);
  });

  it("accepts a single recognized field", () => {
    const result = updateDocumentSchema.safeParse({ title: "Judul baru" });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown status value", () => {
    expect(updateDocumentSchema.safeParse({ status: "approved" }).success).toBe(false);
  });

  it("accepts a valid status value", () => {
    expect(updateDocumentSchema.safeParse({ status: "effective" }).success).toBe(true);
  });

  it("rejects an effectiveDate that isn't YYYY-MM-DD", () => {
    expect(updateDocumentSchema.safeParse({ effectiveDate: "24/10/2026" }).success).toBe(false);
  });

  it("accepts a null effectiveDate (clears the column)", () => {
    const result = updateDocumentSchema.safeParse({ effectiveDate: null });
    expect(result.success).toBe(true);
    expect(result.success && result.data.effectiveDate).toBeNull();
  });

  it("rejects a non-uuid supersedesDocumentId", () => {
    expect(updateDocumentSchema.safeParse({ supersedesDocumentId: "not-a-uuid" }).success).toBe(
      false,
    );
  });

  it("accepts a null supersedesDocumentId/projectId/siteId", () => {
    const result = updateDocumentSchema.safeParse({
      supersedesDocumentId: null,
      projectId: null,
      siteId: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty-string title (min length)", () => {
    expect(updateDocumentSchema.safeParse({ title: "" }).success).toBe(false);
  });

  it("accepts a valid uuid supersedesDocumentId", () => {
    expect(updateDocumentSchema.safeParse({ supersedesDocumentId: randomUUID() }).success).toBe(
      true,
    );
  });
});
