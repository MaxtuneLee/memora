import type { InitializationSummary, OcrResult, OcrResultItem } from "@paddleocr/paddleocr-js";
import type { AiRuntime } from "@embedpdf/ai/web";
import type { LayoutDetection } from "@embedpdf/ai";

import { texoFormulaClient } from "@/lib/local-model/texoFormulaClient";
import { createOpfsModelResourceUrl } from "@/workers/local-model/cache";

import {
  preparePaddleOcrV6TinyModelAssets,
  type PreparedPaddleOcrModelAssets,
} from "./paddleOcrModelAssets";

export type ImageDocumentBlockKind =
  | "doc_title"
  | "paragraph_title"
  | "text"
  | "abstract"
  | "display_formula"
  | "inline_formula"
  | "formula_number"
  | "table"
  | "image"
  | "chart"
  | "ignored"
  | "unknown";

export interface PixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RecognizedTextLine {
  text: string;
  score: number;
  rect: PixelRect;
}

export interface ImageDocumentBlock {
  id: string;
  classId: number;
  label: string;
  kind: ImageDocumentBlockKind;
  score: number;
  rect: PixelRect;
  readingOrder: number;
  text?: string;
  latex?: string;
  formulaNumber?: string;
  recognition: "ocr" | "texo" | "placeholder" | "none";
  lines?: RecognizedTextLine[];
}

export interface ImageDocumentPipelineTiming {
  decodeMs: number;
  layoutMs: number;
  ocrMs: number;
  formulaMs: number;
  composeMs: number;
  totalMs: number;
}

export interface ImageDocumentPipelineResult {
  fileName: string;
  fileSize: number;
  image: { width: number; height: number };
  blocks: ImageDocumentBlock[];
  markdown: string;
  timings: ImageDocumentPipelineTiming;
  backend: { layout: string; ocr: string; formula: string };
  warnings: string[];
  completedAt: number;
}

export type ImagePipelineStage = "decode" | "layout" | "ocr" | "formula" | "compose";

export interface ImageDocumentPipelineProgress {
  stage: ImagePipelineStage;
  label: string;
  progress?: number;
}

export interface ImageDocumentPipelineOptions {
  /** Layout model confidence required to retain a detected document region. */
  confidenceThreshold?: number;
  /** PP-OCRv6 recognition confidence required to retain a text line. */
  ocrConfidenceThreshold?: number;
  /**
   * Layout confidence required before sending a detected formula region to Texo.
   * Texo currently returns LaTex text without an independent confidence score.
   */
  formulaConfidenceThreshold?: number;
}

interface PaddleOcrEngine {
  initialize(): Promise<InitializationSummary>;
  predict(input: unknown): Promise<OcrResult[]>;
  dispose(): Promise<void>;
}

const TEXT_KINDS = new Set<ImageDocumentBlockKind>([
  "doc_title",
  "paragraph_title",
  "text",
  "abstract",
]);

type LayoutDetectionRecord = Pick<
  LayoutDetection,
  "id" | "classId" | "label" | "score" | "bbox" | "readingOrder"
>;

const PP_DOC_LAYOUT_V3_URL =
  "https://huggingface.co/datasets/embedpdf/embed-pdf-viewer/resolve/main/models/PP-DocLayoutV3-ONNX/model_fp16.onnx";

const IGNORED_LABELS = new Set([
  "header",
  "footer",
  "footnote",
  "number",
  "reference",
  "reference_content",
  "seal",
  "vision_footnote",
]);

export const DEFAULT_LAYOUT_CONFIDENCE_THRESHOLD = 0.4;
export const DEFAULT_OCR_CONFIDENCE_THRESHOLD = 0.4;
export const DEFAULT_FORMULA_CONFIDENCE_THRESHOLD = 0.4;

const now = (): number => performance.now();

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    return String(error.message);
  }
  return String(error);
};

const stripMathDelimiters = (value: string): string => {
  return value
    .replace(/^\s*\$\$?\s*:?\s*/, "")
    .replace(/\s*\$\$?\s*$/, "")
    .trim();
};

const removeRepeatedTexoPadding = (value: string): string => {
  return value
    .replace(/(?:\s*\\~\s*){3,}/g, " ")
    .replace(/(?:\s*\\~\s*)+$/g, " ")
    .trim();
};

