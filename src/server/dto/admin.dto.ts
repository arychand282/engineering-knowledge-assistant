import { z } from "zod";
import { ALL_ROLES } from "@/server/auth/roles";

export const userIdParamSchema = z.object({
  id: z.string().uuid("Invalid user id"),
});

export const updateUserSchema = z
  .object({
    isActive: z.boolean().optional(),
    roleNames: z.array(z.enum(ALL_ROLES)).optional(),
  })
  .refine((value) => value.isActive !== undefined || value.roleNames !== undefined, {
    message: "At least one of isActive or roleNames must be provided.",
  });

export const auditEventsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
