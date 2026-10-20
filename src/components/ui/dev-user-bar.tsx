"use client";

import { useState } from "react";
import { useDevUser } from "@/components/dev-user-provider";

/**
 * Placeholder for real login (Task 6). Lets whoever is testing the app paste a user id
 * (e.g. from `npm run seed:dev-user`) so API calls have an identity to send as
 * `x-user-id`. Visibly labeled as temporary so it's never mistaken for real auth.
 */
export function DevUserBar() {
  const { userId, setUserId } = useDevUser();
  const [draft, setDraft] = useState("");

  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm dark:border-amber-900 dark:bg-amber-950">
      <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-2">
        <span className="font-medium text-amber-900 dark:text-amber-200">
          Mode dev (belum ada login sungguhan):
        </span>
        {userId ? (
          <>
            <code className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900 dark:bg-amber-900 dark:text-amber-200">
              {userId}
            </code>
            <button
              type="button"
              onClick={() => setUserId("")}
              className="text-xs text-amber-700 underline hover:text-amber-900 dark:text-amber-300"
            >
              ganti
            </button>
          </>
        ) : (
          <form
            className="flex flex-1 flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (draft.trim()) {
                setUserId(draft.trim());
              }
            }}
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Tempel user id di sini (npm run seed:dev-user)"
              className="min-w-64 flex-1 rounded border border-amber-300 bg-white px-2 py-1 text-xs dark:border-amber-800 dark:bg-zinc-900"
            />
            <button
              type="submit"
              className="rounded bg-amber-700 px-2 py-1 text-xs font-medium text-white hover:bg-amber-800"
            >
              Simpan
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
