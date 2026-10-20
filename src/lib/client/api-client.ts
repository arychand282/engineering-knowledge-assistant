/** Thin fetch wrapper: the session cookie is sent automatically by the browser for
 * same-origin requests, so there is nothing to attach here — this only exists so every
 * call shares one response-parsing convention. */
export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  return fetch(input, init);
}

export async function parseJsonOrThrow<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok) {
    throw new Error(data?.error ?? `Permintaan gagal (HTTP ${response.status}).`);
  }
  return data as T;
}
