import {
  deleteConversationById,
  getConversationById,
} from "@/server/controllers/conversations.controller";

export const GET = getConversationById;
export const DELETE = deleteConversationById;
