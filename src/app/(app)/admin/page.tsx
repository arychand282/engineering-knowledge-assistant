import Link from "next/link";
import { AdminPageClient } from "./admin-page-client";

export default function AdminPage() {
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Admin</h1>
        <Link
          href="/admin/whatsapp"
          className="text-sm text-zinc-600 hover:underline dark:text-zinc-400"
        >
          WhatsApp →
        </Link>
      </div>
      <AdminPageClient />
    </div>
  );
}
