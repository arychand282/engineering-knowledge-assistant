import { recordAuditEvent } from "@/server/repositories/audit-event.repository";
import { findUserById } from "@/server/repositories/user.repository";
import {
  findWhatsappLinkByPhone,
  findWhatsappLinkByUserId,
  insertWhatsappLink,
  type WhatsappLinkRow,
} from "@/server/repositories/whatsapp-link.repository";
import { PhoneAlreadyLinkedError, UserAlreadyLinkedError, UserNotFoundError } from "./errors";

export interface LinkWhatsappNumberInput {
  phoneNumber: string;
  userId: string;
  actorUserId: string;
}

export async function linkWhatsappNumber(input: LinkWhatsappNumberInput): Promise<WhatsappLinkRow> {
  const { phoneNumber, userId, actorUserId } = input;

  const user = await findUserById(userId);
  if (!user) {
    throw new UserNotFoundError(userId);
  }

  const existingByPhone = await findWhatsappLinkByPhone(phoneNumber);
  if (existingByPhone) {
    throw new PhoneAlreadyLinkedError(phoneNumber);
  }
  const existingByUser = await findWhatsappLinkByUserId(userId);
  if (existingByUser) {
    throw new UserAlreadyLinkedError(userId);
  }

  const link = await insertWhatsappLink({ phoneNumber, userId, linkedBy: actorUserId });

  await recordAuditEvent({
    actorUserId,
    action: "link_whatsapp_number",
    resourceType: "user",
    resourceId: userId,
    result: "success",
    metadata: { phoneNumber },
  });

  return link;
}
