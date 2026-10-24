"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { apiFetch, parseJsonOrThrow } from "@/lib/client/api-client";
import { EXTRACTION_STATUS_LABELS, STATUS_LABELS } from "./status-labels";

const DOCUMENT_MANAGEMENT_ROLES = ["admin", "document_controller"];
// Mirrors ALL_ROLES server-side (src/server/auth/roles.ts) — same local-duplication
// convention the admin UI already uses, not a server fetch.
const ALL_ROLES = ["admin", "document_controller", "engineer", "viewer"];

interface DocumentDetail {
  id: string;
  title: string;
  documentNumber: string;
  documentType: string;
  revision: string;
  status: string;
  effectiveDate: string | null;
  supersedesDocumentId: string | null;
  approvedByEmail: string | null;
  approvedAt: string | null;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  createdAt: string;
}

interface PageRow {
  id: string;
  pageNumber: number;
  extractionStatus: string;
  isOcr: boolean;
  ocrConfidence: number | null;
}

interface ReprocessResult {
  pageCount: number;
  chunkCount: number;
  embeddedCount: number;
  embeddingSkipped: boolean;
}

interface AccessGrant {
  id: string;
  roleName: string;
  createdAt: string;
}

export function DocumentDetailClient({ documentId }: { documentId: string }) {
  const { user } = useAuth();
  // Mirrors DOCUMENT_MANAGEMENT_ROLES server-side — a UI convenience only, the
  // reprocess endpoint re-checks the role itself regardless of what the client shows.
  const canManage = user?.roles.some((role) => DOCUMENT_MANAGEMENT_ROLES.includes(role)) ?? false;

  const [document, setDocument] = useState<DocumentDetail | null>(null);
  const [pages, setPages] = useState<PageRow[]>([]);
  const [chunkCount, setChunkCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [reprocessing, setReprocessing] = useState(false);
  const [reprocessResult, setReprocessResult] = useState<ReprocessResult | null>(null);

  const [expandedPage, setExpandedPage] = useState<number | null>(null);
  const [pageTextByNumber, setPageTextByNumber] = useState<Record<number, string>>({});
  const [loadingPageNumber, setLoadingPageNumber] = useState<number | null>(null);
  const [pageTextError, setPageTextError] = useState<string | null>(null);

  const [accessGrants, setAccessGrants] = useState<AccessGrant[]>([]);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [roleToGrant, setRoleToGrant] = useState(ALL_ROLES[0]);
  const [granting, setGranting] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const loadAccess = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/v1/documents/${documentId}/access`);
      const data = await parseJsonOrThrow<{ items: AccessGrant[] }>(res);
      setAccessGrants(data.items);
    } catch (err) {
      setAccessError(err instanceof Error ? err.message : "Gagal memuat daftar akses.");
    }
  }, [documentId]);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/v1/documents/${documentId}`);
      const data = await parseJsonOrThrow<{
        document: DocumentDetail;
        pages: PageRow[];
        chunkCount: number;
      }>(res);
      setDocument(data.document);
      setPages(data.pages);
      setChunkCount(data.chunkCount);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat detail dokumen.");
    }
  }, [documentId]);

  useEffect(() => {
    // Standard fetch-on-mount — setState inside load only runs after its internal
    // await, not synchronously here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  useEffect(() => {
    // GET .../access is management-only (403 for engineer/viewer) — only call it once
    // we actually know the signed-in user can manage documents.
    if (canManage) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void loadAccess();
    }
  }, [canManage, loadAccess]);

  async function handleGrant(e: React.FormEvent) {
    e.preventDefault();
    setGranting(true);
    setAccessError(null);
    try {
      const res = await apiFetch(`/api/v1/documents/${documentId}/access`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roleName: roleToGrant }),
      });
      await parseJsonOrThrow(res);
      await loadAccess();
    } catch (err) {
      setAccessError(err instanceof Error ? err.message : "Gagal memberi akses.");
    } finally {
      setGranting(false);
    }
  }

  async function handleRevoke(accessId: string) {
    setRevokingId(accessId);
    setAccessError(null);
    try {
      const res = await apiFetch(`/api/v1/documents/${documentId}/access/${accessId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        throw new Error((await res.json().catch(() => null))?.error ?? "Gagal mencabut akses.");
      }
      await loadAccess();
    } catch (err) {
      setAccessError(err instanceof Error ? err.message : "Gagal mencabut akses.");
    } finally {
      setRevokingId(null);
    }
  }

  async function handleReprocess() {
    setReprocessing(true);
    setReprocessResult(null);
    setError(null);
    try {
      const res = await apiFetch(`/api/v1/documents/${documentId}/reprocess`, {
        method: "POST",
      });
      const data = await parseJsonOrThrow<ReprocessResult>(res);
      setReprocessResult(data);
      setPageTextByNumber({});
      setExpandedPage(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memproses ulang dokumen.");
    } finally {
      setReprocessing(false);
    }
  }

  async function togglePage(pageNumber: number) {
    if (expandedPage === pageNumber) {
      setExpandedPage(null);
      return;
    }
    setExpandedPage(pageNumber);
    setPageTextError(null);
    if (pageTextByNumber[pageNumber] !== undefined) {
      return; // already fetched
    }
    setLoadingPageNumber(pageNumber);
    try {
      const res = await apiFetch(`/api/v1/documents/${documentId}/pages/${pageNumber}`);
      const data = await parseJsonOrThrow<{ page: { extractedText: string | null } }>(res);
      setPageTextByNumber((prev) => ({ ...prev, [pageNumber]: data.page.extractedText ?? "" }));
    } catch (err) {
      setPageTextError(err instanceof Error ? err.message : "Gagal memuat teks halaman.");
    } finally {
      setLoadingPageNumber(null);
    }
  }

  if (error && !document) {
    return (
      <div className="space-y-2">
        <BackLink />
        <p className="rounded border border-red-200 bg-red-50 px-2 py-1.5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      </div>
    );
  }

  if (!document) {
    return (
      <div className="space-y-2">
        <BackLink />
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Memuat…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <BackLink />

      <section>
        <h1 className="mb-1 text-xl font-semibold text-zinc-900 dark:text-zinc-100">
          {document.title}
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          No. {document.documentNumber} · Revisi {document.revision} ·{" "}
          {STATUS_LABELS[document.status] ?? document.status}
        </p>
      </section>

      <section className="grid grid-cols-2 gap-x-6 gap-y-2 rounded border border-zinc-200 p-3 text-sm dark:border-zinc-800 sm:grid-cols-3">
        <Field label="Tipe" value={document.documentType} />
        <Field label="Tanggal efektif" value={document.effectiveDate ?? <Dash />} />
        <Field label="Jumlah potongan teks" value={String(chunkCount)} />
        <Field label="Disetujui oleh" value={document.approvedByEmail ?? <Dash />} />
        <Field
          label="Disetujui pada"
          value={
            document.approvedAt ? new Date(document.approvedAt).toLocaleString("id-ID") : <Dash />
          }
        />
        <Field label="Diunggah" value={new Date(document.createdAt).toLocaleString("id-ID")} />
        <Field label="Nama file asli" value={document.originalFilename} />
        <Field label="Tipe file" value={document.mimeType} />
        <Field label="Ukuran file" value={`${(document.fileSize / 1024).toFixed(1)} KB`} />
      </section>

      {canManage ? (
        <section className="space-y-2">
          <button
            type="button"
            disabled={reprocessing}
            onClick={handleReprocess}
            className="rounded bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {reprocessing ? "Memproses ulang…" : "Proses ulang dokumen"}
          </button>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Mengekstrak ulang dari file yang tersimpan (berguna setelah mengaktifkan
            OCR/LibreOffice, atau memperbaiki ekstraksi yang gagal).
          </p>
          {reprocessResult ? (
            <p className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
              Berhasil: {reprocessResult.pageCount} halaman, {reprocessResult.chunkCount} potongan
              teks,{" "}
              {reprocessResult.embeddingSkipped
                ? "embedding TERLEWAT (Ollama tidak aktif)"
                : `${reprocessResult.embeddedCount} embedding dibuat`}
              .
            </p>
          ) : null}
        </section>
      ) : null}

      {canManage ? (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            Akses dokumen
          </h2>
          <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">
            Role yang bisa mencari dokumen ini di chat (default-deny — role yang tidak terdaftar di
            sini tidak bisa mengaksesnya sama sekali).
          </p>
          {accessGrants.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Belum ada role yang diberi akses.
            </p>
          ) : (
            <ul className="mb-2 divide-y divide-zinc-100 rounded border border-zinc-200 text-sm dark:divide-zinc-900 dark:border-zinc-800">
              {accessGrants.map((grant) => (
                <li key={grant.id} className="flex items-center justify-between px-3 py-1.5">
                  <span>{grant.roleName}</span>
                  <button
                    type="button"
                    disabled={revokingId === grant.id}
                    onClick={() => handleRevoke(grant.id)}
                    className="rounded border border-red-300 px-2 py-0.5 text-xs font-medium text-red-700 disabled:opacity-40 dark:border-red-900 dark:text-red-400"
                  >
                    {revokingId === grant.id ? "Mencabut…" : "Cabut"}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={handleGrant} className="flex items-center gap-2">
            <select
              value={roleToGrant}
              onChange={(e) => setRoleToGrant(e.target.value)}
              className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              {ALL_ROLES.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={granting}
              className="rounded bg-zinc-900 px-3 py-1 text-sm font-medium text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
            >
              {granting ? "Memberi akses…" : "Beri akses"}
            </button>
          </form>
          {accessError ? (
            <p className="mt-2 rounded border border-red-200 bg-red-50 px-2 py-1.5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
              {accessError}
            </p>
          ) : null}
        </section>
      ) : null}

      {error ? (
        <p className="rounded border border-red-200 bg-red-50 px-2 py-1.5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      ) : null}

      <section>
        <h2 className="mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Halaman</h2>
        <div className="divide-y divide-zinc-100 rounded border border-zinc-200 dark:divide-zinc-900 dark:border-zinc-800">
          {pages.map((page) => (
            <div key={page.id}>
              <button
                type="button"
                onClick={() => togglePage(page.pageNumber)}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-zinc-50 dark:hover:bg-zinc-900"
              >
                <span>Halaman {page.pageNumber}</span>
                <span className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                  {page.isOcr ? (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                      OCR{page.ocrConfidence != null ? ` ${page.ocrConfidence.toFixed(0)}%` : ""}
                    </span>
                  ) : null}
                  <span>
                    {EXTRACTION_STATUS_LABELS[page.extractionStatus] ?? page.extractionStatus}
                  </span>
                </span>
              </button>
              {expandedPage === page.pageNumber ? (
                <div className="border-t border-zinc-100 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-900 dark:bg-zinc-950">
                  {loadingPageNumber === page.pageNumber ? (
                    <p className="text-zinc-500 dark:text-zinc-400">Memuat teks…</p>
                  ) : pageTextError ? (
                    <p className="text-red-700 dark:text-red-400">{pageTextError}</p>
                  ) : (
                    <p className="whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">
                      {pageTextByNumber[page.pageNumber] || (
                        <span className="text-zinc-400 dark:text-zinc-600">
                          (Tidak ada teks terekstrak untuk halaman ini.)
                        </span>
                      )}
                    </p>
                  )}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/documents" className="text-sm text-zinc-500 hover:underline dark:text-zinc-400">
      &larr; Kembali ke daftar dokumen
    </Link>
  );
}

function Dash() {
  return <span className="text-zinc-400 dark:text-zinc-600">—</span>;
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-zinc-500 dark:text-zinc-400">{label}</div>
      <div className="text-zinc-900 dark:text-zinc-100">{value}</div>
    </div>
  );
}
