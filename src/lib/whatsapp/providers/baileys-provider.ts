import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  type WASocket,
} from "@whiskeysockets/baileys";
import { toDataURL } from "qrcode";
import { env } from "@/lib/env";
import { handleIncomingWhatsappMessage } from "../handle-incoming-message";

export type BaileysStatus = "disconnected" | "connecting" | "qr_pending" | "connected";

interface BaileysState {
  status: BaileysStatus;
  qrDataUrl: string | null;
  phoneNumber: string | null; // the bot account's own number, once connected
  lastError: string | null;
}

const state: BaileysState = {
  status: "disconnected",
  qrDataUrl: null,
  phoneNumber: null,
  lastError: null,
};

let sock: WASocket | null = null;
let starting = false;

export function getBaileysStatus(): BaileysState {
  return { ...state };
}

/**
 * Idempotent — safe to call multiple times (e.g. instrumentation.ts on boot, plus a
 * manual "reconnect" from the admin UI); a connection attempt already in flight is not
 * duplicated. Unofficial (whatsapp-rust-bridge), explicitly chosen over Meta Cloud API
 * for now per the user's decision — the client hasn't registered a Meta Business
 * account yet. Requires one-time QR-code pairing with a real phone; session credentials
 * persist under WHATSAPP_SESSION_DIR afterward so reconnects don't need a fresh scan.
 */
export async function startBaileysConnection(): Promise<void> {
  if (starting || state.status === "connecting" || state.status === "connected") {
    return;
  }
  starting = true;
  state.status = "connecting";
  state.lastError = null;

  try {
    // Not a React hook despite the name — it's Baileys' session-persistence helper.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { state: authState, saveCreds } = await useMultiFileAuthState(env.WHATSAPP_SESSION_DIR);
    sock = makeWASocket({
      auth: authState,
      printQRInTerminal: false,
      // Avoid identifying as a real browser session, since this is an automated bot,
      // not a person using WhatsApp Web — purely cosmetic (shows in the linked-devices
      // list on the paired phone), doesn't affect functionality.
      browser: ["Engineering Knowledge Assistant", "Chrome", "1.0"],
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", (update) => {
      void onConnectionUpdate(update);
    });

    sock.ev.on("messages.upsert", (event) => {
      void onMessagesUpsert(event);
    });
  } catch (error) {
    state.status = "disconnected";
    state.lastError = error instanceof Error ? error.message : String(error);
    console.error("[whatsapp/baileys] Failed to start connection:", error);
  } finally {
    starting = false;
  }
}

async function onConnectionUpdate(
  update: Partial<{
    connection: "close" | "connecting" | "open";
    lastDisconnect: { error?: unknown };
    qr: string;
  }>,
): Promise<void> {
  const { connection, lastDisconnect, qr } = update;

  if (qr) {
    try {
      state.qrDataUrl = await toDataURL(qr);
      state.status = "qr_pending";
    } catch (error) {
      console.error("[whatsapp/baileys] Failed to generate QR code:", error);
    }
  }

  if (connection === "open") {
    state.status = "connected";
    state.qrDataUrl = null;
    state.lastError = null;
    state.phoneNumber = sock?.user?.id?.split(":")[0]?.split("@")[0] ?? null;
    console.log("[whatsapp/baileys] Connected as", state.phoneNumber);
  }

  if (connection === "close") {
    state.status = "disconnected";
    state.qrDataUrl = null;
    // lastDisconnect.error is a Boom error (from the transitive @hapi/boom dep); read the
    // HTTP-style status code structurally rather than importing that package directly.
    const statusCode = (lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)
      ?.output?.statusCode;
    const loggedOut = statusCode === DisconnectReason.loggedOut;
    state.lastError = loggedOut
      ? "WhatsApp session logged out (unlinked from phone) — need to scan QR again."
      : "WhatsApp connection lost, attempting to reconnect.";
    console.warn("[whatsapp/baileys]", state.lastError);

    if (!loggedOut) {
      starting = false;
      await startBaileysConnection();
    }
  }
}

async function onMessagesUpsert(event: {
  messages: Array<{
    key: { remoteJid?: string | null; fromMe?: boolean | null };
    message?: {
      conversation?: string | null;
      extendedTextMessage?: { text?: string | null } | null;
    } | null;
  }>;
  type: "append" | "notify";
}): Promise<void> {
  // "append" = historical/offline messages Baileys syncs in on (re)connect, not live
  // incoming ones — only "notify" means "received while the connection was online"
  // (per Baileys' own Events.d.ts doc comment). Without this check, every reconnect
  // would re-run the RAG pipeline and re-send a WhatsApp reply for old messages that
  // were already answered, potentially many at once.
  if (event.type !== "notify") {
    return;
  }

  for (const message of event.messages) {
    const jid = message.key.remoteJid;
    // Only direct 1:1 chats, never this bot's own outgoing messages, never groups
    // (@g.us) or broadcast/status (@broadcast) — this is a per-user Q&A assistant, not
    // something meant to respond in shared chats.
    if (!jid || message.key.fromMe || !jid.endsWith("@s.whatsapp.net")) {
      continue;
    }

    const text = message.message?.conversation ?? message.message?.extendedTextMessage?.text;
    if (!text || text.trim().length === 0) {
      continue;
    }

    const phoneNumber = jid.split("@")[0];

    try {
      const reply = await handleIncomingWhatsappMessage({ phoneNumber, text: text.trim() });
      await sock?.sendMessage(jid, { text: reply });
    } catch (error) {
      console.error(`[whatsapp/baileys] Failed to process message from ${phoneNumber}:`, error);
      await sock
        ?.sendMessage(jid, {
          text: "An error occurred while processing your question. Please try again.",
        })
        .catch(() => {});
    }
  }
}
