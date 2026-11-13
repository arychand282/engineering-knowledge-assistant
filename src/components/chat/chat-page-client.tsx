"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

/**
 * Hardcoded to this demo's seed documents (scripts/demo-seed-data via reset-demo.usecase.ts) —
 * one example per answerStatus the model can return, so a visitor trying the live demo
 * doesn't have to guess what to ask to see each behavior. Update these together with the
 * seed data if it ever changes; there's no mechanism tying the two together automatically.
 */
const EXAMPLE_QUESTIONS: Array<{ label: string; question: string }> = [
  {
    label: "Answered, with citation",
    question: "What is the maximum safe wind speed for operating a crane?",
  },
  {
    label: "Insufficient evidence — admits it doesn't know",
    question: "Does the crane require insurance coverage before operating on site?",
  },
  {
    label: "Conflict detected — two revisions disagree",
    question: "How many days of wet curing are required for concrete with high fly ash content?",
  },
];

export function ChatPageClient() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessageView[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showExamples, setShowExamples] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadConversations = useCallback(async () => {
    try {
      const res = await apiFetch("/api/v1/conversations");
      const data = await parseJsonOrThrow<{ items: ConversationSummary[] }>(res);
      setConversations(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load the conversation list.");
    }
  }, []);

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
    setError(null);
    try {
      const res = await apiFetch(`/api/v1/conversations/${id}`);
      const data = await parseJsonOrThrow<ConversationDetailResponse>(res);
      setConversationId(id);
      setMessages(data.messages);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load the conversation.");
    }
  }

  function startNewConversation() {
    setConversationId(null);
    setMessages([]);
    setError(null);
  }

  async function deleteConversation(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await apiFetch(`/api/v1/conversations/${id}`, { method: "DELETE" });
      if (conversationId === id) {
        startNewConversation();
      }
      await loadConversations();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete the conversation.");
    }
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    await sendText(input.trim());
  }

  /** Shared by the form submit handler and the example-question buttons — those don't
   * have a form submit event to prevent, just a question string to send immediately. */
  async function sendText(text: string) {
    if (!text || sending) return;

    setShowExamples(false);
    setError(null);
    setSending(true);
    const optimisticUserMessage: ChatMessageView = {
      // Only ever reached from an event handler (form submit or an example-question
      // button click), never during render — the linter loses track of that once this
      // moved into its own function called from two call sites instead of being inline.
      // eslint-disable-next-line react-hooks/purity
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
      const res = await apiFetch("/api/v1/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ conversationId: conversationId ?? undefined, message: text }),
      });
      const data = await parseJsonOrThrow<ChatApiResponse>(res);

      setConversationId(data.conversationId);
      setMessages((prev) => [...prev, { ...data.message, sources: data.sources }]);
      await loadConversations();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send the message.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-10rem)] gap-4">
      <aside className="w-56 shrink-0 space-y-2 overflow-y-auto border-r border-zinc-200 pr-3 dark:border-zinc-800">
        <button
          type="button"
          onClick={startNewConversation}
          className="w-full rounded border border-zinc-300 px-2 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          + New conversation
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
                <span className="truncate">{c.title ?? "(untitled)"}</span>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => deleteConversation(c.id, e)}
                  className="ml-1 shrink-0 text-zinc-400 opacity-0 hover:text-red-600 group-hover:opacity-100"
                  aria-label="Delete conversation"
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
              No messages yet. Start by asking about a document you&apos;ve uploaded and have
              access to, or click <span className="font-medium">Examples</span> below for
              ready-made questions.
            </p>
          ) : (
            messages.map((m) => <MessageBubble key={m.id} message={m} />)
          )}
          {sending ? (
            <p className="text-sm text-zinc-500 italic dark:text-zinc-400">
              Generating an answer… (a local model without a GPU can take a few minutes)
            </p>
          ) : null}
        </div>

        {error ? (
          <p className="mb-2 rounded border border-red-200 bg-red-50 px-2 py-1.5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        ) : null}

        <div className="relative">
          {showExamples ? (
            <div className="absolute bottom-full z-10 mb-2 w-full rounded border border-zinc-300 bg-white p-2 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
              <p className="mb-1.5 px-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Example questions (one per response type)
              </p>
              <ul className="space-y-1">
                {EXAMPLE_QUESTIONS.map((example) => (
                  <li key={example.question}>
                    <button
                      type="button"
                      onClick={() => sendText(example.question)}
                      disabled={sending}
                      className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-zinc-100 disabled:opacity-40 dark:hover:bg-zinc-800"
                    >
                      <span className="block font-medium text-zinc-500 dark:text-zinc-400">
                        {example.label}
                      </span>
                      <span className="block">{example.question}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <form onSubmit={sendMessage} className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowExamples((prev) => !prev)}
              aria-expanded={showExamples}
              className="rounded border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              Examples
            </button>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your question…"
              disabled={sending}
              className="flex-1 rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
            >
              Send
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
