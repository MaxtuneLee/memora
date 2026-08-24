import {
  createOpfsModelResourceUrl,
  type ModelResourceDownloadProgress,
} from "@/workers/local-model/cache";

const PP_OCR_V6_TINY_DET_URL =
  "https://paddle-model-ecology.bj.bcebos.com/paddlex/official_inference_model/paddle3.0.0/PP-OCRv6_tiny_det_onnx_infer.tar";
const PP_OCR_V6_TINY_REC_URL =
  "https://paddle-model-ecology.bj.bcebos.com/paddlex/official_inference_model/paddle3.0.0/PP-OCRv6_tiny_rec_onnx_infer.tar";

export interface PreparedPaddleOcrModelAssets {
  textDetectionModelAsset: { url: string };
  textRecognitionModelAsset: { url: string };
  dispose(): void;
}

export const preparePaddleOcrV6TinyModelAssets = async (
  onProgress?: (label: string, progress: ModelResourceDownloadProgress) => void,
): Promise<PreparedPaddleOcrModelAssets> => {
  const detection = await createOpfsModelResourceUrl(PP_OCR_V6_TINY_DET_URL, (progress) => {
    onProgress?.("Downloading PP-OCRv6 detector to OPFS", progress);
  });
  let recognition: Awaited<ReturnType<typeof createOpfsModelResourceUrl>>;
  try {
    recognition = await createOpfsModelResourceUrl(PP_OCR_V6_TINY_REC_URL, (progress) => {
      onProgress?.("Downloading PP-OCRv6 recognizer to OPFS", progress);
    });
  } catch (error) {
    URL.revokeObjectURL(detection.url);
    throw error;
  }

  return {
    textDetectionModelAsset: { url: detection.url },
    textRecognitionModelAsset: { url: recognition.url },
    dispose() {
      URL.revokeObjectURL(detection.url);
      URL.revokeObjectURL(recognition.url);
    },
  };
};
