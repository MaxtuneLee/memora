import { afterEach, describe, expect, test, vi } from "vite-plus/test";

import { compressLocalModelImageBlob } from "../../src/workers/local-model/chat/media";

describe("local model media helpers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("downscales large image blobs before local model decoding", async () => {
    const drawImage = vi.fn();
    const convertToBlob = vi.fn(async (options: ImageEncodeOptions) => {
      return new Blob(["compressed"], { type: options.type });
    });

    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => ({
        width: 1920,
        height: 1080,
        close: vi.fn(),
      })),
    );
    vi.stubGlobal(
      "OffscreenCanvas",
      class {
        readonly width: number;
        readonly height: number;

        constructor(width: number, height: number) {
          this.width = width;
          this.height = height;
        }

        getContext(contextId: string) {
          expect(contextId).toBe("2d");
          return {
            drawImage,
            fillRect: vi.fn(),
            fillStyle: "",
          };
        }

        convertToBlob(options: ImageEncodeOptions) {
          return convertToBlob(options);
        }
      },
    );

    const compressed = await compressLocalModelImageBlob(
      new Blob(["original image bytes"], { type: "image/png" }),
    );

    expect(compressed.type).toBe("image/jpeg");
    expect(drawImage).toHaveBeenCalledWith(
      expect.objectContaining({ width: 1920, height: 1080 }),
      0,
      0,
      960,
      540,
    );
    expect(convertToBlob).toHaveBeenCalledWith({
      type: "image/jpeg",
      quality: 0.8,
    });
  });
});
