import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { env } from "@/lib/env";
import {
  documentAccessIdParamSchema,
  documentIdParamSchema,
  documentPageParamSchema,
  grantDocumentAccessSchema,
  listDocumentsQuerySchema,
  updateDocumentSchema,
  uploadDocumentMetadataSchema,
} from "@/server/dto/documents.dto";
import { DOCUMENT_MANAGEMENT_ROLES } from "@/server/auth/roles";
import { recordAuditEvent } from "@/server/repositories/audit-event.repository";
import { getDocument } from "@/server/usecases/documents/get-document.usecase";
import { getDocumentFile } from "@/server/usecases/documents/get-document-file.usecase";
import { getDocumentPage } from "@/server/usecases/documents/get-document-page.usecase";
import {
  AccessGrantNotFoundError,
  CorruptDocxError,
  CorruptPdfError,
  DocumentNotFoundError,
  DuplicateAccessGrantError,
  DuplicateDocumentError,
  FileTooLargeError,
  InvalidFileError,
  LibreOfficeUnavailableError,
  PageNotFoundError,
  SelfSupersedeError,
  TooManyPagesError,
  UnknownRoleError,
} from "@/server/usecases/documents/errors";
import { grantDocumentAccess } from "@/server/usecases/documents/grant-document-access.usecase";
import { listDocumentAccess } from "@/server/usecases/documents/list-document-access.usecase";
import { listDocuments } from "@/server/usecases/documents/list-documents.usecase";
import { reprocessDocument } from "@/server/usecases/documents/reprocess-document.usecase";
import { revokeDocumentAccess } from "@/server/usecases/documents/revoke-document-access.usecase";
import { updateDocument } from "@/server/usecases/documents/update-document.usecase";
import { uploadDocument } from "@/server/usecases/documents/upload-document.usecase";
import { jsonError, rateLimited, zodBadRequest } from "./_http-errors";
import { type Actor, ForbiddenError, UnauthenticatedError, getActor, requireRole } from "./_actor";

type RouteContext = { params: Promise<{ id: string }> };
type PageRouteContext = { params: Promise<{ id: string; page: string }> };
type AccessRouteContext = { params: Promise<{ id: string; accessId: string }> };

async function resolveManagementActor(): Promise<Actor | Response> {
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
  return actor;
}

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
  const actor = await resolveManagementActor();
  if (actor instanceof Response) {
    return actor;
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
    return jsonError(400, "The 'file' field must contain a single PDF or DOCX file.");
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
    if (
      error instanceof CorruptPdfError ||
      error instanceof CorruptDocxError ||
      error instanceof TooManyPagesError
    ) {
      return jsonError(422, error.message);
    }
    if (error instanceof LibreOfficeUnavailableError) {
      return jsonError(503, error.message);
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

export async function getDocumentFileById(_request: Request, context: RouteContext) {
  const actor = await resolveActor();
  if (actor instanceof Response) {
    return actor;
  }

  const paramsResult = documentIdParamSchema.safeParse(await context.params);
  if (!paramsResult.success) {
    return zodBadRequest(paramsResult.error);
  }

  try {
    const { document, buffer } = await getDocumentFile(paramsResult.data.id, actor);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "content-type": document.mimeType,
        "content-disposition": `inline; filename="${document.originalFilename}"`,
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof DocumentNotFoundError) {
      return jsonError(404, error.message);
    }
    throw error;
  }
}

export async function patchDocument(request: Request, context: RouteContext) {
  const actor = await resolveManagementActor();
  if (actor instanceof Response) {
    return actor;
  }

  const paramsResult = documentIdParamSchema.safeParse(await context.params);
  if (!paramsResult.success) {
    return zodBadRequest(paramsResult.error);
  }

  const body = await request.json().catch(() => null);
  const bodyResult = updateDocumentSchema.safeParse(body);
  if (!bodyResult.success) {
    return zodBadRequest(bodyResult.error);
  }

  try {
    const document = await updateDocument({
      documentId: paramsResult.data.id,
      patch: bodyResult.data,
      actorUserId: actor.id,
    });
    return NextResponse.json({ document });
  } catch (error) {
    if (error instanceof DocumentNotFoundError) {
      return jsonError(404, error.message);
    }
    if (error instanceof SelfSupersedeError) {
      return jsonError(400, error.message);
    }
    throw error;
  }
}

export async function getDocumentPageById(_request: Request, context: PageRouteContext) {
  const actor = await resolveActor();
  if (actor instanceof Response) {
    return actor;
  }

  const paramsResult = documentPageParamSchema.safeParse(await context.params);
  if (!paramsResult.success) {
    return zodBadRequest(paramsResult.error);
  }

  try {
    const result = await getDocumentPage(paramsResult.data.id, paramsResult.data.page, actor);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof DocumentNotFoundError || error instanceof PageNotFoundError) {
      return jsonError(404, error.message);
    }
    throw error;
  }
}

