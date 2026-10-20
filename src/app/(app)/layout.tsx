import Link from "next/link";
import { DevUserProvider } from "@/components/dev-user-provider";
import { DevUserBar } from "@/components/ui/dev-user-bar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <DevUserProvider>
      <div className="flex min-h-screen flex-col">
        <header className="border-b border-zinc-200 dark:border-zinc-800">
          <nav className="mx-auto flex max-w-4xl items-center gap-4 px-4 py-3 text-sm font-medium">
            <Link href="/" className="text-zinc-900 dark:text-zinc-100">
              Engineering Knowledge Assistant
            </Link>
            <span className="flex-1" />
            <Link
              href="/chat"
              className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              Chat
            </Link>
            <Link
              href="/documents"
              className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              Dokumen
            </Link>
          </nav>
          <DevUserBar />
        </header>
        <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">{children}</main>
      </div>
    </DevUserProvider>
  );
}
