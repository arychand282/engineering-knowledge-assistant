import { SourceCard } from "./source-card";
import { StatusBadge } from "./status-badge";
import type { ChatMessageView } from "./types";

export function MessageBubble({ message }: { message: ChatMessageView }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[85%] space-y-2 ${isUser ? "items-end" : "items-start"}`}>
        <div
          className={`rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
            isUser
              ? "bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900"
              : "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
          }`}
        >
          {message.content}
        </div>
        {!isUser && message.answerStatus ? (
          <div>
            <StatusBadge status={message.answerStatus} />
          </div>
        ) : null}
        {message.sources.length > 0 ? (
          <div className="space-y-1.5">
            {message.sources.map((source) => (
              <SourceCard key={source.chunkId} source={source} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
