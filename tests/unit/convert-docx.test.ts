import { describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return { ...actual, execFile: vi.fn() };
});

import { execFile } from "node:child_process";
import {
  CorruptDocxError,
  LibreOfficeUnavailableError,
  convertDocxToPdf,
} from "@/lib/documents/convert-docx";

const mockedExecFile = vi.mocked(execFile);

/** promisify() always appends its callback as the last argument, regardless of how
 * many preceding args (file/args/options) the real call site passed. */
function mockExecFileError(error: NodeJS.ErrnoException) {
  mockedExecFile.mockImplementation(((...callArgs: unknown[]) => {
    const callback = callArgs[callArgs.length - 1] as (err: NodeJS.ErrnoException) => void;
    callback(error);
    return {} as ReturnType<typeof execFile>;
  }) as typeof execFile);
}

describe("convertDocxToPdf", () => {
  it("throws LibreOfficeUnavailableError when the soffice binary isn't found (ENOENT)", async () => {
    const error = new Error("spawn soffice ENOENT") as NodeJS.ErrnoException;
    error.code = "ENOENT";
    mockExecFileError(error);

    await expect(convertDocxToPdf(Buffer.from("fake docx bytes"))).rejects.toBeInstanceOf(
      LibreOfficeUnavailableError,
    );
  });

  it("throws CorruptDocxError when soffice runs but exits non-zero", async () => {
    const error = new Error("Command failed") as NodeJS.ErrnoException;
    error.code = undefined; // non-ENOENT: binary ran, conversion itself failed
    mockExecFileError(error);

    await expect(convertDocxToPdf(Buffer.from("fake docx bytes"))).rejects.toBeInstanceOf(
      CorruptDocxError,
    );
  });
});
