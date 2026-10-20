import { z } from "zod";

export const postChatMessageSchema = z.object({
  conversationId: z.string().uuid().optional(),
  message: z
    .string()
    .trim()
    .min(1, "message wajib diisi")
    .max(2000, "message maksimal 2000 karakter"),
});

export type PostChatMessageInput = z.infer<typeof postChatMessageSchema>;

export const conversationIdParamSchema = z.object({
  id: z.string().uuid("id percakapan tidak valid"),
});
