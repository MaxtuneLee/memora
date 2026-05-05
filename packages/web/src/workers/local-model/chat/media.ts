import { RawAudio, RawImage } from "@huggingface/transformers";
import type { LocalChatContent } from "@memora/local-model-runtime";

const LOCAL_MODEL_IMAGE_MAX_EDGE = 960;
const LOCAL_MODEL_IMAGE_MIME_TYPE = "image/jpeg";
const LOCAL_MODEL_IMAGE_QUALITY = 0.8;

const dataUrlToBlob = (dataUrl: string, mimeType: string): Blob => {
  const base64 = dataUrl.includes(",") ? dataUrl.slice(dataUrl.indexOf(",") + 1) : dataUrl;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
};

const canvasToBlob = async (
  canvas: OffscreenCanvas | HTMLCanvasElement,
  options: ImageEncodeOptions,
): Promise<Blob | null> => {
  if ("convertToBlob" in canvas) {
    return canvas.convertToBlob(options);
  }

  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob(
      (blob) => resolve(blob),
      options.type,
      typeof options.quality === "number" ? options.quality : undefined,
    );
  });
};

const createCanvas = (
  width: number,
  height: number,
): OffscreenCanvas | HTMLCanvasElement | null => {
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(width, height);
  }

  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  return null;
};

export const compressLocalModelImageBlob = async (blob: Blob): Promise<Blob> => {
  if (typeof createImageBitmap !== "function") {
    return blob;
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    return blob;
  }

  try {
    const scale = Math.min(1, LOCAL_MODEL_IMAGE_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = createCanvas(width, height);
    const context = canvas?.getContext("2d");

    if (!canvas || !context) {
      return blob;
    }

    context.fillStyle = "#fff";
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);

    return (
      (await canvasToBlob(canvas, {
        type: LOCAL_MODEL_IMAGE_MIME_TYPE,
        quality: LOCAL_MODEL_IMAGE_QUALITY,
      })) ?? blob
    );
  } finally {
    bitmap.close();
  }
};

export const localImageContentToRawImage = async (
  content: Extract<LocalChatContent, { type: "image" }>,
): Promise<RawImage> => {
  const blob = dataUrlToBlob(content.data, content.mimeType);
  return RawImage.fromBlob(await compressLocalModelImageBlob(blob));
};

export const localAudioContentToRawAudio = (
  content: Extract<LocalChatContent, { type: "audio" }>,
): RawAudio => {
  const blob = dataUrlToBlob(content.data, content.mimeType);
  void blob;
  throw new Error("Audio chat input requires decoded Float32Array support before generation.");
};
