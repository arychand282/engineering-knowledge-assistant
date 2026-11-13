import { NextResponse } from "next/server";
import { embedTexts } from "@/lib/ai/embedding";
import { env } from "@/lib/env";
import { db } from "@/lib/db";
import { documents } from "@/lib/db/schema";
import {
  searchChunksByFullText,
  searchChunksByVector,
} from "@/server/repositories/document-chunk.repository";

/**
 * TEMPORARY diagnostic route — same auth as reset-demo (CRON_SECRET). Exists only to
 * measure real production embedding-provider scores (Gemini) while calibrating
 * VECTOR_SIMILARITY_MARGIN/FULLTEXT_SCORE_RATIO; local dev uses a different embedding
 * model (Ollama/nomic-embed-text) with different score characteristics, so those
 * thresholds can't be trusted without checking against the real provider. Delete this
 * route once calibration is confirmed working end-to-end.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!env.CRON_SECRET || authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const q = url.searchParams.get("q");
  if (!q) {
    return NextResponse.json({ error: "Missing ?q=" }, { status: 400 });
  }

  const allDocs = await db.select({ id: documents.id }).from(documents);
  const docIds = allDocs.map((d) => d.id);

  const fullText = await searchChunksByFullText(q, docIds, 10, 0); // ratio 0 = unfiltered, raw scores
  let vector: Awaited<ReturnType<typeof searchChunksByVector>> = [];
  let vectorError: string | null = null;
  try {
    const [embedding] = await embedTexts([q]);
    vector = await searchChunksByVector(embedding, docIds, 10, 0); // margin 0 = unfiltered, raw scores
  } catch (error) {
    vectorError = error instanceof Error ? error.message : String(error);
  }

  return NextResponse.json({
    query: q,
    fullText: fullText.map((r) => ({
      score: r.score,
      title: r.documentTitle,
      revision: r.revision,
    })),
    vector: vector.map((r) => ({ score: r.score, title: r.documentTitle, revision: r.revision })),
    vectorError,
  });
}
