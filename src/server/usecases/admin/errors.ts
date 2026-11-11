export class UserNotFoundError extends Error {
  constructor(public readonly userId: string) {
    super(`User ${userId} not found.`);
    this.name = "UserNotFoundError";
  }
}

export class UnknownRoleError extends Error {
  constructor(public readonly roleNames: string[]) {
    super(`Unknown role(s): ${roleNames.join(", ")}`);
    this.name = "UnknownRoleError";
  }
}
