import {
  PreTrainedTokenizer,
  Tensor,
  VisionEncoderDecoderModel,
  cat,
  env,
  type ProgressInfo,
} from "@huggingface/transformers";
import type { LocalModelExecutionBackend, LocalModelTask } from "../types";

import type { SharedModelTaskContext } from "../sharedWorker";
import { configureTransformersCache } from "../cache";
import { reportWorkerRuntimeLoaded } from "../debug";

const MODEL_ID = "alephpi/FormulaNet";
const INPUT_SIZE = 384;
const FORMULA_MEAN = 0.7931;
const FORMULA_STD = 0.1738;

env.allowLocalModels = false;
if (env.backends.onnx.wasm) env.backends.onnx.wasm.proxy = true;
configureTransformersCache(env);

let model: VisionEncoderDecoderModel | null = null;
let tokenizer: PreTrainedTokenizer | null = null;
let backend: LocalModelExecutionBackend | null = null;
let initialization: Promise<void> | null = null;

const loadModel = async (
  device: LocalModelExecutionBackend,
  context: SharedModelTaskContext,
): Promise<VisionEncoderDecoderModel> => {
  return (await VisionEncoderDecoderModel.from_pretrained(MODEL_ID, {
    device,
    dtype: "fp32",
    progress_callback: (info: ProgressInfo) => {
      const record = info as unknown as Record<string, unknown>;
      context.emit({
        type: "model-progress",
        file:
          record.status === "progress" ? "Downloading Texo FormulaNet" : "Loading Texo FormulaNet",
        progress: typeof record.progress === "number" ? record.progress / 100 : undefined,
      });
    },
  })) as VisionEncoderDecoderModel;
};

const ensureInitialized = async (context: SharedModelTaskContext): Promise<void> => {
  if (model && tokenizer && backend) {
    context.emit({ type: "backend", backend });
    return;
  }
  if (!initialization) {
    initialization = (async () => {
      tokenizer = await PreTrainedTokenizer.from_pretrained(MODEL_ID, {
        progress_callback: (info: ProgressInfo) => {
          const record = info as unknown as Record<string, unknown>;
          context.emit({
            type: "model-progress",
            file: "Loading Texo FormulaNet tokenizer",
            progress: typeof record.progress === "number" ? record.progress / 100 : undefined,
          });
        },
      });
      try {
        model = await loadModel("webgpu", context);
        backend = "webgpu";
      } catch {
        context.emit({
          type: "model-progress",
          file: "WebGPU unavailable, loading Texo FormulaNet with WASM",
        });
        model = await loadModel("wasm", context);
        backend = "wasm";
      }
    })().catch((error) => {
      model = null;
      tokenizer = null;
      backend = null;
      initialization = null;
      throw error;
    });
  }
  await initialization;
  if (backend) {
    context.emit({ type: "backend", backend });
    reportWorkerRuntimeLoaded({
      family: "formula",
      modelId: MODEL_ID,
      adapter: "vision-encoder-decoder",
      runtime: "transformers-js",
    });
  }
};

const getGrayscale = (data: Uint8ClampedArray): Uint8Array => {
  const grayscale = new Uint8Array(data.length / 4);
  for (let sourceIndex = 0, outputIndex = 0; sourceIndex < data.length; sourceIndex += 4) {
    const alpha = data[sourceIndex + 3] / 255;
    const red = data[sourceIndex] * alpha + 255 * (1 - alpha);
    const green = data[sourceIndex + 1] * alpha + 255 * (1 - alpha);
    const blue = data[sourceIndex + 2] * alpha + 255 * (1 - alpha);
    grayscale[outputIndex] = Math.round(red * 0.299 + green * 0.587 + blue * 0.114);
    outputIndex += 1;
  }
  return grayscale;
};

const findInkBounds = (
  grayscale: Uint8Array,
  width: number,
  height: number,
): { x: number; y: number; width: number; height: number; invert: boolean } => {
  let darkPixels = 0;
  for (const value of grayscale) if (value < 200) darkPixels += 1;
  const invert = darkPixels >= grayscale.length - darkPixels;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const raw = grayscale[y * width + x];
      const value = invert ? 255 - raw : raw;
      if (value < 200) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  if (maxX < minX || maxY < minY) return { x: 0, y: 0, width, height, invert };
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1, invert };
};

const preprocess = async (blob: Blob): Promise<Tensor> => {
  const bitmap = await createImageBitmap(blob);
  const source = new OffscreenCanvas(bitmap.width, bitmap.height);
  const sourceContext = source.getContext("2d", { willReadFrequently: true });
  if (!sourceContext) {
    bitmap.close();
    throw new Error("OffscreenCanvas 2D is unavailable in the formula worker.");
  }
  sourceContext.fillStyle = "#ffffff";
  sourceContext.fillRect(0, 0, source.width, source.height);
  sourceContext.drawImage(bitmap, 0, 0);
  bitmap.close();
  const grayscale = getGrayscale(
    sourceContext.getImageData(0, 0, source.width, source.height).data,
  );
  const bounds = findInkBounds(grayscale, source.width, source.height);

  const output = new OffscreenCanvas(INPUT_SIZE, INPUT_SIZE);
  const outputContext = output.getContext("2d", { willReadFrequently: true });
  if (!outputContext) throw new Error("OffscreenCanvas 2D is unavailable in the formula worker.");
  outputContext.fillStyle = bounds.invert ? "#ffffff" : "#000000";
  outputContext.fillRect(0, 0, INPUT_SIZE, INPUT_SIZE);
  const scale = Math.min(INPUT_SIZE / bounds.width, INPUT_SIZE / bounds.height);
  const targetWidth = Math.max(1, Math.round(bounds.width * scale));
  const targetHeight = Math.max(1, Math.round(bounds.height * scale));
  const x = Math.floor((INPUT_SIZE - targetWidth) / 2);
  const y = Math.floor((INPUT_SIZE - targetHeight) / 2);
  outputContext.filter = bounds.invert ? "invert(1) grayscale(1)" : "grayscale(1)";
  outputContext.drawImage(
    source,
    bounds.x,
    bounds.y,
    bounds.width,
    bounds.height,
    x,
    y,
    targetWidth,
    targetHeight,
  );
  outputContext.filter = "none";

  const pixels = outputContext.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE).data;
  const normalized = new Float32Array(INPUT_SIZE * INPUT_SIZE);
  for (let index = 0; index < normalized.length; index += 1) {
    normalized[index] = (pixels[index * 4] / 255 - FORMULA_MEAN) / FORMULA_STD;
  }
  const singleChannel = new Tensor("float32", normalized, [1, 1, INPUT_SIZE, INPUT_SIZE]);
  return cat([singleChannel, singleChannel, singleChannel], 1);
};

export const runFormulaTask = async (
  task: Extract<LocalModelTask, { kind: "formula.preload" | "formula.recognize" }>,
  context: SharedModelTaskContext,
): Promise<void> => {
  context.emit({ type: "status", status: "loading-model" });
  await ensureInitialized(context);
  if (context.isCanceled() || task.kind === "formula.preload") return;
  if (!model || !tokenizer) throw new Error("Texo FormulaNet is not initialized.");

  context.emit({ type: "status", status: "running" });
  const inputs = await preprocess(task.input.blob);
  const output = await model.generate({ inputs });
  if (context.isCanceled()) return;
  context.emit({
    type: "formula-complete",
    latex: tokenizer.batch_decode(output as Tensor, { skip_special_tokens: true })[0]?.trim() ?? "",
  });
};