export async function postReprocessDocument(_request: Request, context: RouteContext) {
  const actor = await resolveManagementActor();
  if (actor instanceof Response) {
    return actor;
  }

  const rateLimit = checkRateLimit(
    "reprocess",
    actor.id,
    env.REPROCESS_RATE_LIMIT_MAX_ATTEMPTS,
    env.REPROCESS_RATE_LIMIT_WINDOW_MS,
  );
  if (!rateLimit.allowed) {
    return rateLimited(
      "Terlalu banyak permintaan proses ulang dalam waktu singkat. Coba lagi nanti.",
      rateLimit.retryAfterMs,
    );
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
    if (
      error instanceof CorruptPdfError ||
      error instanceof CorruptDocxError ||
      error instanceof TooManyPagesError
    ) {
      return jsonError(422, error.message);
    }
    if (error instanceof LibreOfficeUnavailableError) {
      return jsonError(503, error.message);
    }
    throw error;
  }
}

export async function getDocumentAccess(_request: Request, context: RouteContext) {
  const actor = await resolveManagementActor();
  if (actor instanceof Response) {
    return actor;
  }

  const paramsResult = documentIdParamSchema.safeParse(await context.params);
  if (!paramsResult.success) {
    return zodBadRequest(paramsResult.error);
  }

  try {
    const items = await listDocumentAccess(paramsResult.data.id);
    return NextResponse.json({ items });
  } catch (error) {
    if (error instanceof DocumentNotFoundError) {
      return jsonError(404, error.message);
    }
    throw error;
  }
}

export async function postDocumentAccess(request: Request, context: RouteContext) {
  const actor = await resolveManagementActor();
  if (actor instanceof Response) {
    return actor;
  }

  const paramsResult = documentIdParamSchema.safeParse(await context.params);
  if (!paramsResult.success) {
    return zodBadRequest(paramsResult.error);
  }

  const body = await request.json().catch(() => null);
  const bodyResult = grantDocumentAccessSchema.safeParse(body);
  if (!bodyResult.success) {
    return zodBadRequest(bodyResult.error);
  }

  try {
    const grant = await grantDocumentAccess({
      documentId: paramsResult.data.id,
      roleName: bodyResult.data.roleName,
      actorUserId: actor.id,
    });
    return NextResponse.json({ grant }, { status: 201 });
  } catch (error) {
    if (error instanceof DocumentNotFoundError) {
      return jsonError(404, error.message);
    }
    if (error instanceof UnknownRoleError) {
      return jsonError(400, error.message);
    }
    if (error instanceof DuplicateAccessGrantError) {
      return jsonError(409, error.message);
    }
    throw error;
  }
}

export async function deleteDocumentAccess(_request: Request, context: AccessRouteContext) {
  const actor = await resolveManagementActor();
  if (actor instanceof Response) {
    return actor;
  }

  const paramsResult = documentAccessIdParamSchema.safeParse(await context.params);
  if (!paramsResult.success) {
    return zodBadRequest(paramsResult.error);
  }

  try {
    await revokeDocumentAccess({
      documentId: paramsResult.data.id,
      accessId: paramsResult.data.accessId,
      actorUserId: actor.id,
    });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof DocumentNotFoundError || error instanceof AccessGrantNotFoundError) {
      return jsonError(404, error.message);
    }
    throw error;
  }
}
