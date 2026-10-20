import { NextResponse } from "next/server";
import { postChatMessageSchema } from "@/server/dto/chat.dto";
import { askQuestion } from "@/server/usecases/chat/ask-question.usecase";
import { ConversationNotFoundError } from "@/server/usecases/chat/errors";
import { jsonError, zodBadRequest } from "./_http-errors";
import { MissingActorError, getTemporaryActorId } from "./_temporary-actor";

export async function postChat(request: Request) {
  let userId: string;
  try {
    userId = getTemporaryActorId(request);
  } catch (error) {
    if (error instanceof MissingActorError) {
      return jsonError(401, error.message);
    }
    throw error;
  }

  const body = await request.json().catch(() => null);
  const parsed = postChatMessageSchema.safeParse(body);
  if (!parsed.success) {
    return zodBadRequest(parsed.error);
  }

  try {
    const result = await askQuestion({
      conversationId: parsed.data.conversationId,
      message: parsed.data.message,
      userId,
    });
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof ConversationNotFoundError) {
      return jsonError(404, error.message);
    }
    throw error;
  }
}
