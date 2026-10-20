import { NextResponse } from "next/server";
import { conversationIdParamSchema } from "@/server/dto/chat.dto";
import {
  getConversation,
  listConversations,
  removeConversation,
} from "@/server/usecases/chat/manage-conversation.usecase";
import { ConversationNotFoundError } from "@/server/usecases/chat/errors";
import { jsonError, zodBadRequest } from "./_http-errors";
import { MissingActorError, getTemporaryActorId } from "./_temporary-actor";

type RouteContext = { params: Promise<{ id: string }> };

function resolveActor(request: Request): string | Response {
  try {
    return getTemporaryActorId(request);
  } catch (error) {
    if (error instanceof MissingActorError) {
      return jsonError(401, error.message);
    }
    throw error;
  }
}

export async function getConversations(request: Request) {
  const actor = resolveActor(request);
  if (actor instanceof Response) {
    return actor;
  }

  const items = await listConversations(actor);
  return NextResponse.json({ items });
}

export async function getConversationById(request: Request, context: RouteContext) {
  const actor = resolveActor(request);
  if (actor instanceof Response) {
    return actor;
  }

  const paramsResult = conversationIdParamSchema.safeParse(await context.params);
  if (!paramsResult.success) {
    return zodBadRequest(paramsResult.error);
  }

  try {
    const result = await getConversation(paramsResult.data.id, actor);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ConversationNotFoundError) {
      return jsonError(404, error.message);
    }
    throw error;
  }
}

export async function deleteConversationById(request: Request, context: RouteContext) {
  const actor = resolveActor(request);
  if (actor instanceof Response) {
    return actor;
  }

  const paramsResult = conversationIdParamSchema.safeParse(await context.params);
  if (!paramsResult.success) {
    return zodBadRequest(paramsResult.error);
  }

  try {
    await removeConversation(paramsResult.data.id, actor);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof ConversationNotFoundError) {
      return jsonError(404, error.message);
    }
    throw error;
  }
}
