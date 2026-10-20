import { NextResponse } from "next/server";
import {
  documentIdParamSchema,
  listDocumentsQuerySchema,
  uploadDocumentMetadataSchema,
} from "@/server/dto/documents.dto";
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
import { jsonError, zodBadRequest } from "./_http-errors";
import { getTemporaryActorId, MissingActorError } from "./_temporary-actor";

type RouteContext = { params: Promise<{ id: string }> };

export async function postDocument(request: Request) {
  let uploadedBy: string;
  try {
    uploadedBy = getTemporaryActorId(request);
  } catch (error) {
    if (error instanceof MissingActorError) {
      return jsonError(401, error.message);
    }
    throw error;
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
      uploadedBy,
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
  const url = new URL(request.url);
  const queryResult = listDocumentsQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!queryResult.success) {
    return zodBadRequest(queryResult.error);
  }

  const result = await listDocuments(queryResult.data);
  return NextResponse.json(result);
}

export async function getDocumentById(_request: Request, context: RouteContext) {
  const paramsResult = documentIdParamSchema.safeParse(await context.params);
  if (!paramsResult.success) {
    return zodBadRequest(paramsResult.error);
  }

  try {
    const result = await getDocument(paramsResult.data.id);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof DocumentNotFoundError) {
      return jsonError(404, error.message);
    }
    throw error;
  }
}

export async function postReprocessDocument(_request: Request, context: RouteContext) {
  const paramsResult = documentIdParamSchema.safeParse(await context.params);
  if (!paramsResult.success) {
    return zodBadRequest(paramsResult.error);
  }

  try {
    const result = await reprocessDocument(paramsResult.data.id);
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
