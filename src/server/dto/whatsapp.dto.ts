import { z } from "zod";

/**
 * Digits only, country code included, no leading "+" — matches how both Baileys (JID
 * local part) and Meta's Cloud API represent a sender's number. Accepts the `+` or
 * spaces/dashes a human would naturally type and strips them before validating length,
 * so an admin can paste a number in whatever format they have it in.
 */
export function normalizePhoneNumber(raw: string): string {
  return raw.replace(/[^0-9]/g, "");
}

const phoneNumberSchema = z
  .string()
  .trim()
  .transform(normalizePhoneNumber)
  .pipe(
    z.string().regex(/^[0-9]{8,15}$/, "Nomor telepon harus 8–15 digit (format E.164 tanpa '+')"),
  );

export const linkWhatsappNumberSchema = z.object({
  phoneNumber: phoneNumberSchema,
  userId: z.string().uuid("id pengguna tidak valid"),
});

export type LinkWhatsappNumberInput = z.infer<typeof linkWhatsappNumberSchema>;

export const whatsappLinkIdParamSchema = z.object({
  linkId: z.string().uuid("id tautan tidak valid"),
});
