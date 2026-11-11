"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, parseJsonOrThrow } from "@/lib/client/api-client";

interface StatusResponse {
  provider: "none" | "baileys" | "meta";
  status?: "disconnected" | "connecting" | "qr_pending" | "connected";
  qrDataUrl?: string | null;
  phoneNumber?: string | null;
  lastError?: string | null;
}

interface WhatsappLinkRow {
  id: string;
  phoneNumber: string;
  userId: string;
  userEmail: string;
  createdAt: string;
}

interface UserOption {
  id: string;
  email: string;
  name: string;
}

const STATUS_LABELS: Record<string, string> = {
  disconnected: "Disconnected",
  connecting: "Connecting…",
  qr_pending: "Waiting for QR scan",
  connected: "Connected",
};

export function WhatsappAdminClient() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [links, setLinks] = useState<WhatsappLinkRow[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [phoneNumber, setPhoneNumber] = useState("");
  const [userId, setUserId] = useState("");
  const [linking, setLinking] = useState(false);
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const res = await apiFetch("/api/v1/admin/whatsapp/status");
      const data = await parseJsonOrThrow<StatusResponse>(res);
      setStatus(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load WhatsApp status.");
    }
  }, []);

  const loadLinks = useCallback(async () => {
    try {
      const res = await apiFetch("/api/v1/admin/whatsapp/links");
      const data = await parseJsonOrThrow<{ items: WhatsappLinkRow[] }>(res);
      setLinks(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load the list of linked numbers.");
    }
  }, []);

  const loadUsers = useCallback(async () => {
    try {
      const res = await apiFetch("/api/v1/admin/users");
      const data = await parseJsonOrThrow<{ items: UserOption[] }>(res);
      setUsers(data.items);
    } catch {
      // Non-critical for this page — the link form's dropdown is just empty.
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadStatus();
    void loadLinks();
    void loadUsers();
  }, [loadStatus, loadLinks, loadUsers]);

  // Poll status while a connection attempt is in flight (QR not yet scanned, or just
  // reconnecting) so the admin sees the QR code / "connected" transition without
  // manually refreshing. Stops once settled into "connected" or "disconnected" with no
  // pending action.
  const pollingRef = useRef(false);
  useEffect(() => {
    if (status?.status !== "connecting" && status?.status !== "qr_pending") {
      pollingRef.current = false;
      return;
    }
    if (pollingRef.current) {
      return;
    }
    pollingRef.current = true;
    const interval = setInterval(() => {
      void loadStatus();
    }, 3000);
    return () => {
      clearInterval(interval);
      pollingRef.current = false;
    };
  }, [status?.status, loadStatus]);

  async function handleConnect() {
    setConnecting(true);
    setError(null);
    try {
      const res = await apiFetch("/api/v1/admin/whatsapp/status", { method: "POST" });
      const data = await parseJsonOrThrow<StatusResponse>(res);
      setStatus(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start the WhatsApp connection.");
    } finally {
      setConnecting(false);
    }
  }

  async function handleLink(e: React.FormEvent) {
    e.preventDefault();
    setLinking(true);
    setError(null);
    try {
      const res = await apiFetch("/api/v1/admin/whatsapp/links", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phoneNumber, userId }),
      });
      if (!res.ok) {
        throw new Error((await res.json().catch(() => null))?.error ?? "Failed to link the number.");
      }
      setPhoneNumber("");
      setUserId("");
      await loadLinks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to link the number.");
    } finally {
      setLinking(false);
    }
  }

  async function handleUnlink(linkId: string) {
    setUnlinkingId(linkId);
    setError(null);
    try {
      const res = await apiFetch(`/api/v1/admin/whatsapp/links/${linkId}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        throw new Error((await res.json().catch(() => null))?.error ?? "Failed to unlink the number.");
      }
      await loadLinks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to unlink the number.");
    } finally {
      setUnlinkingId(null);
    }
  }

  const linkedUserIds = new Set(links.map((l) => l.userId));
  const availableUsers = users.filter((u) => !linkedUserIds.has(u.id));

  return (
    <div className="space-y-8">
      {error ? (
        <p className="rounded border border-red-200 bg-red-50 px-2 py-1.5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      ) : null}

      <section>
        <h2 className="mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Connection</h2>
        {status?.provider === "none" ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            WhatsApp integration is not enabled (WHATSAPP_PROVIDER=none).
          </p>
        ) : status?.provider === "meta" ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Using the Meta Cloud API — no QR scan needed, the connection is managed via webhook.
          </p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm">
              Status:{" "}
              <span className="font-medium">
                {status ? STATUS_LABELS[status.status ?? "disconnected"] : "Loading…"}
              </span>
              {status?.phoneNumber ? ` (${status.phoneNumber})` : ""}
            </p>
            {status?.lastError ? (
              <p className="text-xs text-amber-700 dark:text-amber-400">{status.lastError}</p>
            ) : null}
            {status?.status === "qr_pending" && status.qrDataUrl ? (
              <div>
                <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">
                  Scan this with WhatsApp on the phone that will act as the bot number (Linked
                  Devices → Link a device).
                </p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={status.qrDataUrl}
                  alt="WhatsApp QR code"
                  className="h-56 w-56 rounded border border-zinc-200 dark:border-zinc-800"
                />
              </div>
            ) : null}
            {status?.status === "disconnected" ? (
              <button
                type="button"
                disabled={connecting}
                onClick={handleConnect}
                className="rounded bg-zinc-900 px-3 py-1 text-sm font-medium text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
              >
                {connecting ? "Connecting…" : "Connect"}
              </button>
            ) : null}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          Linked numbers
        </h2>
        <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">
          Only numbers an admin has linked to an account can use the assistant over WhatsApp —
          unregistered numbers automatically receive a reply saying the number isn&apos;t
          registered.
        </p>
        {links.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No numbers have been linked yet.
          </p>
        ) : (
          <ul className="mb-2 divide-y divide-zinc-100 rounded border border-zinc-200 text-sm dark:divide-zinc-900 dark:border-zinc-800">
            {links.map((link) => (
              <li key={link.id} className="flex items-center justify-between px-3 py-1.5">
                <span>
                  {link.phoneNumber} — {link.userEmail}
                </span>
                <button
                  type="button"
                  disabled={unlinkingId === link.id}
                  onClick={() => handleUnlink(link.id)}
                  className="rounded border border-red-300 px-2 py-0.5 text-xs font-medium text-red-700 disabled:opacity-40 dark:border-red-900 dark:text-red-400"
                >
                  {unlinkingId === link.id ? "Unlinking…" : "Unlink"}
                </button>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={handleLink} className="flex items-center gap-2">
          <input
            type="text"
            required
            placeholder="Phone number (e.g. 628123456789)"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          <select
            required
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">Select a user…</option>
            {availableUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.email}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={linking}
            className="rounded bg-zinc-900 px-3 py-1 text-sm font-medium text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {linking ? "Linking…" : "Link"}
          </button>
        </form>
      </section>
    </div>
  );
}
