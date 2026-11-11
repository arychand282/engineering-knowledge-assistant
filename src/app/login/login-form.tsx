"use client";

import { useState, type FormEvent } from "react";
import { apiFetch, parseJsonOrThrow } from "@/lib/client/api-client";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      await parseJsonOrThrow(res);
      // Full page navigation (not router.replace/refresh) so the new session
      // cookie is guaranteed to be picked up on the very first click — a
      // client-side soft navigation here intermittently served a stale,
      // pre-login render of "/" from the router cache.
      window.location.href = "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mx-auto mt-24 grid w-full max-w-sm gap-3 rounded border border-zinc-200 p-6 dark:border-zinc-800"
    >
      <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        Engineering Knowledge Assistant
      </h1>
      <input
        type="email"
        required
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
      />
      <input
        type="password"
        required
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
      />
      <button
        type="submit"
        disabled={submitting}
        className="rounded bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {submitting ? "Logging in…" : "Log in"}
      </button>
      {error ? (
        <p className="rounded border border-red-200 bg-red-50 px-2 py-1.5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      ) : null}
    </form>
  );
}
