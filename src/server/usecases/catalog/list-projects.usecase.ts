import { listActiveProjects } from "@/server/repositories/project.repository";

export async function listProjects() {
  return listActiveProjects();
}
