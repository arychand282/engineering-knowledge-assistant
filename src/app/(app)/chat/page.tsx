import { ChatPageClient } from "@/components/chat/chat-page-client";

export default function ChatPage() {
  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold text-zinc-900 dark:text-zinc-100">Chat</h1>
      <ChatPageClient />
    </div>
  );
}
