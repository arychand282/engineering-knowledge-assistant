/**
 * TEMPORARY stand-in for authentication, mirroring the server-side placeholder in
 * `src/server/controllers/_temporary-actor.ts`. There is no login page yet (Task 6) —
 * the browser just remembers a user id (from `npm run seed:dev-user` or the database)
 * and sends it as the `x-user-id` header on every API call. Not a security control.
 */
const STORAGE_KEY = "eka_dev_user_id";

export function getStoredDevUserId(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage.getItem(STORAGE_KEY);
}

export function setStoredDevUserId(userId: string): void {
  window.localStorage.setItem(STORAGE_KEY, userId);
}

export function clearStoredDevUserId(): void {
  window.localStorage.removeItem(STORAGE_KEY);
}
