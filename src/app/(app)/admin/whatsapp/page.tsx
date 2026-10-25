import { WhatsappAdminClient } from "./whatsapp-admin-client";

export default function WhatsappAdminPage() {
  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold text-zinc-900 dark:text-zinc-100">WhatsApp</h1>
      <WhatsappAdminClient />
    </div>
  );
}
