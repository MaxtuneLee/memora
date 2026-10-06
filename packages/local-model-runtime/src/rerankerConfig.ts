export const BEIR_RERANKER = {
  modelId: "tss-deposium/bge-reranker-v2-m3-onnx-int8",
  revision: "fe43c1d36fd1c0f90f9296c053f11a950d4f833a",
  modelFile: "onnx/model_quantized.onnx",
  expectedModelSha256: "dd1b7800bdfde4afd4aab79ea75752250e11fa043ddc397cbf8e8a1c9a809b44",
  dtype: "q8",
  device: "wasm",
  maxLength: 512,
  truncation: "longest_first",
  scoring: "raw single-label cross-encoder logit; descending; stable ties",
} as const;

export const BEIR_RERANKER_BASE = {
  modelId: "Xenova/bge-reranker-base",
  revision: "280bcc27a84e0b898c251e06fddb25171bd9b101",
  modelFile: "onnx/model.onnx",
  expectedModelSha256: "15b9a8c3da82eddf263df571281166e00e9308fe19d077084b642ebfcaf06d2b",
  dtype: "fp32",
  device: "webgpu",
  maxLength: 512,
  truncation: "longest_first",
  scoring: "raw single-label cross-encoder logit; descending; stable ties",
  cpuFallbackPolicy:
    "ONNX Runtime default; WebGPU requested, shape/unsupported nodes may run on CPU",
} as const;

export type BeirRerankerProfile = "m3" | "base";

export function getBeirRerankerProfile(profile: BeirRerankerProfile) {
  if (profile === "base") return BEIR_RERANKER_BASE;
  if (profile === "m3") return BEIR_RERANKER;
  throw new Error("Unknown BEIR reranker model profile.");
}
