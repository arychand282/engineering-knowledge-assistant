import { NextResponse } from "next/server";
import { conversationIdParamSchema } from "@/server/dto/chat.dto";
import {
  getConversation,
  listConversations,
  removeConversation,
} from "@/server/usecases/chat/manage-conversation.usecase";
import { ConversationNotFoundError } from "@/server/usecases/chat/errors";
import { jsonError, zodBadRequest } from "./_http-errors";
import { type Actor, UnauthenticatedError, getActor } from "./_actor";

type RouteContext = { params: Promise<{ id: string }> };

async function resolveActor(): Promise<Actor | Response> {
  try {
    return await getActor();
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return jsonError(401, error.message);
    }
    throw error;
  }
}

export async function getConversations() {
  const actor = await resolveActor();
  if (actor instanceof Response) {
    return actor;
  }

  const items = await listConversations(actor.id);
  return NextResponse.json({ items });
}

export async function getConversationById(_request: Request, context: RouteContext) {
  const actor = await resolveActor();
  if (actor instanceof Response) {
    return actor;
  }

  const paramsResult = conversationIdParamSchema.safeParse(await context.params);
  if (!paramsResult.success) {
    return zodBadRequest(paramsResult.error);
  }

  try {
    const result = await getConversation(paramsResult.data.id, actor.id);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ConversationNotFoundError) {
      return jsonError(404, error.message);
    }
    throw error;
  }
}

export async function deleteConversationById(_request: Request, context: RouteContext) {
  const actor = await resolveActor();
  if (actor instanceof Response) {
    return actor;
  }

  const paramsResult = conversationIdParamSchema.safeParse(await context.params);
  if (!paramsResult.success) {
    return zodBadRequest(paramsResult.error);
  }

  try {
    await removeConversation(paramsResult.data.id, actor.id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof ConversationNotFoundError) {
      return jsonError(404, error.message);
    }
    throw error;
  }
}
