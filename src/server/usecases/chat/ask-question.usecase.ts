import {
  type ChatMessage,
  ChatProviderUnavailableError,
  generateChatCompletion,
} from "@/lib/ai/chat-completion";
import { llmAnswerSchema } from "@/lib/ai/answer-schema";
import { CHAT_SYSTEM_PROMPT, type PromptContextChunk, buildChatUserPrompt } from "@/lib/ai/prompts";
import { env } from "@/lib/env";
import { findSupersedesConflictPairs } from "@/lib/retrieval/detect-supersedes-conflict";
import {
  findConversationByIdForUser,
  insertConversation,
  touchConversation,
  type ConversationRow,
} from "@/server/repositories/conversation.repository";
import { findDocumentsByIds, type DocumentRow } from "@/server/repositories/document.repository";
import {
  insertMessage,
  listMessagesByConversationId,
  type MessageRow,
} from "@/server/repositories/message.repository";
import {
  insertMessageSources,
  listMessageSourcesByMessageId,
} from "@/server/repositories/message-source.repository";
import { searchDocuments } from "@/server/usecases/retrieval/search-documents.usecase";
import { ConversationNotFoundError } from "./errors";

export interface AskQuestionInput {
  conversationId?: string;
  message: string;
  userId: string;
}

export interface AskQuestionSource {
  documentId: string;
  chunkId: string;
  documentTitle: string;
  documentNumber: string;
  revision: string;
  pageNumber: number;
  quotedText: string;
  isOcr: boolean;
  ocrConfidence: number | null;
}

export interface AskQuestionResult {
  conversationId: string;
  message: {
    id: string;
    role: "assistant";
    content: string;
    answerStatus: MessageRow["answerStatus"];
    createdAt: Date;
  };
  sources: AskQuestionSource[];
}

const NO_EVIDENCE_ANSWER =
  "Informasi untuk pertanyaan ini belum dapat diverifikasi dari dokumen yang tersedia dan dapat Anda akses.";

export async function askQuestion(input: AskQuestionInput): Promise<AskQuestionResult> {
  const conversation = input.conversationId
    ? await requireOwnedConversation(input.conversationId, input.userId)
    : await insertConversation({ userId: input.userId, title: input.message.slice(0, 80) });

  await insertMessage({ conversationId: conversation.id, role: "user", content: input.message });

  // Earlier turns of THIS conversation only, oldest-first, capped at CHAT_HISTORY_LIMIT —
  // without this the model sees each question in isolation and can't follow up on its
  // own prior answer (e.g. "dan halaman berapa?" referring to the previous question).
  const history = await buildHistoryMessages(conversation.id);

  const retrieval = await searchDocuments({
    query: input.message,
    userId: input.userId,
    limit: env.CHAT_RETRIEVAL_LIMIT,
  });

  // PLANNING.md #8 step 9: insufficient evidence is returned WITHOUT calling the model.
  if (retrieval.results.length === 0) {
    return finalizeTurn(conversation, NO_EVIDENCE_ANSWER, "insufficient_evidence", []);
  }

  const candidateChunkIds = new Set(retrieval.results.map((result) => result.chunkId));
  const contextDocumentIds = [...new Set(retrieval.results.map((result) => result.documentId))];
  const contextDocuments = await findDocumentsByIds(contextDocumentIds);

  // PLANNING.md #8 step 10: unresolved document-hierarchy conflicts are returned
  // WITHOUT calling the model — this is a backend-certain signal, not a judgment call.
  const supersedesConflicts = findSupersedesConflictPairs(contextDocuments);
  if (supersedesConflicts.length > 0) {
    return finalizeTurn(
      conversation,
      buildConflictAnswer(contextDocuments, supersedesConflicts),
      "conflict_detected",
      [],
    );
  }

  const promptChunks: PromptContextChunk[] = retrieval.results.map((result) => ({
    chunkId: result.chunkId,
    documentTitle: result.documentTitle,
    documentNumber: result.documentNumber,
    revision: result.revision,
    status: result.status,
    pageStart: result.pageStart,
    pageEnd: result.pageEnd,
    content: result.content,
  }));

  const chatMessages: ChatMessage[] = [
    { role: "system", content: CHAT_SYSTEM_PROMPT },
    ...history,
    { role: "user", content: buildChatUserPrompt(input.message, promptChunks) },
  ];

  let rawContent: string;
  try {
    rawContent = await generateChatCompletion(chatMessages);
  } catch (error) {
    if (error instanceof ChatProviderUnavailableError) {
      console.error("[askQuestion] model chat tidak dapat dihubungi:", error);
      return finalizeTurn(
        conversation,
        "Model AI sedang tidak dapat dihubungi. Silakan coba lagi beberapa saat lagi.",
        "error",
        [],
      );
    }
    throw error;
  }

  const parsed = llmAnswerSchema.safeParse(safeJsonParse(rawContent));
  if (!parsed.success) {
    console.error(
      "[askQuestion] respons model tidak sesuai schema:",
      parsed.error.message,
      rawContent,
    );
    return finalizeTurn(
      conversation,
      "Terjadi kesalahan saat menyusun jawaban. Silakan coba lagi.",
      "error",
      [],
    );
  }
  const llmAnswer = parsed.data;

  // PLANNING.md #8 step 14: every source_chunk_ids must come from the retrieval
  // candidates actually fetched and permitted — never trust the model's citations blindly.
  const validatedClaims = llmAnswer.claims
    .map((claim) => ({
      text: claim.text,
      sourceChunkIds: claim.source_chunk_ids.filter((id) => candidateChunkIds.has(id)),
    }))
    .filter((claim) => claim.sourceChunkIds.length > 0);

  const sourceEntries = validatedClaims.flatMap((claim) =>
    claim.sourceChunkIds.map((chunkId) =>
      retrieval.results.find((result) => result.chunkId === chunkId)!,
    ),
  );
  const dedupedSourceChunks = Array.from(
    new Map(sourceEntries.map((entry) => [entry.chunkId, entry])).values(),
  );
  const distinctSourceDocumentCount = new Set(dedupedSourceChunks.map((chunk) => chunk.documentId))
    .size;

  let finalStatus = llmAnswer.status;
  let finalAnswer = llmAnswer.answer;

  if (finalStatus === "answered" && validatedClaims.length === 0) {
    // Model claimed an answer but cited nothing verifiable — don't trust it.
    finalStatus = "insufficient_evidence";
    finalAnswer = NO_EVIDENCE_ANSWER;
  } else if (finalStatus === "conflict_detected" && distinctSourceDocumentCount < 2) {
    // A conflict needs 2+ differing documents. The backend's own deterministic check
    // (supersedesConflicts, above) already found none — don't trust the model's own
    // "conflict_detected" judgment call over that when its cited sources don't even
    // span more than one document (PLANNING.md: validation is the backend's job).
    finalStatus = validatedClaims.length > 0 ? "answered" : "insufficient_evidence";
    if (finalStatus === "insufficient_evidence") {
      finalAnswer = NO_EVIDENCE_ANSWER;
    }
  }

  // Task 7 evaluation found two real model behaviors neither branch above covers: the
  // model self-reporting insufficient_evidence directly (not via either downgrade
  // above) with a blank `answer`, and the model citing valid sources on a message that
  // still says it can't answer — self-contradictory from the user's point of view.
  if (finalStatus === "insufficient_evidence" && finalAnswer.trim().length === 0) {
    finalAnswer = NO_EVIDENCE_ANSWER;
  }
  const finalSourceChunks = finalStatus === "answered" ? dedupedSourceChunks : [];

  return finalizeTurn(conversation, finalAnswer, finalStatus, finalSourceChunks);
}