export const postprocessTexoLatex = (rawLatex: string): string => {
  return removeRepeatedTexoPadding(stripMathDelimiters(rawLatex))
    .replace(/\\_\s*\{\s*([^{}]*?)\s*\}/g, "_{$1}")
    .replace(/\\_\s*([A-Za-z0-9])/g, "_$1")
    .replace(/\s+([_^])/g, "$1")
    .replace(/\\([A-Za-z]+)\s+\{/g, "\\$1{")
    .replace(/\{\s+/g, "{")
    .replace(/\s+\}/g, "}")
    .replace(/[\t\n\r ]+/g, " ")
    .trim();
};

export const normalizeLayoutKind = (classId: number, label: string): ImageDocumentBlockKind => {
  if (classId === 5) return "display_formula";
  if (classId === 15) return "inline_formula";
  if (classId === 11) return "formula_number";

  const normalized = label.toLowerCase().replaceAll("-", "_").replaceAll(" ", "_");
  if (normalized === "formula") return "display_formula";
  if (normalized === "doc_title") return "doc_title";
  if (normalized === "paragraph_title") return "paragraph_title";
  if (normalized === "text") return "text";
  if (normalized === "abstract") return "abstract";
  if (normalized === "table") return "table";
  if (normalized === "image") return "image";
  if (normalized === "chart") return "chart";
  if (IGNORED_LABELS.has(normalized)) return "ignored";
  return "unknown";
};

const bboxToRect = ([x1, y1, x2, y2]: [number, number, number, number]): PixelRect => ({
  x: Math.max(0, x1),
  y: Math.max(0, y1),
  width: Math.max(0, x2 - x1),
  height: Math.max(0, y2 - y1),
});

export const ocrItemToLine = (item: OcrResultItem): RecognizedTextLine => {
  const xs = item.poly.map((point) => point[0]);
  const ys = item.poly.map((point) => point[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return {
    text: item.text.trim(),
    score: item.score,
    rect: {
      x,
      y,
      width: Math.max(...xs) - x,
      height: Math.max(...ys) - y,
    },
  };
};

const rectArea = (rect: PixelRect): number => rect.width * rect.height;

const intersectionArea = (left: PixelRect, right: PixelRect): number => {
  const width = Math.max(
    0,
    Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x),
  );
  const height = Math.max(
    0,
    Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y),
  );
  return width * height;
};

const containsCenter = (container: PixelRect, candidate: PixelRect): boolean => {
  const centerX = candidate.x + candidate.width / 2;
  const centerY = candidate.y + candidate.height / 2;
  return (
    centerX >= container.x &&
    centerX <= container.x + container.width &&
    centerY >= container.y &&
    centerY <= container.y + container.height
  );
};

const intersectionOverMinimumArea = (left: PixelRect, right: PixelRect): number => {
  return intersectionArea(left, right) / Math.max(1, Math.min(rectArea(left), rectArea(right)));
};

const intersectionOverUnion = (left: PixelRect, right: PixelRect): number => {
  const intersection = intersectionArea(left, right);
  return intersection / Math.max(1, rectArea(left) + rectArea(right) - intersection);
};

const isSameDetectionGroup = (
  left: ImageDocumentBlockKind,
  right: ImageDocumentBlockKind,
): boolean => {
  if (left === right) return true;
  if (TEXT_KINDS.has(left) && TEXT_KINDS.has(right)) return true;
  const leftIsFormula = left === "display_formula" || left === "inline_formula";
  const rightIsFormula = right === "display_formula" || right === "inline_formula";
  return leftIsFormula && rightIsFormula;
};

const detectionSpecificity = (kind: ImageDocumentBlockKind): number => {
  if (kind === "doc_title") return 4;
  if (kind === "paragraph_title") return 3;
  if (kind === "abstract" || kind === "formula_number") return 2;
  return 1;
};

export const deduplicateLayoutDetections = (
  detections: LayoutDetectionRecord[],
  confidenceThreshold = DEFAULT_LAYOUT_CONFIDENCE_THRESHOLD,
): LayoutDetectionRecord[] => {
  const kept: LayoutDetectionRecord[] = [];
  const candidates = detections
    .filter((detection) => detection.score >= confidenceThreshold)
    .sort((left, right) => right.score - left.score);

  for (const candidate of candidates) {
    const candidateRect = bboxToRect(candidate.bbox);
    const candidateKind = normalizeLayoutKind(candidate.classId, candidate.label);
    const duplicateIndex = kept.findIndex((current) => {
      const currentRect = bboxToRect(current.bbox);
      const areaRatio =
        Math.min(rectArea(candidateRect), rectArea(currentRect)) /
        Math.max(1, Math.max(rectArea(candidateRect), rectArea(currentRect)));
      return (
        isSameDetectionGroup(candidateKind, normalizeLayoutKind(current.classId, current.label)) &&
        areaRatio >= 0.65 &&
        (intersectionOverUnion(candidateRect, currentRect) >= 0.7 ||
          intersectionOverMinimumArea(candidateRect, currentRect) >= 0.85)
      );
    });

    if (duplicateIndex < 0) {
      kept.push(candidate);
      continue;
    }

    const current = kept[duplicateIndex];
    const currentKind = normalizeLayoutKind(current.classId, current.label);
    if (
      detectionSpecificity(candidateKind) > detectionSpecificity(currentKind) &&
      candidate.score >= current.score - 0.12
    ) {
      kept[duplicateIndex] = candidate;
    }
  }

  return kept.sort(
    (left, right) =>
      left.readingOrder - right.readingOrder ||
      left.bbox[1] - right.bbox[1] ||
      left.bbox[0] - right.bbox[0],
  );
};

const joinTextLines = (lines: RecognizedTextLine[]): string => {
  return lines
    .map((line) => line.text)
    .filter(Boolean)
    .join("\n")
    .trim();
};

const assignOcrLines = (
  blocks: ImageDocumentBlock[],
  lines: RecognizedTextLine[],
): Map<string, RecognizedTextLine[]> => {
  const assignments = new Map<string, RecognizedTextLine[]>();
  const ocrBlocks = blocks.filter(
    (block) => TEXT_KINDS.has(block.kind) || block.kind === "formula_number",
  );

  for (const line of lines) {
    const lineArea = Math.max(1, rectArea(line.rect));
    const match = ocrBlocks
      .map((block) => {
        const coverage = intersectionArea(block.rect, line.rect) / lineArea;
        if (!containsCenter(block.rect, line.rect) && coverage < 0.45) return null;
        const compactness = Math.min(1, lineArea / Math.max(1, rectArea(block.rect)));
        const kindBonus = block.kind === "formula_number" ? 0.35 : 0;
        return {
          block,
          score:
            coverage +
            (containsCenter(block.rect, line.rect) ? 0.25 : 0) +
            compactness * 0.15 +
            block.score * 0.05 +
            kindBonus,
        };
      })
      .filter((candidate): candidate is { block: ImageDocumentBlock; score: number } =>
        Boolean(candidate),
      )
      .sort((left, right) => right.score - left.score)[0];
    if (!match) continue;
    const current = assignments.get(match.block.id) ?? [];
    current.push(line);
    assignments.set(match.block.id, current);
  }

  for (const assignedLines of assignments.values()) {
    assignedLines.sort((left, right) => left.rect.y - right.rect.y || left.rect.x - right.rect.x);
  }
  return assignments;
};

const isOnSameLine = (left: PixelRect, right: PixelRect): boolean => {
  const overlap = Math.max(
    0,
    Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y),
  );
  return overlap / Math.max(1, Math.min(left.height, right.height)) >= 0.35;
};

