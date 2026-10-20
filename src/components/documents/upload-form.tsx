"use client";

import { useState, type FormEvent } from "react";
import { useDevUser } from "@/components/dev-user-provider";
import { apiFetch, parseJsonOrThrow } from "@/lib/client/api-client";

const DOCUMENT_TYPE_SUGGESTIONS = [
  "policy",
  "procedure",
  "specification",
  "manual",
  "project_document",
  "runbook",
  "other",
];

interface UploadResult {
  pageCount: number;
  chunkCount: number;
  embeddedCount: number;
  embeddingSkipped: boolean;
}

export function UploadForm({ onUploaded }: { onUploaded: () => void }) {
  const { userId } = useDevUser();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!userId) {
      setError("Atur User ID (dev) terlebih dahulu di bagian atas halaman.");
      return;
    }

    const form = e.currentTarget;
    const formData = new FormData(form);

    setSubmitting(true);
    setError(null);
    setResult(null);

    try {
      const res = await apiFetch(userId, "/api/v1/documents", { method: "POST", body: formData });
      const data = await parseJsonOrThrow<UploadResult>(res);
      setResult(data);
      form.reset();
      onUploaded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengunggah dokumen.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="grid gap-2 rounded border border-zinc-200 p-3 dark:border-zinc-800"
    >
      <div className="grid grid-cols-2 gap-2">
        <input
          name="title"
          required
          placeholder="Judul dokumen"
          className="rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <input
          name="documentNumber"
          required
          placeholder="Nomor dokumen (mis. SOP-001)"
          className="rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <input
          name="documentType"
          required
          placeholder="Tipe (mis. procedure)"
          list="document-type-suggestions"
          className="rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <datalist id="document-type-suggestions">
          {DOCUMENT_TYPE_SUGGESTIONS.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
        <input
          name="revision"
          required
          placeholder="Revisi (mis. 0)"
          className="rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      </div>
      <input
        name="file"
        type="file"
        accept="application/pdf"
        required
        className="rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
      />
      <button
        type="submit"
        disabled={submitting}
        className="w-fit rounded bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {submitting ? "Mengunggah…" : "Unggah PDF"}
      </button>

      {error ? (
        <p className="rounded border border-red-200 bg-red-50 px-2 py-1.5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      ) : null}
      {result ? (
        <p className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
          Berhasil: {result.pageCount} halaman, {result.chunkCount} potongan teks,{" "}
          {result.embeddingSkipped
            ? "embedding TERLEWAT (Ollama tidak aktif)"
            : `${result.embeddedCount} embedding dibuat`}
          . Dokumen belum otomatis bisa dicari di chat — butuh izin akses (`document_access`) untuk
          role pengguna, lihat README.
        </p>
      ) : null}
    </form>
  );
}
