export interface UploadedPart {
  partNumber: number;
  etag: string;
}

/**
 * What file sync needs from an object store: multipart upload plus reading an object back.
 * Keys are plain strings such as `main/files/<id>/content-<clientId>-<time>`.
 */
export interface BlobProvider {
  /** Identifies the storage location, such as the server URL. Transfer records are kept per id. */
  readonly id: string;
  /** Size of every part except the last. R2 needs equal parts of at least 5 MiB. */
  readonly partSize: number;
  createUpload(key: string, contentType: string): Promise<string>;
  uploadPart(key: string, uploadId: string, partNumber: number, body: Blob): Promise<UploadedPart>;
  completeUpload(key: string, uploadId: string, parts: readonly UploadedPart[]): Promise<void>;
  abortUpload(key: string, uploadId: string): Promise<void>;
  /** The object's contents, or `null` while it does not exist. */
  download(key: string): Promise<ReadableStream<Uint8Array> | null>;
  /** Deletes every object whose key starts with `prefix` (which ends with `/`). */
  deletePrefix(prefix: string): Promise<void>;
}

/** The store no longer knows this upload. Start a new one. */
export class UploadGoneError extends Error {}
