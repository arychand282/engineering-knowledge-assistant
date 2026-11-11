import type { ChatSourceView } from "./types";

export function SourceCard({ source }: { source: ChatSourceView }) {
  return (
    <div className="rounded border border-zinc-200 bg-zinc-50 p-2 text-xs dark:border-zinc-700 dark:bg-zinc-900">
      <div className="flex items-center gap-2 font-medium text-zinc-800 dark:text-zinc-200">
        <span>
          {source.documentTitle}{" "}
          <span className="font-normal text-zinc-500 dark:text-zinc-400">
            (No. {source.documentNumber}, rev. {source.revision}, p. {source.pageNumber})
          </span>
        </span>
        {source.isOcr ? (
          <span
            title="This page was extracted via OCR rather than the document's native text — it may be less accurate."
            className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 font-normal text-amber-800 dark:bg-amber-950 dark:text-amber-300"
          >
            OCR{source.ocrConfidence != null ? ` ${source.ocrConfidence.toFixed(0)}%` : ""}
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-zinc-600 italic dark:text-zinc-400">
        &ldquo;{source.quotedText}&rdquo;
      </p>
    </div>
  );
}
