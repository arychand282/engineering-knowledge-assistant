import { describe, expect, it } from "vitest";
import { buildChatUserPrompt } from "@/lib/ai/prompts";

describe("buildChatUserPrompt", () => {
  it("labels each chunk with its id and includes the question", () => {
    const prompt = buildChatUserPrompt("Who inspects the boiler?", [
      {
        chunkId: "chunk-1",
        documentTitle: "Boiler Procedure",
        documentNumber: "SOP-100",
        revision: "0",
        status: "effective",
        pageStart: 1,
        pageEnd: 1,
        content: "A certified technician checks the boiler pressure every day.",
      },
    ]);

    expect(prompt).toContain("[chunk:chunk-1]");
    expect(prompt).toContain("SOP-100");
    expect(prompt).toContain("Page: 1");
    expect(prompt).toContain("Who inspects the boiler?");
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
        content: "content",
      },
    ]);

    expect(prompt).toContain("Page: 2-3");
  });
});
