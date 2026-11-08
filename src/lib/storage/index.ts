import { env } from "@/lib/env";
import * as localStorage from "./local-storage";
import * as vercelBlobStorage from "./vercel-blob-storage";

/**
 * Storage provider dispatch — same pattern as CHAT_PROVIDER/EMBEDDING_PROVIDER in
 * src/lib/env.ts. Default "local" (filesystem, STORAGE_DIR) for dev; "vercel-blob" for
 * deployments without a persistent local filesystem.
 */
const impl = env.STORAGE_PROVIDER === "vercel-blob" ? vercelBlobStorage : localStorage;

export const saveFile = impl.saveFile;
export const readStoredFile = impl.readStoredFile;
export const deleteStoredFile = impl.deleteStoredFile;
