"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useAuth } from "./auth-provider";

export function AppShell({ children }: { children: ReactNode }) {
  const { status, user, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  if (status === "loading") {
    return <p className="p-6 text-sm text-zinc-500 dark:text-zinc-400">Memuat…</p>;
  }

  if (status === "unauthenticated") {
    return null;
  }

  const isAdmin = user?.roles.includes("admin") ?? false;

  return (
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
          {isAdmin ? (
            <Link
              href="/admin"
              className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              Admin
            </Link>
          ) : null}
        </nav>
        <div className="mx-auto flex max-w-4xl items-center gap-2 px-4 pb-3 text-xs text-zinc-500 dark:text-zinc-400">
          <span>
            {user?.email} ({user?.roles.join(", ") || "tanpa role"})
          </span>
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => void logout()}
            className="rounded border border-zinc-300 px-2 py-1 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Logout
          </button>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
