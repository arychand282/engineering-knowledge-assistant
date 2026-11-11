export class UserNotFoundError extends Error {
  constructor(public readonly userId: string) {
    super(`User ${userId} not found.`);
    this.name = "UserNotFoundError";
  }
}

export class PhoneAlreadyLinkedError extends Error {
  constructor(phoneNumber: string) {
    super(`Number ${phoneNumber} is already linked to another user.`);
    this.name = "PhoneAlreadyLinkedError";
  }
}

export class UserAlreadyLinkedError extends Error {
  constructor(userId: string) {
    super(`User ${userId} already has a linked WhatsApp number.`);
    this.name = "UserAlreadyLinkedError";
  }
}

export class WhatsappLinkNotFoundError extends Error {
  constructor(linkId: string) {
    super(`WhatsApp link ${linkId} not found.`);
    this.name = "WhatsappLinkNotFoundError";
  }
}
