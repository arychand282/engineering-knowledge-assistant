import { describe, expect, it } from "vitest";
import { buildStorageKey, computeSha256, hasPdfMagicBytes } from "@/lib/documents/metadata";

describe("hasPdfMagicBytes", () => {
  it("accepts a buffer starting with %PDF-", () => {
    expect(hasPdfMagicBytes(Buffer.from("%PDF-1.4\n..."))).toBe(true);
  });

  it("rejects a buffer without the PDF magic bytes", () => {
    expect(hasPdfMagicBytes(Buffer.from("not a pdf at all"))).toBe(false);
    expect(hasPdfMagicBytes(Buffer.alloc(0))).toBe(false);
  });
});

describe("computeSha256", () => {
  it("is deterministic for the same content", () => {
    const buffer = Buffer.from("isi dokumen uji");
    expect(computeSha256(buffer)).toBe(computeSha256(Buffer.from("isi dokumen uji")));
  });

  it("differs for different content", () => {
    expect(computeSha256(Buffer.from("a"))).not.toBe(computeSha256(Buffer.from("b")));
  });

  it("returns a 64-character hex digest", () => {
    expect(computeSha256(Buffer.from("x"))).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("buildStorageKey", () => {
  it("generates a unique internal path, never based on user input", () => {
    const a = buildStorageKey();
    const b = buildStorageKey();

    expect(a).not.toBe(b);
    expect(a).toMatch(/^documents\/[0-9a-f-]{36}\.pdf$/);
  });
});
