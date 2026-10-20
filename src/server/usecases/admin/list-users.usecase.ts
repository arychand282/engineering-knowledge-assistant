import { listUsersWithRoles } from "@/server/repositories/user.repository";

export async function listUsers() {
  return listUsersWithRoles();
}
