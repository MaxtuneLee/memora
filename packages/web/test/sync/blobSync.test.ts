import { describe, expect, it } from "vitest";

import { UploadGoneError, type BlobProvider } from "../../src/lib/sync/blobProvider";
import { uploadBlob, type UploadProgress } from "../../src/lib/sync/blobSync";

/** Multipart store in memory, with 4-byte parts. `forget()` simulates an expired upload. */
const fakeProvider = () => {
  const uploads = new Map<string, Map<number, string>>();
  const objects = new Map<string, string>();
  const calls: string[] = [];
  let next = 0;

  const provider: BlobProvider = {
    id: "fake",
    partSize: 4,
    async createUpload() {
      const uploadId = `u${++next}`;
      uploads.set(uploadId, new Map());
      calls.push(`create ${uploadId}`);
      return uploadId;
    },
    async uploadPart(_key, uploadId, partNumber, body) {
      const parts = uploads.get(uploadId);
      if (!parts) throw new UploadGoneError("gone");
      parts.set(partNumber, await body.text());
      calls.push(`part ${uploadId}#${partNumber}`);
      return { partNumber, etag: `${uploadId}-${partNumber}` };
    },
    async completeUpload(key, uploadId, parts) {
      const stored = uploads.get(uploadId);
      if (!stored) throw new UploadGoneError("gone");
      objects.set(key, parts.map((part) => stored.get(part.partNumber)).join(""));
      uploads.delete(uploadId);
    },
    async abortUpload(_key, uploadId) {
      uploads.delete(uploadId);
      calls.push(`abort ${uploadId}`);
    },
    async download() {
      return null;
    },
    async deletePrefix() {},
  };
  return { provider, objects, calls, forget: () => uploads.clear() };
};

const upload = (
  provider: BlobProvider,
  text: string,
  progress?: UploadProgress,
  onProgress: (progress: UploadProgress) => Promise<void> = async () => {},
) => uploadBlob({ provider, key: "k", blob: new Blob([text]), progress, onProgress });

describe("uploadBlob", () => {
  it("splits the file into parts and assembles it in order", async () => {
    const { provider, objects } = fakeProvider();
    await upload(provider, "abcdefghij");
    expect(objects.get("k")).toBe("abcdefghij");
  });

  it("uploads an empty file as one empty part", async () => {
    const { provider, objects } = fakeProvider();
    await upload(provider, "");
    expect(objects.get("k")).toBe("");
  });

  it("resumes after the last saved part", async () => {
    const { provider, objects, calls } = fakeProvider();
    let saved: UploadProgress | undefined;
    await expect(
      upload(provider, "abcdefghij", undefined, async (progress) => {
        saved = progress;
        if (progress.parts.length === 2) throw new Error("tab closed");
      }),
    ).rejects.toThrow("tab closed");

    calls.length = 0;
    await upload(provider, "abcdefghij", saved);
    expect(calls).toEqual(["part u1#3"]);
    expect(objects.get("k")).toBe("abcdefghij");
  });

  it("starts over when the server forgot the upload", async () => {
    const { provider, objects, forget } = fakeProvider();
    const stale: UploadProgress = {
      uploadId: "u0",
      size: 10,
      parts: [{ partNumber: 1, etag: "x" }],
    };
    forget();
    await upload(provider, "abcdefghij", stale);
    expect(objects.get("k")).toBe("abcdefghij");
  });

  it("aborts saved progress for a file whose size changed", async () => {
    const { provider, objects, calls } = fakeProvider();
    const old: UploadProgress = { uploadId: "u9", size: 3, parts: [] };
    await upload(provider, "abcdefghij", old);
    expect(calls[0]).toBe("abort u9");
    expect(objects.get("k")).toBe("abcdefghij");
  });
});
