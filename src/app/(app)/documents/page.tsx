import { DocumentsPageClient } from "@/components/documents/documents-page-client";

export default function DocumentsPage() {
  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold text-zinc-900 dark:text-zinc-100">Dokumen</h1>
      <DocumentsPageClient />
    </div>
  );
}
