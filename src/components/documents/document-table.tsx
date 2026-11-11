"use client";

import Link from "next/link";
import { useState } from "react";
import { apiFetch, parseJsonOrThrow } from "@/lib/client/api-client";
import { STATUS_LABELS, STATUS_OPTIONS } from "./status-labels";
import type { DocumentRowView } from "./types";

interface EditDraft {
  title: string;
  documentNumber: string;
  documentType: string;
  revision: string;
  status: string;
}

function toDraft(doc: DocumentRowView): EditDraft {
  return {
    title: doc.title,
    documentNumber: doc.documentNumber,
    documentType: doc.documentType,
    revision: doc.revision,
    status: doc.status,
  };
}

const inputClass =
  "w-full rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900";

/** Read-only — approval is server-controlled (see PATCH .../documents/:id), never part
 * of the inline edit form, so this renders the same whether or not the row is editing. */
function ApprovalCell({ doc }: { doc: DocumentRowView }) {
  if (!doc.approvedByEmail || !doc.approvedAt) {
    return <span className="text-zinc-400 dark:text-zinc-600">—</span>;
  }
  return (
    <span className="text-zinc-500 dark:text-zinc-400">
      {doc.approvedByEmail}
      <br />
      {new Date(doc.approvedAt).toLocaleString("en-US")}
    </span>
  );
}

export function DocumentTable({
  documents,
  canEdit = false,
  onUpdated,
}: {
  documents: DocumentRowView[];
  canEdit?: boolean;
  onUpdated?: () => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);

  if (documents.length === 0) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        No documents yet. Upload a PDF using the form above.
      </p>
    );
  }

  function startEdit(doc: DocumentRowView) {
    setEditingId(doc.id);
    setDraft(toDraft(doc));
    setRowError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft(null);
    setRowError(null);
  }

  async function saveEdit(doc: DocumentRowView) {
    if (!draft) {
      return;
    }
    const original = toDraft(doc);
    const patch: Partial<EditDraft> = {};
    if (draft.title !== original.title) patch.title = draft.title;
    if (draft.documentNumber !== original.documentNumber)
      patch.documentNumber = draft.documentNumber;
    if (draft.documentType !== original.documentType) patch.documentType = draft.documentType;
    if (draft.revision !== original.revision) patch.revision = draft.revision;
    if (draft.status !== original.status) patch.status = draft.status;
    if (Object.keys(patch).length === 0) {
      cancelEdit();
      return;
    }

    setSaving(true);
    setRowError(null);
    try {
      const res = await apiFetch(`/api/v1/documents/${doc.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      await parseJsonOrThrow(res);
      cancelEdit();
      onUpdated?.();
    } catch (err) {
      setRowError(err instanceof Error ? err.message : "Failed to save changes.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <table className="w-full text-left text-sm">
      <thead>
        <tr className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
          <th className="py-2 pr-3 font-medium">Title</th>
          <th className="py-2 pr-3 font-medium">Doc. No.</th>
          <th className="py-2 pr-3 font-medium">Type</th>
          <th className="py-2 pr-3 font-medium">Revision</th>
          <th className="py-2 pr-3 font-medium">Status</th>
          <th className="py-2 pr-3 font-medium">Approved</th>
          <th className="py-2 pr-3 font-medium">Uploaded</th>
          {canEdit ? <th className="py-2 font-medium">Actions</th> : null}
        </tr>
      </thead>
      <tbody>
        {documents.map((doc) => {
          const isEditing = canEdit && editingId === doc.id;
          return (
            <tr key={doc.id} className="border-b border-zinc-100 align-top dark:border-zinc-900">
              {isEditing && draft ? (
                <>
                  <td className="py-2 pr-3">
                    <input
                      className={inputClass}
                      value={draft.title}
                      onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <input
                      className={inputClass}
                      value={draft.documentNumber}
                      onChange={(e) => setDraft({ ...draft, documentNumber: e.target.value })}
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <input
                      className={inputClass}
                      value={draft.documentType}
                      onChange={(e) => setDraft({ ...draft, documentType: e.target.value })}
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <input
                      className={inputClass}
                      value={draft.revision}
                      onChange={(e) => setDraft({ ...draft, revision: e.target.value })}
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <select
                      className={inputClass}
                      value={draft.status}
                      onChange={(e) => setDraft({ ...draft, status: e.target.value })}
                    >
                      {STATUS_OPTIONS.map((status) => (
                        <option key={status} value={status}>
                          {STATUS_LABELS[status]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 pr-3 text-xs">
                    <ApprovalCell doc={doc} />
                  </td>
                  <td className="py-2 pr-3 text-zinc-500 dark:text-zinc-400">
                    {new Date(doc.createdAt).toLocaleString("en-US")}
                  </td>
                  <td className="py-2">
                    <div className="flex flex-col gap-1">
                      <div className="flex gap-1">
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => saveEdit(doc)}
                          className="rounded bg-zinc-900 px-2 py-1 text-xs font-medium text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
                        >
                          {saving ? "Saving…" : "Save"}
                        </button>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={cancelEdit}
                          className="rounded border border-zinc-300 px-2 py-1 text-xs font-medium disabled:opacity-40 dark:border-zinc-700"
                        >
                          Cancel
                        </button>
                      </div>
                      {rowError ? (
                        <p className="max-w-48 text-xs text-red-700 dark:text-red-400">
                          {rowError}
                        </p>
                      ) : null}
                    </div>
                  </td>
                </>
              ) : (
                <>
                  <td className="py-2 pr-3">
                    <Link href={`/documents/${doc.id}`} className="hover:underline">
                      {doc.title}
                    </Link>
                  </td>
                  <td className="py-2 pr-3">{doc.documentNumber}</td>
                  <td className="py-2 pr-3">{doc.documentType}</td>
                  <td className="py-2 pr-3">{doc.revision}</td>
                  <td className="py-2 pr-3">{STATUS_LABELS[doc.status] ?? doc.status}</td>
                  <td className="py-2 pr-3 text-xs">
                    <ApprovalCell doc={doc} />
                  </td>
                  <td className="py-2 pr-3 text-zinc-500 dark:text-zinc-400">
                    {new Date(doc.createdAt).toLocaleString("en-US")}
                  </td>
                  {canEdit ? (
                    <td className="py-2">
                      <button
                        type="button"
                        onClick={() => startEdit(doc)}
                        className="rounded border border-zinc-300 px-2 py-1 text-xs font-medium dark:border-zinc-700"
                      >
                        Edit
                      </button>
                    </td>
                  ) : null}
                </>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
