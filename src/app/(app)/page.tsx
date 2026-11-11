import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-col items-center gap-4 py-12 text-center">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
        Engineering Knowledge Assistant
      </h1>
      <p className="max-w-md text-zinc-600 dark:text-zinc-400">
        Verifiable search and Q&A over your company documents. See{" "}
        <code>PLANNING.md</code> for the full project plan.
      </p>
      <div className="flex gap-3">
        <Link
          href="/chat"
          className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          Start Chat
        </Link>
        <Link
          href="/documents"
          className="rounded border border-zinc-300 px-4 py-2 text-sm font-medium dark:border-zinc-700"
        >
          Manage Documents
        </Link>
      </div>
    </div>
  );
}
