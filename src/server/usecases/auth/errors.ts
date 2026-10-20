export class InvalidCredentialsError extends Error {
  constructor() {
    super("Email atau password salah.");
    this.name = "InvalidCredentialsError";
  }
}

export class AccountDisabledError extends Error {
  constructor() {
    super("Akun ini telah dinonaktifkan.");
    this.name = "AccountDisabledError";
  }
}

export class RateLimitedError extends Error {
  constructor(public readonly retryAfterMs: number) {
    super("Terlalu banyak percobaan login. Coba lagi beberapa saat lagi.");
    this.name = "RateLimitedError";
  }
}

export class UnauthenticatedError extends Error {
  constructor() {
    super("Sesi tidak valid atau sudah berakhir. Silakan login kembali.");
    this.name = "UnauthenticatedError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "Anda tidak memiliki izin untuk melakukan aksi ini.") {
    super(message);
    this.name = "ForbiddenError";
  }
}
