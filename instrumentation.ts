/**
 * Boots the Baileys WhatsApp connection once when the server starts, so pairing
 * survives across requests instead of connecting lazily per-request. No-op unless
 * WHATSAPP_PROVIDER=baileys (see src/lib/env.ts) — the Meta Cloud API provider needs no
 * boot step, since it's a passive webhook receiver, not a persistent connection.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const { env } = await import("@/lib/env");
  if (env.WHATSAPP_PROVIDER !== "baileys") {
    return;
  }

  const { startBaileysConnection } = await import("@/lib/whatsapp/providers/baileys-provider");
  await startBaileysConnection();
}
