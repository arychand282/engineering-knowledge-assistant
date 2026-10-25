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
  disconnected: "Terputus",
  connecting: "Menyambungkan…",
  qr_pending: "Menunggu scan QR",
  connected: "Tersambung",
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
      setError(err instanceof Error ? err.message : "Gagal memuat status WhatsApp.");
    }
  }, []);

  const loadLinks = useCallback(async () => {
    try {
      const res = await apiFetch("/api/v1/admin/whatsapp/links");
      const data = await parseJsonOrThrow<{ items: WhatsappLinkRow[] }>(res);
      setLinks(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat daftar tautan.");
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
      setError(err instanceof Error ? err.message : "Gagal memulai koneksi WhatsApp.");
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
        throw new Error((await res.json().catch(() => null))?.error ?? "Gagal menautkan nomor.");
      }
      setPhoneNumber("");
      setUserId("");
      await loadLinks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menautkan nomor.");
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
        throw new Error((await res.json().catch(() => null))?.error ?? "Gagal melepas tautan.");
      }
      await loadLinks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal melepas tautan.");
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
        <h2 className="mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Koneksi</h2>
        {status?.provider === "none" ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Integrasi WhatsApp belum diaktifkan (WHATSAPP_PROVIDER=none).
          </p>
        ) : status?.provider === "meta" ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Menggunakan Meta Cloud API — tidak perlu scan QR, koneksi dikelola lewat webhook.
          </p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm">
              Status:{" "}
              <span className="font-medium">
                {status ? STATUS_LABELS[status.status ?? "disconnected"] : "Memuat…"}
              </span>
              {status?.phoneNumber ? ` (${status.phoneNumber})` : ""}
            </p>
            {status?.lastError ? (
              <p className="text-xs text-amber-700 dark:text-amber-400">{status.lastError}</p>
            ) : null}
            {status?.status === "qr_pending" && status.qrDataUrl ? (
              <div>
                <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">
                  Scan dengan WhatsApp di ponsel yang akan dijadikan nomor bot (Perangkat Tertaut →
                  Tautkan perangkat).
                </p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={status.qrDataUrl}
                  alt="QR code WhatsApp"
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
                {connecting ? "Menyambungkan…" : "Sambungkan"}
              </button>
            ) : null}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          Nomor tertaut
        </h2>
        <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">
          Hanya nomor yang ditautkan admin ke sebuah akun bisa menggunakan asisten lewat WhatsApp —
          nomor yang tidak terdaftar akan dibalas otomatis bahwa nomornya belum terdaftar.
        </p>
        {links.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Belum ada nomor yang ditautkan.
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
                  {unlinkingId === link.id ? "Melepas…" : "Lepas"}
                </button>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={handleLink} className="flex items-center gap-2">
          <input
            type="text"
            required
            placeholder="Nomor telepon (contoh: 628123456789)"
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
            <option value="">Pilih pengguna…</option>
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
            {linking ? "Menautkan…" : "Tautkan"}
          </button>
        </form>
      </section>
    </div>
  );
}
