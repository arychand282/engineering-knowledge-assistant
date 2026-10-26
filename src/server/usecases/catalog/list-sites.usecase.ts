import { listActiveSites } from "@/server/repositories/site.repository";

export async function listSites() {
  return listActiveSites();
}
