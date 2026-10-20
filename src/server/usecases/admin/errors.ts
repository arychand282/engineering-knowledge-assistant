export class UserNotFoundError extends Error {
  constructor(public readonly userId: string) {
    super(`User ${userId} tidak ditemukan.`);
    this.name = "UserNotFoundError";
  }
}

export class UnknownRoleError extends Error {
  constructor(public readonly roleNames: string[]) {
    super(`Role tidak dikenal: ${roleNames.join(", ")}`);
    this.name = "UnknownRoleError";
  }
}
