import { AdminPageClient } from "./admin-page-client";

export default function AdminPage() {
  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold text-zinc-900 dark:text-zinc-100">Admin</h1>
      <AdminPageClient />
    </div>
  );
}
