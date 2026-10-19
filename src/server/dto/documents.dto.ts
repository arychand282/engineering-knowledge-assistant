import { z } from "zod";
import { documentStatusEnum } from "@/lib/db/schema";

const emptyToUndefined = (value: unknown) => (value === "" || value === null ? undefined : value);

const optionalUuid = z.preprocess(emptyToUndefined, z.string().uuid().optional());

/**
 * `documentType` is intentionally a free-form string (min length only), not a DB enum —
 * categories are configured per company, not hardcoded in application logic
 * (PLANNING.md #6, #19 rule 5a).
 */
export const uploadDocumentMetadataSchema = z.object({
  title: z.string().trim().min(1, "title wajib diisi"),
  documentNumber: z.string().trim().min(1, "documentNumber wajib diisi"),
  documentType: z.string().trim().min(1, "documentType wajib diisi"),
  revision: z.string().trim().min(1, "revision wajib diisi"),
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
  id: z.string().uuid("id dokumen tidak valid"),
});
