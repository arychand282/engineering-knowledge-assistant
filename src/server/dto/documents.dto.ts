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

export const documentPageParamSchema = z.object({
  id: z.string().uuid("id dokumen tidak valid"),
  page: z.coerce.number().int().positive("page harus berupa angka bulat positif"),
});

/**
 * All fields optional (partial update); explicit `null` clears a nullable column,
 * an absent key leaves it unchanged. `status` has no `null` — it's NOT NULL with a
 * default, so it can only be set to another valid value, never cleared.
 */
export const updateDocumentSchema = z
  .object({
    title: z.string().trim().min(1, "title tidak boleh kosong").optional(),
    documentNumber: z.string().trim().min(1, "documentNumber tidak boleh kosong").optional(),
    documentType: z.string().trim().min(1, "documentType tidak boleh kosong").optional(),
    revision: z.string().trim().min(1, "revision tidak boleh kosong").optional(),
    status: z.enum(documentStatusEnum.enumValues).optional(),
    effectiveDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "effectiveDate harus berformat YYYY-MM-DD")
      .nullable()
      .optional(),
    supersedesDocumentId: z.string().uuid("supersedesDocumentId tidak valid").nullable().optional(),
    projectId: z.string().uuid("projectId tidak valid").nullable().optional(),
    siteId: z.string().uuid("siteId tidak valid").nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Minimal satu field harus diisi untuk diubah.",
  });

export type UpdateDocumentInput = z.infer<typeof updateDocumentSchema>;
