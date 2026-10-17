import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";

const opfs = vi.hoisted(() => ({
  file: vi.fn(),
  getOriginFile: vi.fn(),
  arrayBuffer: vi.fn(),
}));

vi.mock("@memora/fs", () => ({
  file: opfs.file,
}));

import {
  resolveChatImageAttachmentBlob,
  type ChatImageAttachment,
} from "@/lib/chat/chatImageAttachments";

const createAttachment = (
  source: ChatImageAttachment["source"],
  path: string,
): ChatImageAttachment => ({
  id: "image-1",
  kind: "image",
  source,
  name: "image.png",
  mimeType: "image/png",
  sizeBytes: 5,
  ...(source === "local" ? { assetPath: path } : { fileId: "file-1", storagePath: path }),
});

beforeEach(() => {
  vi.resetAllMocks();
  opfs.file.mockReturnValue({
    getOriginFile: opfs.getOriginFile,
    arrayBuffer: opfs.arrayBuffer,
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("remote image")),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test.each(["local", "library"] as const)("reads %s image attachments from OPFS", async (source) => {
  const path = source === "local" ? "/chat/session-assets/session-1/image.png" : "/files/image.png";
  const file = new File(["image"], "image.png", { type: "image/png" });
  opfs.getOriginFile.mockResolvedValue(file);

  expect(await resolveChatImageAttachmentBlob(createAttachment(source, path))).toBe(file);
  expect(opfs.file).toHaveBeenCalledWith(path);
  expect(fetch).not.toHaveBeenCalled();
});

test("falls back to OPFS bytes when an origin file is unavailable", async () => {
  opfs.getOriginFile.mockResolvedValue(null);
  opfs.arrayBuffer.mockResolvedValue(new TextEncoder().encode("image").buffer);

  const blob = await resolveChatImageAttachmentBlob(createAttachment("local", "/chat/image.png"));

  expect(blob?.type).toBe("image/png");
  expect(await blob?.text()).toBe("image");
  expect(fetch).not.toHaveBeenCalled();
});

test("returns null for a missing OPFS image without requesting a URL", async () => {
  opfs.getOriginFile.mockRejectedValue(new Error("File not found"));

  expect(
    await resolveChatImageAttachmentBlob(createAttachment("library", "/files/missing.png")),
  ).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
});

test.each(["local", "library"] as const)(
  "rejects URLs and non-OPFS paths in %s attachments without making a request",
  async (source) => {
    for (const path of [
      "https://example.test/image.png",
      "http://127.0.0.1/image.png",
      "http://169.254.169.254/latest/meta-data/",
      "data:image/png;base64,aW1hZ2U=",
      "blob:https://example.test/image-1",
      "image.png",
      "",
    ]) {
      expect(await resolveChatImageAttachmentBlob(createAttachment(source, path))).toBeNull();
    }

    expect(opfs.file).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  },
);
