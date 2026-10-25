export class UserNotFoundError extends Error {
  constructor(public readonly userId: string) {
    super(`User ${userId} tidak ditemukan.`);
    this.name = "UserNotFoundError";
  }
}

export class PhoneAlreadyLinkedError extends Error {
  constructor(phoneNumber: string) {
    super(`Nomor ${phoneNumber} sudah ditautkan ke pengguna lain.`);
    this.name = "PhoneAlreadyLinkedError";
  }
}

export class UserAlreadyLinkedError extends Error {
  constructor(userId: string) {
    super(`Pengguna ${userId} sudah punya nomor WhatsApp tertaut.`);
    this.name = "UserAlreadyLinkedError";
  }
}

export class WhatsappLinkNotFoundError extends Error {
  constructor(linkId: string) {
    super(`Tautan WhatsApp ${linkId} tidak ditemukan.`);
    this.name = "WhatsappLinkNotFoundError";
  }
}