const attachFormulaNumbers = (blocks: ImageDocumentBlock[]): void => {
  const numbers = blocks.filter((block) => block.kind === "formula_number" && block.text);
  for (const number of numbers) {
    const target = blocks
      .filter((block) => block.kind === "display_formula")
      .filter((block) => isOnSameLine(block.rect, number.rect))
      .sort((left, right) => {
        const leftDistance = Math.abs(left.rect.x + left.rect.width - number.rect.x);
        const rightDistance = Math.abs(right.rect.x + right.rect.width - number.rect.x);
        return leftDistance - rightDistance;
      })[0];
    if (target) target.formulaNumber = number.text?.replace(/^\(|\)$/g, "").trim();
  }
};

interface RecognizedLineGroup {
  rect: PixelRect;
  lines: RecognizedTextLine[];
  formulas: ImageDocumentBlock[];
}

const unionRects = (rects: PixelRect[]): PixelRect => {
  const x = Math.min(...rects.map((rect) => rect.x));
  const y = Math.min(...rects.map((rect) => rect.y));
  const right = Math.max(...rects.map((rect) => rect.x + rect.width));
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height));
  return { x, y, width: right - x, height: bottom - y };
};

const groupRecognizedLines = (lines: RecognizedTextLine[]): RecognizedLineGroup[] => {
  const groups: RecognizedLineGroup[] = [];
  for (const line of [...lines].sort(
    (left, right) => left.rect.y - right.rect.y || left.rect.x - right.rect.x,
  )) {
    const group = groups.find((candidate) => isOnSameLine(candidate.rect, line.rect));
    if (group) {
      group.lines.push(line);
      group.rect = unionRects(group.lines.map((item) => item.rect));
    } else {
      groups.push({ rect: { ...line.rect }, lines: [line], formulas: [] });
    }
  }
  return groups.sort((left, right) => left.rect.y - right.rect.y || left.rect.x - right.rect.x);
};

