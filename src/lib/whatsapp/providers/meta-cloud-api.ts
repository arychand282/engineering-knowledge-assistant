import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { handleIncomingWhatsappMessage } from "../handle-incoming-message";

/**
 * Boilerplate for the official Meta WhatsApp Cloud API (graph.facebook.com) — inert
 * until WHATSAPP_PROVIDER=meta is chosen, which requires a verified Meta Business
 * account the client doesn't have yet. Kept here, implemented and ready, so switching
 * away from the unofficial Baileys provider later is a config change, not a rewrite.
 * See PLANNING.md §18 decision 9 and src/lib/env.ts for the provider-selection rationale.
 */

const GRAPH_API_VERSION = "v21.0";

interface MetaWebhookEntry {
  changes: Array<{
    value: {
      messages?: Array<{
        from: string;
        type: string;
        text?: { body: string };
      }>;
    };
  }>;
}

export interface MetaWebhookPayload {
  entry?: MetaWebhookEntry[];
}

/** Meta's GET handshake when a webhook URL is first registered in the App Dashboard. */
export function verifyMetaWebhookSubscription(params: {
  mode: string | null;
  token: string | null;
  challenge: string | null;
}): string | null {
  if (params.mode === "subscribe" && params.token === env.WHATSAPP_META_VERIFY_TOKEN) {
    return params.challenge;
  }
  return null;
}

/**
 * Meta signs every webhook POST body with the app secret (HMAC-SHA256); verifying this
 * is the only thing stopping anyone on the internet from POSTing fake incoming messages
 * to this public endpoint. Constant-time comparison to avoid a timing side-channel.
 */
export function verifyMetaWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
): boolean {
  if (!signatureHeader?.startsWith("sha256=")) {
    return false;
  }
  const expected = createHmac("sha256", env.WHATSAPP_META_APP_SECRET!)
    .update(rawBody)
    .digest("hex");
  const provided = signatureHeader.slice("sha256=".length);

  const expectedBuf = Buffer.from(expected, "hex");
  const providedBuf = Buffer.from(provided, "hex");
  if (expectedBuf.length !== providedBuf.length) {
    return false;
  }
  return timingSafeEqual(expectedBuf, providedBuf);
}

export async function handleMetaWebhookPayload(payload: MetaWebhookPayload): Promise<void> {
  const messages = payload.entry?.flatMap((entry) =>
    entry.changes.flatMap((change) => change.value.messages ?? []),
  );

  for (const message of messages ?? []) {
    if (message.type !== "text" || !message.text?.body) {
      continue; // MVP is text-only, same scope as the Baileys provider
    }
    const reply = await handleIncomingWhatsappMessage({
      phoneNumber: message.from,
      text: message.text.body,
    });
    await sendMetaMessage(message.from, reply);
  }
}

async function sendMetaMessage(toPhoneNumber: string, text: string): Promise<void> {
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${env.WHATSAPP_META_PHONE_NUMBER_ID}/messages`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.WHATSAPP_META_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: toPhoneNumber,
      type: "text",
      text: { body: text },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gagal mengirim pesan via Meta Cloud API (${response.status}): ${body}`);
  }
}
