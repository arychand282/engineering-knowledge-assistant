import { z } from "zod";
import { ALL_ROLES } from "@/server/auth/roles";

export const userIdParamSchema = z.object({
  id: z.string().uuid("id pengguna tidak valid"),
});

export const updateUserSchema = z
  .object({
    isActive: z.boolean().optional(),
    roleNames: z.array(z.enum(ALL_ROLES)).optional(),
  })
  .refine((value) => value.isActive !== undefined || value.roleNames !== undefined, {
    message: "Minimal salah satu dari isActive atau roleNames wajib diisi.",
  });

export const auditEventsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