const mergeInlineFormulas = (blocks: ImageDocumentBlock[]): Set<string> => {
  const merged = new Set<string>();
  const textBlocks = blocks.filter((block) => TEXT_KINDS.has(block.kind));
  const groupsByBlock = new Map(
    textBlocks.map((block) => [block.id, groupRecognizedLines(block.lines ?? [])]),
  );
  for (const formula of blocks.filter((block) => block.kind === "inline_formula" && block.latex)) {
    const host = textBlocks
      .filter(
        (block) =>
          containsCenter(block.rect, formula.rect) ||
          intersectionArea(block.rect, formula.rect) > 0,
      )
      .sort(
        (left, right) =>
          intersectionOverMinimumArea(right.rect, formula.rect) -
            intersectionOverMinimumArea(left.rect, formula.rect) ||
          rectArea(left.rect) - rectArea(right.rect),
      )[0];
    if (!host) continue;
    const groups = groupsByBlock.get(host.id) ?? [];
    const lineGroup = groups
      .filter((group) => isOnSameLine(group.rect, formula.rect))
      .sort(
        (left, right) =>
          intersectionOverMinimumArea(right.rect, formula.rect) -
          intersectionOverMinimumArea(left.rect, formula.rect),
      )[0];
    if (!lineGroup) continue;
    lineGroup.formulas.push(formula);
    merged.add(formula.id);
  }

  for (const block of textBlocks) {
    const groups = groupsByBlock.get(block.id) ?? [];
    if (groups.length === 0) continue;
    block.text = groups
      .map((group) =>
        [
          ...group.lines.map((line) => ({ x: line.rect.x, value: line.text })),
          ...group.formulas.map((formula) => ({
            x: formula.rect.x,
            value: `$${formula.latex}$`,
          })),
        ]
          .sort((left, right) => left.x - right.x)
          .map((token) => token.value)
          .join(" ")
          .trim(),
      )
      .filter(Boolean)
      .join("\n");
  }
  return merged;
};

export interface ComposeImageDocumentBlocksInput {
  detections: LayoutDetectionRecord[];
  ocrItems: OcrResultItem[];
  formulaLatex?: ReadonlyMap<number, string>;
  confidenceThreshold?: number;
}

export const composeImageDocumentBlocks = ({
  detections,
  ocrItems,
  formulaLatex = new Map(),
  confidenceThreshold = DEFAULT_LAYOUT_CONFIDENCE_THRESHOLD,
}: ComposeImageDocumentBlocksInput): ImageDocumentBlock[] => {
  const lines = ocrItems.map(ocrItemToLine).filter((line) => line.text);
  const blocks = deduplicateLayoutDetections(detections, confidenceThreshold)
    .map((detection): ImageDocumentBlock => {
      const kind = normalizeLayoutKind(detection.classId, detection.label);
      const rect = bboxToRect(detection.bbox);
      const latex = formulaLatex.get(detection.id)?.trim();
      const isFormula = kind === "display_formula" || kind === "inline_formula";
      const isPlaceholder = kind === "table" || kind === "image" || kind === "chart";
      const usesOcr = TEXT_KINDS.has(kind) || kind === "formula_number";
      return {
        id: `layout-${detection.id}`,
        classId: detection.classId,
        label: detection.label,
        kind,
        score: detection.score,
        rect,
        readingOrder: detection.readingOrder,
        text: usesOcr ? "" : undefined,
        latex: isFormula ? latex : undefined,
        recognition: isFormula
          ? latex
            ? "texo"
            : "none"
          : isPlaceholder
            ? "placeholder"
            : usesOcr
              ? "ocr"
              : "none",
        lines: usesOcr ? [] : undefined,
      };
    })
    .sort((left, right) => left.readingOrder - right.readingOrder || left.rect.y - right.rect.y);

  const lineAssignments = assignOcrLines(blocks, lines);
  for (const block of blocks) {
    if (!block.lines) continue;
    block.lines = lineAssignments.get(block.id) ?? [];
    block.text = joinTextLines(block.lines);
  }

  attachFormulaNumbers(blocks);
  return blocks;
};

