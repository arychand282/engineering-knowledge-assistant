import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import {
  getBaileysStatus,
  startBaileysConnection,
} from "@/lib/whatsapp/providers/baileys-provider";
import {
  handleMetaWebhookPayload,
  verifyMetaWebhookSignature,
  verifyMetaWebhookSubscription,
} from "@/lib/whatsapp/providers/meta-cloud-api";
import { linkWhatsappNumberSchema, whatsappLinkIdParamSchema } from "@/server/dto/whatsapp.dto";
import { ROLE_ADMIN } from "@/server/auth/roles";
import {
  PhoneAlreadyLinkedError,
  UserAlreadyLinkedError,
  UserNotFoundError,
  WhatsappLinkNotFoundError,
} from "@/server/usecases/whatsapp/errors";
import { linkWhatsappNumber } from "@/server/usecases/whatsapp/link-whatsapp-number.usecase";
import { listWhatsappLinks } from "@/server/usecases/whatsapp/list-whatsapp-links.usecase";
import { unlinkWhatsappNumber } from "@/server/usecases/whatsapp/unlink-whatsapp-number.usecase";
import { jsonError, zodBadRequest } from "./_http-errors";
import { type Actor, ForbiddenError, UnauthenticatedError, getActor, requireRole } from "./_actor";

type RouteContext = { params: Promise<{ linkId: string }> };

async function resolveAdminActor(): Promise<Actor | Response> {
  try {
    const actor = await getActor();
    requireRole(actor, [ROLE_ADMIN]);
    return actor;
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return jsonError(401, error.message);
    }
    if (error instanceof ForbiddenError) {
      return jsonError(403, error.message);
    }
    throw error;
  }
}

export async function getWhatsappLinks() {
  const actor = await resolveAdminActor();
  if (actor instanceof Response) {
    return actor;
  }

  const items = await listWhatsappLinks();
  return NextResponse.json({ items });
}

export async function postWhatsappLink(request: Request) {
  const actor = await resolveAdminActor();
  if (actor instanceof Response) {
    return actor;
  }

  const body = await request.json().catch(() => null);
  const bodyResult = linkWhatsappNumberSchema.safeParse(body);
  if (!bodyResult.success) {
    return zodBadRequest(bodyResult.error);
  }

  try {
    const link = await linkWhatsappNumber({
      phoneNumber: bodyResult.data.phoneNumber,
      userId: bodyResult.data.userId,
      actorUserId: actor.id,
    });
    return NextResponse.json({ link }, { status: 201 });
  } catch (error) {
    if (error instanceof UserNotFoundError) {
      return jsonError(404, error.message);
    }
    if (error instanceof PhoneAlreadyLinkedError || error instanceof UserAlreadyLinkedError) {
      return jsonError(409, error.message);
    }
    throw error;
  }
}

export async function deleteWhatsappLinkById(_request: Request, context: RouteContext) {
  const actor = await resolveAdminActor();
  if (actor instanceof Response) {
    return actor;
  }

  const paramsResult = whatsappLinkIdParamSchema.safeParse(await context.params);
  if (!paramsResult.success) {
    return zodBadRequest(paramsResult.error);
  }

  try {
    await unlinkWhatsappNumber({ linkId: paramsResult.data.linkId, actorUserId: actor.id });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof WhatsappLinkNotFoundError) {
      return jsonError(404, error.message);
    }
    throw error;
  }
}

export async function getWhatsappStatus() {
  const actor = await resolveAdminActor();
  if (actor instanceof Response) {
    return actor;
  }

  if (env.WHATSAPP_PROVIDER !== "baileys") {
    return NextResponse.json({ provider: env.WHATSAPP_PROVIDER });
  }
  return NextResponse.json({ provider: "baileys", ...getBaileysStatus() });
}

/** Admin-triggered (re)connect — e.g. after a logout to get a fresh QR code. */
export async function postWhatsappConnect() {
  const actor = await resolveAdminActor();
  if (actor instanceof Response) {
    return actor;
  }

  if (env.WHATSAPP_PROVIDER !== "baileys") {
    return jsonError(400, "WHATSAPP_PROVIDER bukan 'baileys'.");
  }
  await startBaileysConnection();
  return NextResponse.json({ provider: "baileys", ...getBaileysStatus() });
}

export async function getWhatsappWebhook(request: Request) {
  if (env.WHATSAPP_PROVIDER !== "meta") {
    return jsonError(404, "Provider WhatsApp bukan 'meta'.");
  }

  const url = new URL(request.url);
  const challenge = verifyMetaWebhookSubscription({
    mode: url.searchParams.get("hub.mode"),
    token: url.searchParams.get("hub.verify_token"),
    challenge: url.searchParams.get("hub.challenge"),
  });

  if (challenge === null) {
    return jsonError(403, "Verifikasi webhook gagal.");
  }
  return new NextResponse(challenge, { status: 200 });
}

export async function postWhatsappWebhook(request: Request) {
  if (env.WHATSAPP_PROVIDER !== "meta") {
    return jsonError(404, "Provider WhatsApp bukan 'meta'.");
  }

  const rawBody = await request.text();
  const signatureValid = verifyMetaWebhookSignature(
    rawBody,
    request.headers.get("x-hub-signature-256"),
  );
  if (!signatureValid) {
    return jsonError(401, "Tanda tangan webhook tidak valid.");
  }

  const payload = JSON.parse(rawBody);
  await handleMetaWebhookPayload(payload);
  return NextResponse.json({ status: "ok" });
}
