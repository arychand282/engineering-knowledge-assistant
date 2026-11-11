export interface ChunkablePage {
  pageNumber: number;
  text: string;
}

export interface TextChunk {
  pageStart: number;
  pageEnd: number;
  chunkIndex: number;
  content: string;
  /** Approximate — a word count, not a real LLM tokenizer (no external tokenizer/API). */
  tokenCount: number;
}

export interface ChunkPagesOptions {
  chunkSizeWords?: number;
  overlapWords?: number;
}

interface PageWord {
  word: string;
  pageNumber: number;
}

/**
 * Splits already-extracted page text into overlapping chunks while preserving which
 * PDF page(s) each chunk came from (PLANNING.md #7 stage 3). Chunk size/overlap are a
 * word-count approximation of tokens — there is no external tokenizer dependency.
 * Only pass pages with extractable text; empty/ocr_required pages have nothing to chunk.
 */
export function chunkPages(pages: ChunkablePage[], options: ChunkPagesOptions = {}): TextChunk[] {
  const chunkSizeWords = options.chunkSizeWords ?? 700;
  const overlapWords = options.overlapWords ?? 100;

  if (chunkSizeWords <= 0) {
    throw new Error("chunkSizeWords must be greater than 0.");
  }
  if (overlapWords < 0 || overlapWords >= chunkSizeWords) {
    throw new Error("overlapWords must be >= 0 and smaller than chunkSizeWords.");
  }

  const words: PageWord[] = [];
  for (const page of pages) {
    for (const word of page.text.split(/\s+/).filter(Boolean)) {
      words.push({ word, pageNumber: page.pageNumber });
    }
  }

  if (words.length === 0) {
    return [];
  }

  const stride = chunkSizeWords - overlapWords;
  const chunks: TextChunk[] = [];
  let chunkIndex = 0;

  for (let start = 0; start < words.length; start += stride) {
    const windowWords = words.slice(start, start + chunkSizeWords);
    if (windowWords.length === 0) {
      break;
    }

    chunks.push({
      pageStart: windowWords[0].pageNumber,
      pageEnd: windowWords[windowWords.length - 1].pageNumber,
      chunkIndex,
      content: windowWords.map((w) => w.word).join(" "),
      tokenCount: windowWords.length,
    });
    chunkIndex += 1;

    if (start + chunkSizeWords >= words.length) {
      break;
    }
  }

  return chunks;
}
