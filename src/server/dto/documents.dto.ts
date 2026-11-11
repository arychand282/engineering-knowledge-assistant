import { z } from "zod";
import { documentStatusEnum } from "@/lib/db/schema";
import { ALL_ROLES } from "@/server/auth/roles";

const emptyToUndefined = (value: unknown) => (value === "" || value === null ? undefined : value);

const optionalUuid = z.preprocess(emptyToUndefined, z.string().uuid().optional());

/**
 * `documentType` is intentionally a free-form string (min length only), not a DB enum —
 * categories are configured per company, not hardcoded in application logic
 * (PLANNING.md #6, #19 rule 5a).
 */
export const uploadDocumentMetadataSchema = z.object({
  title: z.string().trim().min(1, "title is required"),
  documentNumber: z.string().trim().min(1, "documentNumber is required"),
  documentType: z.string().trim().min(1, "documentType is required"),
  revision: z.string().trim().min(1, "revision is required"),
  projectId: optionalUuid,
  siteId: optionalUuid,
});

export type UploadDocumentMetadata = z.infer<typeof uploadDocumentMetadataSchema>;

export const listDocumentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(documentStatusEnum.enumValues).optional(),
  documentType: z.string().trim().min(1).optional(),
  search: z.string().trim().min(1).optional(),
});

export type ListDocumentsQuery = z.infer<typeof listDocumentsQuerySchema>;

export const documentIdParamSchema = z.object({
  id: z.string().uuid("Invalid document id"),
});

export const documentPageParamSchema = z.object({
  id: z.string().uuid("Invalid document id"),
  page: z.coerce.number().int().positive("page must be a positive integer"),
});

/**
 * All fields optional (partial update); explicit `null` clears a nullable column,
 * an absent key leaves it unchanged. `status` has no `null` — it's NOT NULL with a
 * default, so it can only be set to another valid value, never cleared.
 */
export const updateDocumentSchema = z
  .object({
    title: z.string().trim().min(1, "title cannot be empty").optional(),
    documentNumber: z.string().trim().min(1, "documentNumber cannot be empty").optional(),
    documentType: z.string().trim().min(1, "documentType cannot be empty").optional(),
    revision: z.string().trim().min(1, "revision cannot be empty").optional(),
    status: z.enum(documentStatusEnum.enumValues).optional(),
    effectiveDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "effectiveDate must be in YYYY-MM-DD format")
      .nullable()
      .optional(),
    supersedesDocumentId: z.string().uuid("Invalid supersedesDocumentId").nullable().optional(),
    projectId: z.string().uuid("Invalid projectId").nullable().optional(),
    siteId: z.string().uuid("Invalid siteId").nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided to update.",
  });

export type UpdateDocumentInput = z.infer<typeof updateDocumentSchema>;

export const grantDocumentAccessSchema = z.object({
  roleName: z.enum(ALL_ROLES),
});

export type GrantDocumentAccessInput = z.infer<typeof grantDocumentAccessSchema>;

export const documentAccessIdParamSchema = z.object({
  id: z.string().uuid("Invalid document id"),
  accessId: z.string().uuid("Invalid access id"),
});
