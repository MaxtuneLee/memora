import { UploadGoneError, type BlobProvider, type UploadedPart } from "../blobProvider";

/**
 * R2 behind Memora's WebDAV Worker (`packages/webdav-worker`). The Worker exposes R2's multipart
 * upload with S3-shaped requests and the same Basic auth as WebDAV, so the browser never holds R2
 * credentials and the bucket needs no CORS rules.
 */
export const createR2WorkerProvider = ({
  url,
  username,
  password,
}: {
  url: string;
  username?: string;
  password?: string;
}): BlobProvider => {
  const auth: Record<string, string> =
    username !== undefined
      ? { Authorization: `Basic ${btoa(`${username}:${password ?? ""}`)}` }
      : {};
  const objectUrl = (key: string, query = "") =>
    `${url}/${key.split("/").map(encodeURIComponent).join("/")}${query}`;

  const send = async (
    input: string,
    init: { method: string; headers?: Record<string, string>; body?: BodyInit },
    what: string,
  ): Promise<Response> => {
    const response = await fetch(input, { ...init, headers: { ...auth, ...init.headers } });
    // The Worker answers 409 when R2 no longer has the upload.
    if (response.status === 409) throw new UploadGoneError(`${what}: upload no longer exists`);
    if (!response.ok) throw new Error(`${what} failed: ${response.status} ${response.statusText}`);
    return response;
  };

  return {
    id: url,
    partSize: 8 * 1024 * 1024,

    async createUpload(key, contentType) {
      const response = await send(
        objectUrl(key, "?uploads"),
        { method: "POST", headers: { "Content-Type": contentType } },
        "Create upload",
      );
      const { uploadId } = (await response.json()) as { uploadId: string };
      return uploadId;
    },

    async uploadPart(key, uploadId, partNumber, body) {
      const query = `?uploadId=${encodeURIComponent(uploadId)}&partNumber=${partNumber}`;
      const response = await send(
        objectUrl(key, query),
        { method: "PUT", body },
        `Upload part ${partNumber}`,
      );
      return (await response.json()) as UploadedPart;
    },

    async completeUpload(key, uploadId, parts) {
      await send(
        objectUrl(key, `?uploadId=${encodeURIComponent(uploadId)}`),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ parts }),
        },
        "Complete upload",
      );
    },

    async abortUpload(key, uploadId) {
      await send(
        objectUrl(key, `?uploadId=${encodeURIComponent(uploadId)}`),
        { method: "DELETE" },
        "Abort upload",
      ).catch((error: unknown) => {
        if (!(error instanceof UploadGoneError)) throw error;
      });
    },

    async deletePrefix(prefix) {
      // The Worker deletes a collection recursively, like WebDAV's DELETE.
      await send(objectUrl(prefix), { method: "DELETE" }, "Delete");
    },

    async download(key) {
      const response = await fetch(objectUrl(key), { headers: auth });
      if (response.status === 404) return null;
      if (!response.ok || !response.body) {
        throw new Error(`Download failed: ${response.status} ${response.statusText}`);
      }
      return response.body;
    },
  };
};
