import { afterEach, describe, expect, it } from "vitest";
import { deleteStoredFile, readStoredFile, saveFile } from "@/lib/storage/local-storage";

describe("local-storage", () => {
  const key = `documents/test-${Date.now()}.pdf`;

  afterEach(async () => {
    await deleteStoredFile(key);
  });

  it("round-trips a saved file", async () => {
    await saveFile(key, Buffer.from("isi file uji"));
    const read = await readStoredFile(key);
    expect(read.toString()).toBe("isi file uji");
  });

  it("rejects a storage key that attempts path traversal", async () => {
    await expect(saveFile("../../etc/passwd", Buffer.from("x"))).rejects.toThrow(
      /storageKey tidak valid/,
    );
  });
});