const escapeHtmlComment = (value: string): string => value.replaceAll("--", "—");

export const serializeImageDocumentMarkdown = (blocks: ImageDocumentBlock[]): string => {
  const workingBlocks = blocks.map((block) => ({
    ...block,
    lines: block.lines?.map((line) => ({ ...line, rect: { ...line.rect } })),
  }));
  const mergedInlineIds = mergeInlineFormulas(workingBlocks);
  const sections: string[] = [];

  for (const block of workingBlocks) {
    if (
      mergedInlineIds.has(block.id) ||
      block.kind === "formula_number" ||
      block.kind === "ignored"
    ) {
      continue;
    }
    if (block.kind === "doc_title" && block.text) sections.push(`# ${block.text}`);
    else if (block.kind === "paragraph_title" && block.text) sections.push(`## ${block.text}`);
    else if ((block.kind === "text" || block.kind === "abstract") && block.text) {
      sections.push(block.text);
    } else if (block.kind === "display_formula" && block.latex) {
      const latex = block.formulaNumber
        ? `${block.latex} \\tag{${block.formulaNumber}}`
        : block.latex;
      sections.push(`$$\n${latex}\n$$`);
    } else if (block.kind === "inline_formula" && block.latex) {
      sections.push(`$${block.latex}$`);
    } else if (block.kind === "table" || block.kind === "image" || block.kind === "chart") {
      sections.push(
        `<!-- ${escapeHtmlComment(block.kind)} region · confidence ${(block.score * 100).toFixed(1)}% -->`,
      );
    }
  }

  return sections.join("\n\n").trim();
};

const fileToImageData = async (
  file: File,
): Promise<{ imageData: ImageData; width: number; height: number }> => {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    bitmap.close();
    throw new Error("Canvas 2D is unavailable in this browser.");
  }
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  return {
    imageData: context.getImageData(0, 0, canvas.width, canvas.height),
    width: canvas.width,
    height: canvas.height,
  };
};

const createFormulaMaskedOcrInput = async (
  imageData: ImageData,
  formulas: LayoutDetectionRecord[],
): Promise<Blob> => {
  const canvas = new OffscreenCanvas(imageData.width, imageData.height);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("OffscreenCanvas 2D is unavailable.");
  context.putImageData(imageData, 0, 0);
  context.fillStyle = "#ffffff";
  for (const formula of formulas) {
    const rect = bboxToRect(formula.bbox);
    const padding = Math.max(1, Math.round(Math.min(rect.width, rect.height) * 0.02));
    context.fillRect(
      Math.max(0, Math.floor(rect.x - padding)),
      Math.max(0, Math.floor(rect.y - padding)),
      Math.min(imageData.width - rect.x, Math.ceil(rect.width + padding * 2)),
      Math.min(imageData.height - rect.y, Math.ceil(rect.height + padding * 2)),
    );
  }
  return canvas.convertToBlob({ type: "image/png" });
};

const cropImageDataToBlob = async (imageData: ImageData, rect: PixelRect): Promise<Blob> => {
  const source = new OffscreenCanvas(imageData.width, imageData.height);
  const sourceContext = source.getContext("2d");
  if (!sourceContext) throw new Error("OffscreenCanvas 2D is unavailable.");
  sourceContext.putImageData(imageData, 0, 0);

  const padding = Math.max(4, Math.round(rect.height * 0.12));
  const x = Math.max(0, Math.floor(rect.x - padding));
  const y = Math.max(0, Math.floor(rect.y - padding));
  const width = Math.max(1, Math.min(imageData.width - x, Math.ceil(rect.width + padding * 2)));
  const height = Math.max(1, Math.min(imageData.height - y, Math.ceil(rect.height + padding * 2)));
  const output = new OffscreenCanvas(width, height);
  const outputContext = output.getContext("2d");
  if (!outputContext) throw new Error("OffscreenCanvas 2D is unavailable.");
  outputContext.fillStyle = "#ffffff";
  outputContext.fillRect(0, 0, width, height);
  outputContext.drawImage(source, x, y, width, height, 0, 0, width, height);
  return output.convertToBlob({ type: "image/png" });
};

