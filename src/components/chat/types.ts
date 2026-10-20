export interface ChatSourceView {
  documentId: string;
  chunkId: string;
  documentTitle: string;
  documentNumber: string;
  revision: string;
  pageNumber: number;
  quotedText: string;
}

export interface ChatMessageView {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  answerStatus: string | null;
  createdAt: string;
  sources: ChatSourceView[];
}

export interface ConversationSummary {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
}
