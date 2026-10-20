const STATUS_LABELS: Record<string, string> = {
  answered: "Terjawab",
  insufficient_evidence: "Bukti tidak cukup",
  conflict_detected: "Konflik terdeteksi",
  needs_human_review: "Perlu tinjauan manusia",
  error: "Error",
};

const STATUS_STYLES: Record<string, string> = {
  answered: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300",
  insufficient_evidence: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300",
  conflict_detected: "bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300",
  needs_human_review: "bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300",
  error: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300",
};

export function StatusBadge({ status }: { status: string | null }) {
  if (!status) {
    return null;
  }

  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
        STATUS_STYLES[status] ?? "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
      }`}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}
