"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, parseJsonOrThrow } from "@/lib/client/api-client";

const ALL_ROLES = ["admin", "document_controller", "engineer", "viewer"];

interface UserRow {
  id: string;
  email: string;
  name: string;
  isActive: boolean;
  roles: string[];
}

interface AuditEventRow {
  id: string;
  actorUserId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  result: string;
  createdAt: string;
}

export function AdminPageClient() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEventRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    try {
      const res = await apiFetch("/api/v1/admin/users");
      const data = await parseJsonOrThrow<{ items: UserRow[] }>(res);
      setUsers(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load the user list.");
    }
  }, []);

  const loadAuditEvents = useCallback(async () => {
    try {
      const res = await apiFetch("/api/v1/admin/audit-events?pageSize=20");
      const data = await parseJsonOrThrow<{ items: AuditEventRow[] }>(res);
      setAuditEvents(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load the audit log.");
    }
  }, []);

  useEffect(() => {
    // Standard fetch-on-mount — setState inside these loaders only runs after their
    // internal await, not synchronously here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadUsers();
    void loadAuditEvents();
  }, [loadUsers, loadAuditEvents]);

  async function toggleRole(user: UserRow, role: string) {
    const nextRoles = user.roles.includes(role)
      ? user.roles.filter((r) => r !== role)
      : [...user.roles, role];
    try {
      const res = await apiFetch(`/api/v1/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roleNames: nextRoles }),
      });
      if (!res.ok) {
        throw new Error((await res.json().catch(() => null))?.error ?? "Failed to update role.");
      }
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update role.");
    }
  }

  async function toggleActive(user: UserRow) {
    try {
      const res = await apiFetch(`/api/v1/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isActive: !user.isActive }),
      });
      if (!res.ok) {
        throw new Error(
          (await res.json().catch(() => null))?.error ?? "Failed to update account status.",
        );
      }
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update account status.");
    }
  }

  return (
    <div className="space-y-8">
      {error ? (
        <p className="rounded border border-red-200 bg-red-50 px-2 py-1.5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      ) : null}

      <section>
        <h2 className="mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Users</h2>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
              <th className="py-2 pr-3 font-medium">Email</th>
              <th className="py-2 pr-3 font-medium">Name</th>
              <th className="py-2 pr-3 font-medium">Role</th>
              <th className="py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b border-zinc-100 align-top dark:border-zinc-900">
                <td className="py-2 pr-3">{user.email}</td>
                <td className="py-2 pr-3">{user.name}</td>
                <td className="py-2 pr-3">
                  <div className="flex flex-wrap gap-2">
                    {ALL_ROLES.map((role) => (
                      <label key={role} className="flex items-center gap-1 text-xs">
                        <input
                          type="checkbox"
                          checked={user.roles.includes(role)}
                          onChange={() => toggleRole(user, role)}
                        />
                        {role}
                      </label>
                    ))}
                  </div>
                </td>
                <td className="py-2">
                  <button
                    type="button"
                    onClick={() => toggleActive(user)}
                    className={`rounded px-2 py-1 text-xs font-medium ${
                      user.isActive
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                        : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
                    }`}
                  >
                    {user.isActive ? "Active" : "Inactive"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          Recent audit log
        </h2>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
              <th className="py-2 pr-3 font-medium">Time</th>
              <th className="py-2 pr-3 font-medium">Action</th>
              <th className="py-2 pr-3 font-medium">Resource</th>
              <th className="py-2 font-medium">Result</th>
            </tr>
          </thead>
          <tbody>
            {auditEvents.map((event) => (
              <tr key={event.id} className="border-b border-zinc-100 dark:border-zinc-900">
                <td className="py-2 pr-3 text-zinc-500 dark:text-zinc-400">
                  {new Date(event.createdAt).toLocaleString("en-US")}
                </td>
                <td className="py-2 pr-3">{event.action}</td>
                <td className="py-2 pr-3">
                  {event.resourceType}
                  {event.resourceId ? ` (${event.resourceId.slice(0, 8)}…)` : ""}
                </td>
                <td className="py-2">
                  <span
                    className={
                      event.result === "success"
                        ? "text-emerald-700 dark:text-emerald-400"
                        : "text-red-700 dark:text-red-400"
                    }
                  >
                    {event.result}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