export class ImageDocumentPipelineSession {
  private layoutRuntime: AiRuntime | null = null;
  private layoutModelUrl: string | null = null;
  private paddle: PaddleOcrEngine | null = null;
  private paddleAssets: PreparedPaddleOcrModelAssets | null = null;
  private paddleSummary: InitializationSummary | null = null;
  private readonly onProgress: (progress: ImageDocumentPipelineProgress) => void;

  constructor(onProgress: (progress: ImageDocumentPipelineProgress) => void) {
    this.onProgress = onProgress;
  }

  async run(
    file: File,
    {
      confidenceThreshold = DEFAULT_LAYOUT_CONFIDENCE_THRESHOLD,
      ocrConfidenceThreshold = DEFAULT_OCR_CONFIDENCE_THRESHOLD,
      formulaConfidenceThreshold = DEFAULT_FORMULA_CONFIDENCE_THRESHOLD,
    }: ImageDocumentPipelineOptions = {},
  ): Promise<ImageDocumentPipelineResult> {
    const totalStart = now();
    const timings: ImageDocumentPipelineTiming = {
      decodeMs: 0,
      layoutMs: 0,
      ocrMs: 0,
      formulaMs: 0,
      composeMs: 0,
      totalMs: 0,
    };
    const warnings: string[] = [];

    this.onProgress({ stage: "decode", label: "Decoding image" });
    let stageStart = now();
    const decoded = await fileToImageData(file);
    timings.decodeMs = now() - stageStart;

    this.onProgress({ stage: "layout", label: "Loading PP-DocLayoutV3" });
    stageStart = now();
    const runtime = await this.ensureLayoutRuntime();
    const { LayoutDetectionPipeline } = await import("@embedpdf/ai");
    const task = runtime.run(new LayoutDetectionPipeline(), {
      imageData: decoded.imageData,
      sourceWidth: decoded.width,
      sourceHeight: decoded.height,
    });
    task.onProgress((progress) => {
      const amount =
        progress.stage === "downloading-model" && progress.total > 0
          ? progress.loaded / progress.total
          : undefined;
      const label =
        progress.stage === "downloading-model"
          ? "Downloading PP-DocLayoutV3"
          : progress.stage === "creating-session"
            ? "Creating layout session"
            : progress.stage === "inference"
              ? "Detecting regions"
              : "Preparing layout input";
      this.onProgress({ stage: "layout", label, progress: amount });
    });
    const detections = deduplicateLayoutDetections(await task.toPromise(), confidenceThreshold);
    timings.layoutMs = now() - stageStart;

    const formulas = detections.filter((detection) => {
      const kind = normalizeLayoutKind(detection.classId, detection.label);
      return (
        (kind === "display_formula" || kind === "inline_formula") &&
        detection.score >= formulaConfidenceThreshold
      );
    });

    this.onProgress({ stage: "ocr", label: "Loading PP-OCRv6" });
    stageStart = now();
    const paddle = await this.ensurePaddle();
    this.onProgress({ stage: "ocr", label: "Masking formula regions before text OCR" });
    const ocrInput = await createFormulaMaskedOcrInput(decoded.imageData, formulas);
    this.onProgress({ stage: "ocr", label: "Recognizing text outside formula regions" });
    const [ocrResult] = await paddle.predict(ocrInput);
    if (!ocrResult) throw new Error("PP-OCRv6 returned no result for this image.");
    const retainedOcrItems = ocrResult.items.filter((item) => item.score >= ocrConfidenceThreshold);
    const rejectedOcrCount = ocrResult.items.length - retainedOcrItems.length;
    if (rejectedOcrCount > 0) {
      warnings.push(
        `Ignored ${rejectedOcrCount} OCR line${rejectedOcrCount === 1 ? "" : "s"} below the ${(ocrConfidenceThreshold * 100).toFixed(0)}% confidence threshold.`,
      );
    }
    timings.ocrMs = now() - stageStart;
    const formulaLatex = new Map<number, string>();
    stageStart = now();
    for (let index = 0; index < formulas.length; index += 1) {
      const formula = formulas[index];
      this.onProgress({
        stage: "formula",
        label: `Recognizing formula ${index + 1}/${formulas.length}`,
        progress: formulas.length === 0 ? 1 : index / formulas.length,
      });
      try {
        const blob = await cropImageDataToBlob(decoded.imageData, bboxToRect(formula.bbox));
        const rawLatex = await texoFormulaClient.recognize(blob, ({ label, progress }) => {
          this.onProgress({ stage: "formula", label, progress });
        });
        const latex = postprocessTexoLatex(rawLatex);
        if (latex) {
          formulaLatex.set(formula.id, latex);
        } else {
          warnings.push(`Formula ${index + 1} returned no usable LaTex.`);
        }
      } catch (error) {
        warnings.push(`Formula ${index + 1} was not recognized: ${getErrorMessage(error)}`);
      }
    }
    timings.formulaMs = now() - stageStart;

    this.onProgress({ stage: "compose", label: "Composing structured blocks" });
    stageStart = now();
    const blocks = composeImageDocumentBlocks({
      detections,
      ocrItems: retainedOcrItems,
      formulaLatex,
      confidenceThreshold,
    });
    const markdown = serializeImageDocumentMarkdown(blocks);
    timings.composeMs = now() - stageStart;
    timings.totalMs = now() - totalStart;

    if (blocks.length === 0) warnings.push("No layout blocks passed the confidence threshold.");
    if (formulas.length === 0)
      warnings.push("No formula region was detected, so Texo was not loaded.");

    return {
      fileName: file.name,
      fileSize: file.size,
      image: { width: decoded.width, height: decoded.height },
      blocks,
      markdown,
      timings,
      backend: {
        layout: runtime.getBackend() ?? "unknown",
        ocr: this.paddleSummary?.recProvider ?? ocrResult.runtime.recProvider,
        formula: formulas.length > 0 ? texoFormulaClient.getBackend() : "not used",
      },
      warnings,
      completedAt: Date.now(),
    };
  }

