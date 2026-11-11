import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { env } from "@/lib/env";
import { postChatMessageSchema } from "@/server/dto/chat.dto";
import { askQuestion } from "@/server/usecases/chat/ask-question.usecase";
import { ConversationNotFoundError } from "@/server/usecases/chat/errors";
import { jsonError, rateLimited, zodBadRequest } from "./_http-errors";
import { UnauthenticatedError, getActor } from "./_actor";

export async function postChat(request: Request) {
  let userId: string;
  try {
    const actor = await getActor();
    userId = actor.id;
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return jsonError(401, error.message);
    }
    throw error;
  }

  const rateLimit = checkRateLimit(
    "chat",
    userId,
    env.CHAT_RATE_LIMIT_MAX_ATTEMPTS,
    env.CHAT_RATE_LIMIT_WINDOW_MS,
  );
  if (!rateLimit.allowed) {
    return rateLimited(
      "Too many questions in a short period. Please try again later.",
      rateLimit.retryAfterMs,
    );
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
