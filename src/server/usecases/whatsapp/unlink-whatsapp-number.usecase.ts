import { recordAuditEvent } from "@/server/repositories/audit-event.repository";
import { deleteWhatsappLink } from "@/server/repositories/whatsapp-link.repository";
import { WhatsappLinkNotFoundError } from "./errors";

export interface UnlinkWhatsappNumberInput {
  linkId: string;
  actorUserId: string;
}

export async function unlinkWhatsappNumber(input: UnlinkWhatsappNumberInput): Promise<void> {
  const { linkId, actorUserId } = input;

  const deleted = await deleteWhatsappLink(linkId);
  if (!deleted) {
    throw new WhatsappLinkNotFoundError(linkId);
  }

  await recordAuditEvent({
    actorUserId,
    action: "unlink_whatsapp_number",
    resourceType: "user",
    resourceId: null,
    result: "success",
    metadata: { linkId },
  });
}