/**
 * Prior messages of this conversation as chat history, oldest-first, excluding the
 * user message just inserted for the current turn (that's added separately, together
 * with this turn's retrieved context). Assistant turns carry only the final answer text
 * actually shown to the user — not the retrieved chunks or raw model JSON behind it —
 * to keep the prompt bounded; the current turn still gets its own full RAG context.
 */
async function buildHistoryMessages(conversationId: string): Promise<ChatMessage[]> {
  if (env.CHAT_HISTORY_LIMIT === 0) {
    return [];
  }
  const allMessages = await listMessagesByConversationId(conversationId);
  const priorMessages = allMessages.slice(0, -1).slice(-env.CHAT_HISTORY_LIMIT);
  return priorMessages.map((message) => ({
    role: message.role === "assistant" ? "assistant" : "user",
    content: message.content,
  }));
}

async function requireOwnedConversation(
  conversationId: string,
  userId: string,
): Promise<ConversationRow> {
  const conversation = await findConversationByIdForUser(conversationId, userId);
  if (!conversation) {
    throw new ConversationNotFoundError(conversationId);
  }
  return conversation;
}

function buildConflictAnswer(documents: DocumentRow[], pairs: Array<[string, string]>): string {
  const involvedIds = new Set(pairs.flat());
  const involved = documents.filter((doc) => involvedIds.has(doc.id));
  const describe = (doc: DocumentRow) =>
    `"${doc.title}" (No. ${doc.documentNumber}, revisi ${doc.revision}, status ${doc.status})`;

  return (
    `Ditemukan dokumen dengan hubungan revisi yang belum terselesaikan: ${involved.map(describe).join(" dan ")}. ` +
    "Jawaban tidak dapat diberikan secara otomatis — diperlukan verifikasi dari document controller/engineer berwenang untuk menentukan dokumen mana yang berlaku."
  );
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

interface RetrievalSourceChunk {
  documentId: string;
  chunkId: string;
  pageStart: number;
  content: string;
}

async function finalizeTurn(
  conversation: ConversationRow,
  answer: string,
  status: MessageRow["answerStatus"],
  sourceChunks: RetrievalSourceChunk[],
): Promise<AskQuestionResult> {
  const assistantMessage = await insertMessage({
    conversationId: conversation.id,
    role: "assistant",
    content: answer,
    answerStatus: status,
  });

  let sources: AskQuestionSource[] = [];
  if (sourceChunks.length > 0) {
    await insertMessageSources(
      sourceChunks.map((chunk) => ({
        messageId: assistantMessage.id,
        documentId: chunk.documentId,
        chunkId: chunk.chunkId,
        pageNumber: chunk.pageStart,
        quotedText: chunk.content.slice(0, 500),
      })),
    );

    // Re-read through the same joined query conversation history uses
    // (listMessageSourcesByMessageId) rather than mapping documents in-memory here —
    // one source of truth for what a "source" looks like (title/number/revision/OCR
    // provenance), so the live chat response and a reopened past conversation always
    // render identical source cards.
    const rows = await listMessageSourcesByMessageId(assistantMessage.id);
    sources = rows.map((row) => ({
      documentId: row.documentId,
      chunkId: row.chunkId,
      documentTitle: row.documentTitle,
      documentNumber: row.documentNumber,
      revision: row.revision,
      pageNumber: row.pageNumber,
      quotedText: row.quotedText,
      isOcr: row.isOcr ?? false,
      ocrConfidence: row.ocrConfidence,
    }));
  }

  await touchConversation(conversation.id);

  return {
    conversationId: conversation.id,
    message: {
      id: assistantMessage.id,
      role: "assistant",
      content: assistantMessage.content,
      answerStatus: assistantMessage.answerStatus,
      createdAt: assistantMessage.createdAt,
    },
    sources,
  };
}
