import { listWhatsappLinks as listWhatsappLinksRepo } from "@/server/repositories/whatsapp-link.repository";

export async function listWhatsappLinks() {
  return listWhatsappLinksRepo();
}
