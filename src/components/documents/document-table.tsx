import type { DocumentRowView } from "./types";

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  effective: "Efektif",
  superseded: "Digantikan",
  obsolete: "Usang",
  under_review: "Ditinjau",
};

export function DocumentTable({ documents }: { documents: DocumentRowView[] }) {
  if (documents.length === 0) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Belum ada dokumen. Unggah PDF menggunakan form di atas.
      </p>
    );
  }

  return (
    <table className="w-full text-left text-sm">
      <thead>
        <tr className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
          <th className="py-2 pr-3 font-medium">Judul</th>
          <th className="py-2 pr-3 font-medium">No. Dokumen</th>
          <th className="py-2 pr-3 font-medium">Tipe</th>
          <th className="py-2 pr-3 font-medium">Revisi</th>
          <th className="py-2 pr-3 font-medium">Status</th>
          <th className="py-2 font-medium">Diunggah</th>
        </tr>
      </thead>
      <tbody>
        {documents.map((doc) => (
          <tr key={doc.id} className="border-b border-zinc-100 dark:border-zinc-900">
            <td className="py-2 pr-3">{doc.title}</td>
            <td className="py-2 pr-3">{doc.documentNumber}</td>
            <td className="py-2 pr-3">{doc.documentType}</td>
            <td className="py-2 pr-3">{doc.revision}</td>
            <td className="py-2 pr-3">{STATUS_LABELS[doc.status] ?? doc.status}</td>
            <td className="py-2 text-zinc-500 dark:text-zinc-400">
              {new Date(doc.createdAt).toLocaleString("id-ID")}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
