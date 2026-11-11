export class InvalidCredentialsError extends Error {
  constructor() {
    super("Incorrect email or password.");
    this.name = "InvalidCredentialsError";
  }
}

export class AccountDisabledError extends Error {
  constructor() {
    super("This account has been disabled.");
    this.name = "AccountDisabledError";
  }
}

export class RateLimitedError extends Error {
  constructor(public readonly retryAfterMs: number) {
    super("Too many login attempts. Please try again in a moment.");
    this.name = "RateLimitedError";
  }
}

export class UnauthenticatedError extends Error {
  constructor() {
    super("Your session is invalid or has expired. Please log in again.");
    this.name = "UnauthenticatedError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "You do not have permission to perform this action.") {
    super(message);
    this.name = "ForbiddenError";
  }
}
