import { describe, expect, it } from "vitest";
import { buildChatUserPrompt } from "@/lib/ai/prompts";

describe("buildChatUserPrompt", () => {
  it("labels each chunk with its id and includes the question", () => {
    const prompt = buildChatUserPrompt("Siapa yang memeriksa boiler?", [
      {
        chunkId: "chunk-1",
        documentTitle: "Prosedur Boiler",
        documentNumber: "SOP-100",
        revision: "0",
        status: "effective",
        pageStart: 1,
        pageEnd: 1,
        content: "Teknisi bersertifikat memeriksa tekanan boiler setiap hari.",
      },
    ]);

    expect(prompt).toContain("[chunk:chunk-1]");
    expect(prompt).toContain("SOP-100");
    expect(prompt).toContain("Halaman: 1");
    expect(prompt).toContain("Siapa yang memeriksa boiler?");
  });

  it("formats a multi-page chunk's page range as start-end", () => {
    const prompt = buildChatUserPrompt("q", [
      {
        chunkId: "c1",
        documentTitle: "Doc",
        documentNumber: "DOC-1",
        revision: "0",
        status: "effective",
        pageStart: 2,
        pageEnd: 3,
        content: "isi",
      },
    ]);

    expect(prompt).toContain("Halaman: 2-3");
  });
});
