import type { InitializationSummary, OcrResult } from "@paddleocr/paddleocr-js";

import {
  preparePaddleOcrV6TinyModelAssets,
  type PreparedPaddleOcrModelAssets,
} from "./paddleOcrModelAssets";

export type OcrBenchmarkLanguage = "eng" | "eng-chi-sim";
export type OcrBenchmarkEngineId = "tesseract" | "paddle-ocr-v6";

export interface OcrBenchmarkProgress {
  engine: OcrBenchmarkEngineId;
  label: string;
  phase: "initializing" | "running";
  progress?: number;
}

export interface TimingStats {
  samples: number[];
  mean: number;
  median: number;
  min: number;
  max: number;
}

export interface SuccessfulOcrBenchmarkResult {
  status: "success";
  engine: OcrBenchmarkEngineId;
  label: string;
  initMs: number;
  reusedSession: boolean;
  timing: TimingStats;
  confidence: number | null;
  text: string;
  detectedItems: number | null;
  details: Record<string, string | number | boolean>;
}

export interface FailedOcrBenchmarkResult {
  status: "error";
  engine: OcrBenchmarkEngineId;
  label: string;
  error: string;
}

export type OcrEngineBenchmarkResult = SuccessfulOcrBenchmarkResult | FailedOcrBenchmarkResult;

export interface OcrComparisonResult {
  fileName: string;
  fileSize: number;
  repeatCount: number;
  language: OcrBenchmarkLanguage;
  completedAt: number;
  results: OcrEngineBenchmarkResult[];
}

interface RunComparisonOptions {
  language: OcrBenchmarkLanguage;
  repeatCount: number;
}

type TesseractWorker = import("tesseract.js").Worker;

interface PaddleOcrEngine {
  initialize(): Promise<InitializationSummary>;
  getInitializationSummary(): InitializationSummary | null;
  predict(input: unknown): Promise<OcrResult[]>;
  dispose(): Promise<void>;
}

interface TesseractHandle {
  worker: TesseractWorker;
  language: OcrBenchmarkLanguage;
  initMs: number;
}

interface PaddleOcrHandle {
  engine: PaddleOcrEngine;
  assets: PreparedPaddleOcrModelAssets;
  initMs: number;
  summary: InitializationSummary;
}

const TESSERACT_LABEL = "Tesseract.js 7";
const PADDLE_LABEL = "PP-OCRv6 tiny";

const now = (): number => performance.now();

const getErrorMessage = (error: unknown): string => {
  return error instanceof Error ? error.message : String(error);
};

const getTesseractLanguages = (language: OcrBenchmarkLanguage): string[] => {
  return language === "eng-chi-sim" ? ["eng", "chi_sim"] : ["eng"];
};

export const calculateTimingStats = (samples: number[]): TimingStats => {
  if (samples.length === 0) {
    throw new Error("At least one timing sample is required.");
  }

  const sorted = [...samples].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];

  return {
    samples: [...samples],
    mean: samples.reduce((total, sample) => total + sample, 0) / samples.length,
    median,
    min: sorted[0],
    max: sorted[sorted.length - 1],
  };
};

export class OcrBenchmarkSession {
  private tesseractHandle: TesseractHandle | null = null;
  private paddleHandle: PaddleOcrHandle | null = null;
  private readonly onProgress: (progress: OcrBenchmarkProgress) => void;

  constructor(onProgress: (progress: OcrBenchmarkProgress) => void) {
    this.onProgress = onProgress;
  }

  async runComparison(
    image: File,
    { language, repeatCount }: RunComparisonOptions,
  ): Promise<OcrComparisonResult> {
    const results: OcrEngineBenchmarkResult[] = [];

    try {
      results.push(await this.runTesseract(image, language, repeatCount));
    } catch (error) {
      results.push({
        status: "error",
        engine: "tesseract",
        label: TESSERACT_LABEL,
        error: getErrorMessage(error),
      });
    }

    try {
      results.push(await this.runPaddleOcr(image, repeatCount));
    } catch (error) {
      results.push({
        status: "error",
        engine: "paddle-ocr-v6",
        label: PADDLE_LABEL,
        error: getErrorMessage(error),
      });
    }

    return {
      fileName: image.name,
      fileSize: image.size,
      repeatCount,
      language,
      completedAt: Date.now(),
      results,
    };
  }

  async dispose(): Promise<void> {
    const tesseractHandle = this.tesseractHandle;
    const paddleHandle = this.paddleHandle;
    this.tesseractHandle = null;
    this.paddleHandle = null;

    await Promise.allSettled([tesseractHandle?.worker.terminate(), paddleHandle?.engine.dispose()]);
    paddleHandle?.assets.dispose();
  }

