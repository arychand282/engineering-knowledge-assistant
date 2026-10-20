"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useDevUser } from "@/components/dev-user-provider";
import { apiFetch, parseJsonOrThrow } from "@/lib/client/api-client";
import { MessageBubble } from "./message-bubble";
import type { ChatMessageView, ConversationSummary } from "./types";

interface ChatApiResponse {
  conversationId: string;
  message: Omit<ChatMessageView, "sources">;
  sources: ChatMessageView["sources"];
}

interface ConversationDetailResponse {
  conversation: ConversationSummary;
  messages: ChatMessageView[];
}

export function ChatPageClient() {
  const { userId } = useDevUser();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessageView[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadConversations = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await apiFetch(userId, "/api/v1/conversations");
      const data = await parseJsonOrThrow<{ items: ConversationSummary[] }>(res);
      setConversations(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat daftar percakapan.");
    }
  }, [userId]);

  useEffect(() => {
    // Standard fetch-on-mount — setState inside loadConversations only runs after its
    // internal await, not synchronously here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function openConversation(id: string) {
    if (!userId) return;
    setError(null);
    try {
      const res = await apiFetch(userId, `/api/v1/conversations/${id}`);
      const data = await parseJsonOrThrow<ConversationDetailResponse>(res);
      setConversationId(id);
      setMessages(data.messages);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat percakapan.");
    }
  }

  function startNewConversation() {
    setConversationId(null);
    setMessages([]);
    setError(null);
  }

  async function deleteConversation(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!userId) return;
    try {
      await apiFetch(userId, `/api/v1/conversations/${id}`, { method: "DELETE" });
      if (conversationId === id) {
        startNewConversation();
      }
      await loadConversations();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menghapus percakapan.");
    }
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || !userId || sending) return;

    setError(null);
    setSending(true);
    const optimisticUserMessage: ChatMessageView = {
      id: `pending-${Date.now()}`,
      role: "user",
      content: text,
      answerStatus: null,
      createdAt: new Date().toISOString(),
      sources: [],
    };
    setMessages((prev) => [...prev, optimisticUserMessage]);
    setInput("");

    try {
      const res = await apiFetch(userId, "/api/v1/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ conversationId: conversationId ?? undefined, message: text }),
      });
      const data = await parseJsonOrThrow<ChatApiResponse>(res);

      setConversationId(data.conversationId);
      setMessages((prev) => [...prev, { ...data.message, sources: data.sources }]);
      await loadConversations();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengirim pesan.");
    } finally {
      setSending(false);
    }
  }

  if (!userId) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Atur User ID (dev) di bagian atas halaman terlebih dahulu untuk mulai chat.
      </p>
    );
  }

  return (
    <div className="flex h-[calc(100vh-10rem)] gap-4">
      <aside className="w-56 shrink-0 space-y-2 overflow-y-auto border-r border-zinc-200 pr-3 dark:border-zinc-800">
        <button
          type="button"
          onClick={startNewConversation}
          className="w-full rounded border border-zinc-300 px-2 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          + Percakapan baru
        </button>
        <ul className="space-y-1">
          {conversations.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => openConversation(c.id)}
                className={`group flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm ${
                  c.id === conversationId
                    ? "bg-zinc-200 dark:bg-zinc-700"
                    : "hover:bg-zinc-100 dark:hover:bg-zinc-800"
                }`}
              >
                <span className="truncate">{c.title ?? "(tanpa judul)"}</span>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => deleteConversation(c.id, e)}
                  className="ml-1 shrink-0 text-zinc-400 opacity-0 hover:text-red-600 group-hover:opacity-100"
                  aria-label="Hapus percakapan"
                >
                  ✕
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className="flex flex-1 flex-col">
        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto pb-3">
          {messages.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Belum ada pesan. Mulai dengan bertanya tentang dokumen yang sudah diunggah dan bisa
              Anda akses.
            </p>
          ) : (
            messages.map((m) => <MessageBubble key={m.id} message={m} />)
          )}
          {sending ? (
            <p className="text-sm text-zinc-500 italic dark:text-zinc-400">
              Sedang menyusun jawaban… (model lokal tanpa GPU bisa butuh beberapa menit)
            </p>
          ) : null}
        </div>

        {error ? (
          <p className="mb-2 rounded border border-red-200 bg-red-50 px-2 py-1.5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        ) : null}

        <form onSubmit={sendMessage} className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ketik pertanyaan Anda…"
            disabled={sending}
            className="flex-1 rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
          >
            Kirim
          </button>
        </form>
      </section>
    </div>
  );
}
