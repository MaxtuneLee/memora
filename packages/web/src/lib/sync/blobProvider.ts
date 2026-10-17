import type { WebdavSyncPayload } from "@/livestore/webdavSync";
import { createR2WorkerProvider } from "./providers/r2Worker";

import type { BlobProvider } from "./blobProviderTypes";

export { UploadGoneError, type BlobProvider, type UploadedPart } from "./blobProviderTypes";

export const createBlobProvider = (config: WebdavSyncPayload): BlobProvider => {
  switch (config.blobProvider ?? "r2-worker") {
    case "r2-worker":
      return createR2WorkerProvider(config);
  }
};