  private async ensureTesseract(language: OcrBenchmarkLanguage): Promise<{
    handle: TesseractHandle;
    reusedSession: boolean;
  }> {
    if (this.tesseractHandle?.language === language) {
      return { handle: this.tesseractHandle, reusedSession: true };
    }

    if (this.tesseractHandle) {
      await this.tesseractHandle.worker.terminate();
      this.tesseractHandle = null;
    }

    this.onProgress({
      engine: "tesseract",
      label: TESSERACT_LABEL,
      phase: "initializing",
      progress: 0,
    });

    const start = now();
    const tesseract = await import("tesseract.js");
    const worker = await tesseract.createWorker(
      getTesseractLanguages(language),
      tesseract.OEM.LSTM_ONLY,
      {
        logger: (message) => {
          this.onProgress({
            engine: "tesseract",
            label: TESSERACT_LABEL,
            phase: message.status.includes("recognizing") ? "running" : "initializing",
            progress: message.progress,
          });
        },
      },
    );

    const handle: TesseractHandle = {
      worker,
      language,
      initMs: now() - start,
    };
    this.tesseractHandle = handle;
    return { handle, reusedSession: false };
  }

  private async ensurePaddleOcr(): Promise<{
    handle: PaddleOcrHandle;
    reusedSession: boolean;
  }> {
    if (this.paddleHandle) {
      return { handle: this.paddleHandle, reusedSession: true };
    }

    this.onProgress({
      engine: "paddle-ocr-v6",
      label: PADDLE_LABEL,
      phase: "initializing",
      progress: 0,
    });

    const start = now();
    const { PaddleOCR } = await import("@paddleocr/paddleocr-js");
    const assets = await preparePaddleOcrV6TinyModelAssets((label, progress) => {
      this.onProgress({
        engine: "paddle-ocr-v6",
        label,
        phase: "initializing",
        progress: progress.total ? progress.loaded / progress.total : undefined,
      });
    });
    let engine: PaddleOcrEngine;
    let summary: InitializationSummary;
    try {
      engine = (await PaddleOCR.create({
        initialize: false,
        worker: true,
        textDetectionModelName: "PP-OCRv6_tiny_det",
        textRecognitionModelName: "PP-OCRv6_tiny_rec",
        textDetectionModelAsset: assets.textDetectionModelAsset,
        textRecognitionModelAsset: assets.textRecognitionModelAsset,
        textDetectionBatchSize: 1,
        textRecognitionBatchSize: 6,
        ortOptions: {
          backend: "auto",
        },
      })) as PaddleOcrEngine;
      summary = await engine.initialize();
    } catch (error) {
      assets.dispose();
      throw error;
    }

    const handle: PaddleOcrHandle = {
      engine,
      assets,
      initMs: now() - start,
      summary,
    };
    this.paddleHandle = handle;
    return { handle, reusedSession: false };
  }

  private async runTesseract(
    image: File,
    language: OcrBenchmarkLanguage,
    repeatCount: number,
  ): Promise<SuccessfulOcrBenchmarkResult> {
    const { handle, reusedSession } = await this.ensureTesseract(language);
    const samples: number[] = [];
    let text = "";
    let confidence: number | null = null;

    for (let index = 0; index < repeatCount; index += 1) {
      this.onProgress({
        engine: "tesseract",
        label: `${TESSERACT_LABEL} · run ${index + 1}/${repeatCount}`,
        phase: "running",
        progress: index / repeatCount,
      });
      const start = now();
      const result = await handle.worker.recognize(image);
      samples.push(now() - start);
      text = result.data.text.trim();
      confidence = Number.isFinite(result.data.confidence) ? result.data.confidence : null;
    }

    return {
      status: "success",
      engine: "tesseract",
      label: TESSERACT_LABEL,
      initMs: handle.initMs,
      reusedSession,
      timing: calculateTimingStats(samples),
      confidence,
      text,
      detectedItems: null,
      details: {
        runtime: "WASM worker",
        languages: getTesseractLanguages(language).join(" + "),
      },
    };
  }

  private async runPaddleOcr(
    image: File,
    repeatCount: number,
  ): Promise<SuccessfulOcrBenchmarkResult> {
    const { handle, reusedSession } = await this.ensurePaddleOcr();
    const samples: number[] = [];
    let lastResult: OcrResult | null = null;

    for (let index = 0; index < repeatCount; index += 1) {
      this.onProgress({
        engine: "paddle-ocr-v6",
        label: `${PADDLE_LABEL} · run ${index + 1}/${repeatCount}`,
        phase: "running",
        progress: index / repeatCount,
      });
      const start = now();
      const [result] = await handle.engine.predict(image);
      samples.push(now() - start);
      if (!result) {
        throw new Error("PaddleOCR returned no result for the selected image.");
      }
      lastResult = result;
    }

    if (!lastResult) {
      throw new Error("PaddleOCR did not complete a benchmark run.");
    }

    const confidence =
      lastResult.items.length > 0
        ? (lastResult.items.reduce((total, item) => total + item.score, 0) /
            lastResult.items.length) *
          100
        : null;

    return {
      status: "success",
      engine: "paddle-ocr-v6",
      label: PADDLE_LABEL,
      initMs: handle.initMs,
      reusedSession,
      timing: calculateTimingStats(samples),
      confidence,
      text: lastResult.items
        .map((item) => item.text)
        .join("\n")
        .trim(),
      detectedItems: lastResult.items.length,
      details: {
        detector: handle.summary.detProvider,
        recognizer: handle.summary.recProvider,
        "detector ms": lastResult.metrics.detMs,
        "recognizer ms": lastResult.metrics.recMs,
        "pipeline ms": lastResult.metrics.totalMs,
        WebGPU: handle.summary.webgpuAvailable,
      },
    };
  }
}
