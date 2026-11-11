"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { apiFetch, parseJsonOrThrow } from "@/lib/client/api-client";
import { DocumentTable } from "./document-table";
import type { DocumentRowView } from "./types";
import { UploadForm } from "./upload-form";

const DOCUMENT_MANAGEMENT_ROLES = ["admin", "document_controller"];

export function DocumentsPageClient() {
  const { user } = useAuth();
  // Mirrors DOCUMENT_MANAGEMENT_ROLES server-side (src/server/auth/roles.ts) — this is
  // only a UI convenience to hide controls the user can't use; the PATCH endpoint
  // itself re-checks the role server-side regardless of what the client shows.
  const canManage = user?.roles.some((role) => DOCUMENT_MANAGEMENT_ROLES.includes(role)) ?? false;
  const [documents, setDocuments] = useState<DocumentRowView[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadDocuments = useCallback(async () => {
    try {
      const res = await apiFetch("/api/v1/documents?pageSize=50");
      const data = await parseJsonOrThrow<{ items: DocumentRowView[] }>(res);
      setDocuments(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load the document list.");
    }
  }, []);

  useEffect(() => {
    // Standard fetch-on-mount — setState inside loadDocuments only runs after its
    // internal await, not synchronously here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadDocuments();
  }, [loadDocuments]);

  return (
    <div className="space-y-6">
      {canManage ? (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            Upload a new document
          </h2>
          <UploadForm onUploaded={loadDocuments} />
        </section>
      ) : null}

      <section>
        <h2 className="mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          Document list
        </h2>
        {error ? (
          <p className="mb-2 rounded border border-red-200 bg-red-50 px-2 py-1.5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        ) : null}
        <DocumentTable documents={documents} canEdit={canManage} onUpdated={loadDocuments} />
      </section>
    </div>
  );
}
