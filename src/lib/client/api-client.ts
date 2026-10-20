export class MissingDevUserError extends Error {
  constructor() {
    super("Atur User ID (dev) terlebih dahulu di bagian atas halaman.");
    this.name = "MissingDevUserError";
  }
}

/** Adds the temporary x-user-id header. Never overrides content-type — callers set it
 * themselves for JSON bodies, and FormData uploads need the browser to set it instead. */
export async function apiFetch(
  userId: string | null,
  input: string,
  init: RequestInit = {},
): Promise<Response> {
  if (!userId) {
    throw new MissingDevUserError();
  }
  const headers = new Headers(init.headers);
  headers.set("x-user-id", userId);
  return fetch(input, { ...init, headers });
}

export async function parseJsonOrThrow<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok) {
    throw new Error(data?.error ?? `Permintaan gagal (HTTP ${response.status}).`);
  }
  return data as T;
}