  async dispose(): Promise<void> {
    const layoutRuntime = this.layoutRuntime;
    const paddle = this.paddle;
    this.layoutRuntime = null;
    const layoutModelUrl = this.layoutModelUrl;
    this.layoutModelUrl = null;
    this.paddle = null;
    const paddleAssets = this.paddleAssets;
    this.paddleAssets = null;
    this.paddleSummary = null;
    await Promise.allSettled([layoutRuntime?.destroy(), paddle?.dispose()]);
    if (layoutModelUrl) URL.revokeObjectURL(layoutModelUrl);
    paddleAssets?.dispose();
  }

  private async ensureLayoutRuntime(): Promise<AiRuntime> {
    if (this.layoutRuntime) return this.layoutRuntime;
    const { createAiRuntime } = await import("@embedpdf/ai/web");
    const layoutModel = await createOpfsModelResourceUrl(PP_DOC_LAYOUT_V3_URL, (progress) => {
      this.onProgress({
        stage: "layout",
        label: "Downloading PP-DocLayoutV3 to OPFS",
        progress: progress.total ? progress.loaded / progress.total : undefined,
      });
    });
    this.layoutModelUrl = layoutModel.url;
    this.layoutRuntime = createAiRuntime({
      backend: "auto",
      cache: false,
      models: { "layout-detection": { url: layoutModel.url } },
    });
    return this.layoutRuntime;
  }

  private async ensurePaddle(): Promise<PaddleOcrEngine> {
    if (this.paddle) return this.paddle;
    const { PaddleOCR } = await import("@paddleocr/paddleocr-js");
    const assets = await preparePaddleOcrV6TinyModelAssets((label, progress) => {
      this.onProgress({
        stage: "ocr",
        label,
        progress: progress.total ? progress.loaded / progress.total : undefined,
      });
    });
    try {
      const paddle = (await PaddleOCR.create({
        initialize: false,
        worker: true,
        textDetectionModelName: "PP-OCRv6_tiny_det",
        textRecognitionModelName: "PP-OCRv6_tiny_rec",
        textDetectionModelAsset: assets.textDetectionModelAsset,
        textRecognitionModelAsset: assets.textRecognitionModelAsset,
        textDetectionBatchSize: 1,
        textRecognitionBatchSize: 6,
        ortOptions: { backend: "auto" },
      })) as PaddleOcrEngine;
      this.paddleSummary = await paddle.initialize();
      this.paddleAssets = assets;
      this.paddle = paddle;
      return paddle;
    } catch (error) {
      assets.dispose();
      throw error;
    }
  }
}
