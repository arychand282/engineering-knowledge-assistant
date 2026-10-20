import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { env } from "@/lib/env";
import {
  documentIdParamSchema,
  listDocumentsQuerySchema,
  uploadDocumentMetadataSchema,
} from "@/server/dto/documents.dto";
import { DOCUMENT_MANAGEMENT_ROLES } from "@/server/auth/roles";
import { recordAuditEvent } from "@/server/repositories/audit-event.repository";
import { getDocument } from "@/server/usecases/documents/get-document.usecase";
import {
  CorruptPdfError,
  DocumentNotFoundError,
  DuplicateDocumentError,
  FileTooLargeError,
  InvalidFileError,
  TooManyPagesError,
} from "@/server/usecases/documents/errors";
import { listDocuments } from "@/server/usecases/documents/list-documents.usecase";
import { reprocessDocument } from "@/server/usecases/documents/reprocess-document.usecase";
import { uploadDocument } from "@/server/usecases/documents/upload-document.usecase";
import { jsonError, rateLimited, zodBadRequest } from "./_http-errors";
import { type Actor, ForbiddenError, UnauthenticatedError, getActor, requireRole } from "./_actor";

type RouteContext = { params: Promise<{ id: string }> };

async function resolveActor(): Promise<Actor | Response> {
  try {
    return await getActor();
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return jsonError(401, error.message);
    }
    throw error;
  }
}

export async function postDocument(request: Request) {
  const actor = await resolveActor();
  if (actor instanceof Response) {
    return actor;
  }

  try {
    requireRole(actor, DOCUMENT_MANAGEMENT_ROLES);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return jsonError(403, error.message);
    }
    throw error;
  }

  const rateLimit = checkRateLimit(
    "upload",
    actor.id,
    env.UPLOAD_RATE_LIMIT_MAX_ATTEMPTS,
    env.UPLOAD_RATE_LIMIT_WINDOW_MS,
  );
  if (!rateLimit.allowed) {
    return rateLimited(
      "Terlalu banyak upload dalam waktu singkat. Coba lagi nanti.",
      rateLimit.retryAfterMs,
    );
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return jsonError(400, "Field 'file' wajib diisi dengan satu file PDF.");
  }

  const metadataResult = uploadDocumentMetadataSchema.safeParse({
    title: formData.get("title"),
    documentNumber: formData.get("documentNumber"),
    documentType: formData.get("documentType"),
    revision: formData.get("revision"),
    projectId: formData.get("projectId"),
    siteId: formData.get("siteId"),
  });
  if (!metadataResult.success) {
    return zodBadRequest(metadataResult.error);
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    const result = await uploadDocument({
      file: { buffer, mimeType: file.type, originalFilename: file.name },
      metadata: metadataResult.data,
      uploadedBy: actor.id,
    });
    await recordAuditEvent({
      actorUserId: actor.id,
      action: "upload_document",
      resourceType: "document",
      resourceId: result.document.id,
      result: "success",
      metadata: { documentNumber: metadataResult.data.documentNumber },
    });
    return NextResponse.json(
      {
        document: result.document,
        pageCount: result.pageCount,
        chunkCount: result.chunkCount,
        embeddedCount: result.embeddedCount,
        embeddingSkipped: result.embeddingSkipped,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof InvalidFileError || error instanceof FileTooLargeError) {
      return jsonError(400, error.message);
    }
    if (error instanceof CorruptPdfError || error instanceof TooManyPagesError) {
      return jsonError(422, error.message);
    }
    if (error instanceof DuplicateDocumentError) {
      return NextResponse.json(
        { error: error.message, existingDocumentId: error.existingDocumentId },
        { status: 409 },
      );
    }
    throw error;
  }
}

export async function getDocuments(request: Request) {
  const actor = await resolveActor();
  if (actor instanceof Response) {
    return actor;
  }

  const url = new URL(request.url);
  const queryResult = listDocumentsQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!queryResult.success) {
    return zodBadRequest(queryResult.error);
  }

  const result = await listDocuments(queryResult.data, actor);
  return NextResponse.json(result);
}

export async function getDocumentById(_request: Request, context: RouteContext) {
  const actor = await resolveActor();
  if (actor instanceof Response) {
    return actor;
  }

  const paramsResult = documentIdParamSchema.safeParse(await context.params);
  if (!paramsResult.success) {
    return zodBadRequest(paramsResult.error);
  }

  try {
    const result = await getDocument(paramsResult.data.id, actor);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof DocumentNotFoundError) {
      return jsonError(404, error.message);
    }
    throw error;
  }
}

export async function postReprocessDocument(_request: Request, context: RouteContext) {
  const actor = await resolveActor();
  if (actor instanceof Response) {
    return actor;
  }

  try {
    requireRole(actor, DOCUMENT_MANAGEMENT_ROLES);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return jsonError(403, error.message);
    }
    throw error;
  }

  const paramsResult = documentIdParamSchema.safeParse(await context.params);
  if (!paramsResult.success) {
    return zodBadRequest(paramsResult.error);
  }

  try {
    const result = await reprocessDocument(paramsResult.data.id);
    await recordAuditEvent({
      actorUserId: actor.id,
      action: "reprocess_document",
      resourceType: "document",
      resourceId: paramsResult.data.id,
      result: "success",
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof DocumentNotFoundError) {
      return jsonError(404, error.message);
    }
    if (error instanceof CorruptPdfError || error instanceof TooManyPagesError) {
      return jsonError(422, error.message);
    }
    throw error;
  }
}
