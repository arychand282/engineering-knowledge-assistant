import { z } from "zod";

export const postChatMessageSchema = z.object({
  conversationId: z.string().uuid().optional(),
  message: z
    .string()
    .trim()
    .min(1, "message is required")
    .max(2000, "message must be at most 2000 characters"),
});

export type PostChatMessageInput = z.infer<typeof postChatMessageSchema>;

export const conversationIdParamSchema = z.object({
  id: z.string().uuid("Invalid conversation id"),
});
