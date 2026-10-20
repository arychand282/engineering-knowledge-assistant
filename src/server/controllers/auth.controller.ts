import { NextResponse } from "next/server";
import { readSessionToken, setSessionCookie, clearSessionCookie } from "@/lib/auth/session-cookie";
import { loginSchema } from "@/server/dto/auth.dto";
import { login } from "@/server/usecases/auth/login.usecase";
import { logout } from "@/server/usecases/auth/logout.usecase";
import {
  AccountDisabledError,
  InvalidCredentialsError,
  RateLimitedError,
} from "@/server/usecases/auth/errors";
import { jsonError, rateLimited, zodBadRequest } from "./_http-errors";
import { getActor, UnauthenticatedError } from "./_actor";

export async function postLogin(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return zodBadRequest(parsed.error);
  }

  try {
    const result = await login({
      email: parsed.data.email,
      password: parsed.data.password,
      userAgent: request.headers.get("user-agent"),
    });
    await setSessionCookie(result.token, result.expiresAt);
    return NextResponse.json({ user: result.actor });
  } catch (error) {
    if (error instanceof RateLimitedError) {
      return rateLimited(error.message, error.retryAfterMs);
    }
    if (error instanceof InvalidCredentialsError) {
      return jsonError(401, error.message);
    }
    if (error instanceof AccountDisabledError) {
      return jsonError(403, error.message);
    }
    throw error;
  }
}

export async function postLogout() {
  const token = await readSessionToken();
  if (token) {
    await logout(token);
  }
  await clearSessionCookie();
  return new NextResponse(null, { status: 204 });
}

export async function getMe() {
  try {
    const actor = await getActor();
    return NextResponse.json({ user: actor });
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return jsonError(401, error.message);
    }
    throw error;
  }
}
