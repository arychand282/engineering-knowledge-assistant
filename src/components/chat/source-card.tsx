import type { ChatSourceView } from "./types";

export function SourceCard({ source }: { source: ChatSourceView }) {
  return (
    <div className="rounded border border-zinc-200 bg-zinc-50 p-2 text-xs dark:border-zinc-700 dark:bg-zinc-900">
      <div className="font-medium text-zinc-800 dark:text-zinc-200">
        {source.documentTitle}{" "}
        <span className="font-normal text-zinc-500 dark:text-zinc-400">
          (No. {source.documentNumber}, rev. {source.revision}, hal. {source.pageNumber})
        </span>
      </div>
      <p className="mt-1 text-zinc-600 italic dark:text-zinc-400">
        &ldquo;{source.quotedText}&rdquo;
      </p>
    </div>
  );
}
