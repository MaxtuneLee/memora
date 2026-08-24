import { Button } from "@base-ui/react/button";
import { Tabs } from "@base-ui/react/tabs";
import {
  ArrowClockwiseIcon,
  BracketsCurlyIcon,
  CheckCircleIcon,
  ClipboardIcon,
  CodeIcon,
  FileImageIcon,
  ImageSquareIcon,
  PlayIcon,
  ScanIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Streamdown } from "streamdown";
import "streamdown/styles.css";
import "katex/dist/katex.min.css";

import { cn } from "@/lib/cn";
import { formatBytes } from "@/lib/format";
import {
  ImageDocumentPipelineSession,
  type ImageDocumentBlock,
  type ImageDocumentPipelineProgress,
  type ImageDocumentPipelineResult,
  type ImagePipelineStage,
} from "@/lib/playground/imageDocumentPipeline";
import {
  MEMORA_STREAMDOWN_CLASS_NAME,
  MEMORA_STREAMDOWN_CONTROLS,
  MEMORA_STREAMDOWN_PLUGINS,
  MEMORA_STREAMDOWN_THEME,
} from "@/lib/streamdown";

const PIPELINE_STAGES: Array<{ id: ImagePipelineStage; label: string; detail: string }> = [
  { id: "decode", label: "Decode", detail: "Browser ImageData" },
  { id: "layout", label: "Layout", detail: "PP-DocLayoutV3" },
  { id: "ocr", label: "Text", detail: "PP-OCRv6 tiny" },
  { id: "formula", label: "Formula", detail: "Texo FormulaNet" },
  { id: "compose", label: "Compose", detail: "Blocks → Markdown" },
];

const STAGE_INDEX = new Map(PIPELINE_STAGES.map((stage, index) => [stage.id, index]));

const BLOCK_COLORS: Record<string, string> = {
  doc_title: "#647542",
  paragraph_title: "#7c895b",
  text: "#76736b",
  abstract: "#8a7b56",
  display_formula: "#a45f4a",
  inline_formula: "#bd775c",
  formula_number: "#b28a58",
  table: "#4e7882",
  image: "#6e678b",
  chart: "#6e678b",
  unknown: "#8b8981",
  ignored: "#aaa69d",
};

const formatMilliseconds = (value: number): string => {
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10_000 ? 1 : 2)} s`;
  return `${Math.round(value)} ms`;
};

const createSampleFile = async (): Promise<File> => {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 1600;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable in this browser.");

  context.fillStyle = "#f4f0e8";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#fffefb";
  context.fillRect(86, 66, 1028, 1468);
  context.strokeStyle = "#ded9ce";
  context.strokeRect(86, 66, 1028, 1468);
  context.fillStyle = "#22221f";
  context.textAlign = "center";
  context.font = '600 52px Georgia, "Noto Serif", serif';
  context.fillText("Local-first document intelligence", 600, 170);
  context.fillStyle = "#6e6a62";
  context.font = '400 24px "Noto Sans", sans-serif';
  context.fillText("A browser-native image parsing experiment", 600, 218);

  context.textAlign = "left";
  context.fillStyle = "#2b2a26";
  context.font = '600 30px Georgia, "Noto Serif", serif';
  context.fillText("1. Motivation", 150, 320);
  context.font = '400 23px "Noto Sans", sans-serif';
  context.fillText("Private documents should remain on the user’s device while", 150, 375);
  context.fillText(
    "their text, reading order, and mathematical notation stay searchable.",
    150,
    414,
  );
  context.fillText("We estimate recognition quality using the following objective:", 150, 453);

  context.textAlign = "center";
  context.font = 'italic 34px "Times New Roman", serif';
  context.fillText("L = Σᵢ (ŷᵢ − yᵢ)² + λ‖θ‖₂", 600, 548);
  context.textAlign = "right";
  context.font = '400 22px "Times New Roman", serif';
  context.fillText("(1)", 1025, 548);

  context.textAlign = "left";
  context.font = '600 30px Georgia, "Noto Serif", serif';
  context.fillText("2. Pipeline", 150, 660);
  context.font = '400 23px "Noto Sans", sans-serif';
  context.fillText("The detector first identifies titles, paragraphs, figures, and", 150, 715);
  context.fillText("formulas. PP-OCRv6 handles text while Texo produces LaTeX.", 150, 754);

  context.fillStyle = "#f1eee6";
  context.strokeStyle = "#cfc8ba";
  context.fillRect(150, 830, 900, 360);
  context.strokeRect(150, 830, 900, 360);
  context.fillStyle = "#7c895b";
  context.fillRect(240, 1028, 140, 80);
  context.fillStyle = "#bd775c";
  context.fillRect(530, 918, 140, 80);
  context.fillStyle = "#4e7882";
  context.fillRect(820, 1028, 140, 80);
  context.strokeStyle = "#777267";
  context.lineWidth = 4;
  context.beginPath();
  context.moveTo(380, 1068);
  context.lineTo(530, 958);
  context.moveTo(670, 958);
  context.lineTo(820, 1068);
  context.stroke();
  context.fillStyle = "#ffffff";
  context.textAlign = "center";
  context.font = '600 19px "Noto Sans", sans-serif';
  context.fillText("Layout", 310, 1078);
  context.fillText("Recognize", 600, 968);
  context.fillText("Markdown", 890, 1078);
  context.fillStyle = "#59564f";
  context.font = '400 19px "Noto Sans", sans-serif';
  context.fillText("Figure 1. Browser-local document image pipeline", 600, 1238);

  context.textAlign = "left";
  context.fillStyle = "#2b2a26";
  context.font = '600 30px Georgia, "Noto Serif", serif';
  context.fillText("3. Result", 150, 1342);
  context.font = '400 23px "Noto Sans", sans-serif';
  context.fillText("The structured block result keeps coordinates and confidence;", 150, 1397);
  context.fillText("Markdown is generated as a portable presentation layer.", 150, 1436);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (value) => (value ? resolve(value) : reject(new Error("Sample failed."))),
      "image/png",
    );
  });
  return new File([blob], "memora-image-pipeline-sample.png", { type: "image/png" });
};

const getStageState = (
  stage: ImagePipelineStage,
  progress: ImageDocumentPipelineProgress | null,
  result: ImageDocumentPipelineResult | null,
  isRunning: boolean,
): "pending" | "running" | "complete" => {
  if (result) return "complete";
  if (!isRunning || !progress) return "pending";
  const current = STAGE_INDEX.get(progress.stage) ?? 0;
  const target = STAGE_INDEX.get(stage) ?? 0;
  if (target < current) return "complete";
  return target === current ? "running" : "pending";
};

interface ImagePreviewProps {
  previewUrl: string | null;
  image: File | null;
  result: ImageDocumentPipelineResult | null;
  selectedBlockId: string | null;
  isRunning: boolean;
  onSelectImage: (file: File | null) => void;
  onSelectBlock: (id: string) => void;
}

function ImagePreview({
  previewUrl,
  image,
  result,
  selectedBlockId,
  isRunning,
  onSelectImage,
  onSelectBlock,
}: ImagePreviewProps) {
  return (
    <label
      className={cn(
        "group relative flex min-h-[520px] cursor-pointer items-center justify-center overflow-hidden rounded-[24px] border border-dashed border-memora-border-soft bg-memora-surface-soft outline-none transition-colors hover:border-memora-olive-soft focus-within:ring-2 focus-within:ring-memora-olive-soft",
        previewUrl && "border-solid bg-[#ebe7df] p-4",
      )}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        onSelectImage(event.dataTransfer.files[0] ?? null);
      }}
    >
      <input
        type="file"
        accept="image/*"
        className="sr-only"
        disabled={isRunning}
        onChange={(event) => {
          onSelectImage(event.target.files?.[0] ?? null);
          event.target.value = "";
        }}
      />
      {previewUrl && image ? (
        <div className="relative max-h-[720px] max-w-full overflow-hidden shadow-[0_14px_46px_rgba(42,39,33,0.14)]">
          <img src={previewUrl} alt={image.name} className="block max-h-[720px] max-w-full" />
          {result
            ? result.blocks.map((block) => (
                <button
                  key={block.id}
                  type="button"
                  aria-label={`Select ${block.kind} block`}
                  className={cn(
                    "absolute border-2 transition-[background-color,border-color] hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-white",
                    selectedBlockId === block.id && "bg-white/20 shadow-[0_0_0_2px_white]",
                  )}
                  style={{
                    left: `${(block.rect.x / result.image.width) * 100}%`,
                    top: `${(block.rect.y / result.image.height) * 100}%`,
                    width: `${(block.rect.width / result.image.width) * 100}%`,
                    height: `${(block.rect.height / result.image.height) * 100}%`,
                    borderColor: BLOCK_COLORS[block.kind] ?? BLOCK_COLORS.unknown,
                  }}
                  onClick={(event) => {
                    event.preventDefault();
                    onSelectBlock(block.id);
                  }}
                >
                  <span
                    className="absolute -top-5 left-0 max-w-28 truncate rounded-t px-1.5 py-0.5 text-[9px] font-semibold text-white"
                    style={{ background: BLOCK_COLORS[block.kind] ?? BLOCK_COLORS.unknown }}
                  >
                    {block.kind.replaceAll("_", " ")}
                  </span>
                </button>
              ))
            : null}
        </div>
      ) : (
        <div className="max-w-xs px-8 text-center">
          <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-memora-surface-muted text-memora-text-muted">
            <ImageSquareIcon className="size-5" />
          </span>
          <p className="mt-4 text-sm font-semibold text-memora-text">Drop a document image</p>
          <p className="mt-2 text-xs leading-5 text-memora-text-soft">
            One full-page PNG, JPEG, or WebP. No PDF parsing in this experiment.
          </p>
        </div>
      )}
    </label>
  );
}

function BlockInspector({ block }: { block: ImageDocumentBlock | null }) {
  if (!block) {
    return (
      <div className="flex min-h-36 items-center justify-center rounded-2xl border border-dashed border-memora-border-soft px-5 text-center text-xs leading-5 text-memora-text-soft">
        Run the pipeline, then select a colored region to inspect its source and coordinates.
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-memora-border bg-memora-surface-soft p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-memora-text">
            {block.kind.replaceAll("_", " ")}
          </h4>
        </div>
        <span className="rounded-full bg-memora-surface-muted px-2.5 py-1 text-[10px] font-semibold text-memora-text-muted">
          {(block.score * 100).toFixed(1)}%
        </span>
      </div>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-memora-text-muted">
        {block.latex ?? block.text ?? "This region is currently retained as a placeholder."}
      </p>
      <dl className="mt-4 grid grid-cols-2 gap-2 border-t border-memora-border pt-3 text-[11px]">
        <div>
          <dt className="text-memora-text-soft">Class</dt>
          <dd className="mt-0.5 font-medium text-memora-text">
            {block.classId} · {block.label}
          </dd>
        </div>
        <div>
          <dt className="text-memora-text-soft">Recognizer</dt>
          <dd className="mt-0.5 font-medium text-memora-text">{block.recognition}</dd>
        </div>
        <div>
          <dt className="text-memora-text-soft">Position</dt>
          <dd className="mt-0.5 font-medium text-memora-text">
            {Math.round(block.rect.x)}, {Math.round(block.rect.y)}
          </dd>
        </div>
        <div>
          <dt className="text-memora-text-soft">Size</dt>
          <dd className="mt-0.5 font-medium text-memora-text">
            {Math.round(block.rect.width)} × {Math.round(block.rect.height)}
          </dd>
        </div>
      </dl>
    </div>
  );
}

export default function ImageDocumentPipeline() {
  const [image, setImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [result, setResult] = useState<ImageDocumentPipelineResult | null>(null);
  const [progress, setProgress] = useState<ImageDocumentPipelineProgress | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const sessionRef = useRef<ImageDocumentPipelineSession | null>(null);

  if (!sessionRef.current) sessionRef.current = new ImageDocumentPipelineSession(setProgress);

  useEffect(() => {
    if (!image) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(image);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);

  useEffect(() => () => void sessionRef.current?.dispose(), []);

  const selectImage = useCallback((file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Choose a PNG, JPEG, WebP, or another browser-readable image.");
      return;
    }
    setImage(file);
    setResult(null);
    setSelectedBlockId(null);
    setError(null);
  }, []);

  const handleUseSample = useCallback(async () => {
    try {
      selectImage(await createSampleFile());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }, [selectImage]);

  const handleRun = useCallback(async () => {
    if (!image || !sessionRef.current) return;
    setIsRunning(true);
    setResult(null);
    setSelectedBlockId(null);
    setError(null);
    try {
      const nextResult = await sessionRef.current.run(image);
      setResult(nextResult);
      setSelectedBlockId(nextResult.blocks[0]?.id ?? null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setIsRunning(false);
      setProgress(null);
    }
  }, [image]);

  const handleResetModels = useCallback(async () => {
    if (!sessionRef.current || isRunning) return;
    await sessionRef.current.dispose();
    setResult(null);
    setSelectedBlockId(null);
  }, [isRunning]);

  const handleCopy = useCallback(async () => {
    if (!result?.markdown) return;
    await navigator.clipboard.writeText(result.markdown);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }, [result]);

  const selectedBlock = useMemo(
    () => result?.blocks.find((block) => block.id === selectedBlockId) ?? null,
    [result, selectedBlockId],
  );

  return (
    <div className="space-y-7">
      <div className="grid gap-7 xl:grid-cols-[minmax(420px,0.95fr)_minmax(560px,1.05fr)]">
        <section className="overflow-hidden rounded-[28px] border border-memora-border bg-memora-surface shadow-sm-soft xl:col-start-1 xl:row-start-1">
          <div className="flex flex-wrap items-end justify-between gap-4 border-b border-memora-border px-6 py-5">
            <div>
              <h2 className="font-serif text-2xl font-medium tracking-tight text-memora-text-strong">
                Inspect the page geometry
              </h2>
            </div>
            <Button
              onClick={handleUseSample}
              disabled={isRunning}
              className="rounded-xl border border-memora-border bg-memora-surface px-3 py-2 text-xs font-semibold text-memora-text-muted transition-colors hover:bg-memora-surface-muted disabled:opacity-50"
            >
              Use sample
            </Button>
          </div>
          <div className="p-5">
            <ImagePreview
              previewUrl={previewUrl}
              image={image}
              result={result}
              selectedBlockId={selectedBlockId}
              isRunning={isRunning}
              onSelectImage={selectImage}
              onSelectBlock={setSelectedBlockId}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-memora-border px-6 py-5">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-memora-text">
                {image?.name ?? "No image selected"}
              </p>
              <p className="mt-0.5 text-xs text-memora-text-soft">
                {image ? formatBytes(image.size) : "Full-page raster image"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={handleResetModels}
                disabled={isRunning}
                title="Release model sessions"
                className="flex size-10 items-center justify-center rounded-xl border border-memora-border bg-memora-surface text-memora-text-muted transition-colors hover:bg-memora-surface-muted disabled:opacity-50"
              >
                <ArrowClockwiseIcon className="size-4" />
              </Button>
              <Button
                onClick={handleRun}
                disabled={!image || isRunning}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-memora-olive px-4 text-sm font-semibold text-white transition-colors hover:bg-memora-olive-strong disabled:cursor-not-allowed disabled:opacity-45"
              >
                <PlayIcon weight="fill" className="size-3.5" />
                {isRunning ? "Running…" : "Run pipeline"}
              </Button>
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-memora-border bg-memora-surface p-6 shadow-sm-soft xl:col-start-1 xl:row-start-2">
          <div className="flex items-start justify-between gap-5">
            <div>
              <h2 className="font-serif text-2xl font-medium tracking-tight text-memora-text-strong">
                One image, five visible stages
              </h2>
            </div>
            {result ? (
              <span className="rounded-full border border-memora-border bg-memora-surface-muted px-3 py-1.5 text-[11px] font-medium text-memora-text-muted">
                {result.blocks.length} blocks
              </span>
            ) : null}
          </div>

          <div className="mt-6 grid gap-2 sm:grid-cols-5">
            {PIPELINE_STAGES.map((stage) => {
              const state = getStageState(stage.id, progress, result, isRunning);
              return (
                <div
                  key={stage.id}
                  className={cn(
                    "rounded-2xl border p-3",
                    state === "running"
                      ? "border-memora-olive-soft bg-memora-olive-faint"
                      : "border-memora-border bg-memora-surface-soft",
                  )}
                >
                  <div className="flex items-center gap-2">
                    {state === "complete" ? (
                      <CheckCircleIcon weight="fill" className="size-3.5 text-memora-olive" />
                    ) : (
                      <span
                        className={cn(
                          "size-2 rounded-full bg-memora-border-soft",
                          state === "running" && "animate-pulse bg-memora-olive",
                        )}
                      />
                    )}
                    <p className="text-xs font-semibold text-memora-text">{stage.label}</p>
                  </div>
                  <p className="mt-1.5 text-[10px] leading-4 text-memora-text-soft">
                    {stage.detail}
                  </p>
                </div>
              );
            })}
          </div>
          {progress ? (
            <div className="mt-4 rounded-2xl bg-memora-surface-muted p-3">
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="font-medium text-memora-text-muted">{progress.label}</span>
                {progress.progress !== undefined ? (
                  <span className="text-memora-text-soft">
                    {Math.round(progress.progress * 100)}%
                  </span>
                ) : null}
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-memora-surface">
                <div
                  className={cn(
                    "h-full rounded-full bg-memora-olive transition-[width]",
                    progress.progress === undefined && "w-1/3 animate-pulse",
                  )}
                  style={
                    progress.progress === undefined
                      ? undefined
                      : { width: `${Math.max(2, progress.progress * 100)}%` }
                  }
                />
              </div>
            </div>
          ) : null}
          {error ? (
            <div className="mt-4 flex gap-3 rounded-2xl border border-memora-warning-border bg-memora-warning-surface p-4 text-sm text-memora-warning-text">
              <WarningCircleIcon className="mt-0.5 size-4 shrink-0" />
              <p className="min-w-0 break-words">{error}</p>
            </div>
          ) : null}
          {result ? (
            <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-memora-surface-soft p-3">
                <dt className="text-[11px] font-medium text-memora-text-soft">Layout</dt>
                <dd className="mt-1 text-sm font-semibold text-memora-text">
                  {formatMilliseconds(result.timings.layoutMs)}
                </dd>
                <dd className="mt-0.5 text-[10px] text-memora-text-soft">
                  {result.backend.layout}
                </dd>
              </div>
              <div className="rounded-2xl bg-memora-surface-soft p-3">
                <dt className="text-[11px] font-medium text-memora-text-soft">Text OCR</dt>
                <dd className="mt-1 text-sm font-semibold text-memora-text">
                  {formatMilliseconds(result.timings.ocrMs)}
                </dd>
                <dd className="mt-0.5 truncate text-[10px] text-memora-text-soft">
                  {result.backend.ocr}
                </dd>
              </div>
              <div className="rounded-2xl bg-memora-surface-soft p-3">
                <dt className="text-[11px] font-medium text-memora-text-soft">Formula</dt>
                <dd className="mt-1 text-sm font-semibold text-memora-text">
                  {formatMilliseconds(result.timings.formulaMs)}
                </dd>
                <dd className="mt-0.5 text-[10px] text-memora-text-soft">
                  {result.backend.formula}
                </dd>
              </div>
              <div className="rounded-2xl bg-memora-surface-soft p-3">
                <dt className="text-[11px] font-medium text-memora-text-soft">Compose</dt>
                <dd className="mt-1 text-sm font-semibold text-memora-text">
                  {formatMilliseconds(result.timings.composeMs)}
                </dd>
              </div>
              <div className="rounded-2xl bg-memora-surface-soft p-3">
                <dt className="text-[11px] font-medium text-memora-text-soft">Total</dt>
                <dd className="mt-1 text-sm font-semibold text-memora-text">
                  {formatMilliseconds(result.timings.totalMs)}
                </dd>
              </div>
              <div className="rounded-2xl bg-memora-surface-soft p-3">
                <dt className="text-[11px] font-medium text-memora-text-soft">Image</dt>
                <dd className="mt-1 text-sm font-semibold text-memora-text">
                  {result.image.width} × {result.image.height}
                </dd>
              </div>
            </dl>
          ) : null}
        </section>

        <div className="space-y-7 xl:col-start-2 xl:row-span-2 xl:row-start-1">
          <BlockInspector block={selectedBlock} />

          <section className="overflow-hidden rounded-[28px] border border-memora-border bg-memora-surface shadow-sm-soft">
            <Tabs.Root defaultValue="preview">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-memora-border px-4 py-3">
                <Tabs.List className="flex gap-1 rounded-xl bg-memora-surface-muted p-1">
                  <Tabs.Tab
                    value="preview"
                    className="flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-memora-text-muted outline-none data-active:bg-memora-surface data-active:text-memora-text data-active:shadow-sm"
                  >
                    <FileImageIcon className="size-3.5" />
                    Preview
                  </Tabs.Tab>
                  <Tabs.Tab
                    value="source"
                    className="flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-memora-text-muted outline-none data-active:bg-memora-surface data-active:text-memora-text data-active:shadow-sm"
                  >
                    <CodeIcon className="size-3.5" />
                    Markdown
                  </Tabs.Tab>
                  <Tabs.Tab
                    value="blocks"
                    className="flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-memora-text-muted outline-none data-active:bg-memora-surface data-active:text-memora-text data-active:shadow-sm"
                  >
                    <BracketsCurlyIcon className="size-3.5" />
                    Blocks
                  </Tabs.Tab>
                </Tabs.List>
                <Button
                  onClick={handleCopy}
                  disabled={!result?.markdown}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-memora-border px-2.5 text-xs font-semibold text-memora-text-muted disabled:opacity-40"
                >
                  <ClipboardIcon className="size-3.5" />
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
              <Tabs.Panel
                value="preview"
                className="min-h-[360px] p-6 outline-none [[hidden]]:hidden"
              >
                {result?.markdown ? (
                  <Streamdown
                    className={MEMORA_STREAMDOWN_CLASS_NAME}
                    controls={MEMORA_STREAMDOWN_CONTROLS}
                    plugins={{ ...MEMORA_STREAMDOWN_PLUGINS }}
                    shikiTheme={MEMORA_STREAMDOWN_THEME}
                  >
                    {result.markdown}
                  </Streamdown>
                ) : (
                  <div className="flex min-h-[300px] items-center justify-center text-center text-sm text-memora-text-soft">
                    <div>
                      <ScanIcon className="mx-auto size-5" />
                      <p className="mt-3">Rendered Markdown will appear here.</p>
                    </div>
                  </div>
                )}
              </Tabs.Panel>
              <Tabs.Panel value="source" className="min-h-[360px] outline-none [[hidden]]:hidden">
                <pre className="min-h-[360px] overflow-auto whitespace-pre-wrap bg-memora-surface-soft p-6 text-xs leading-6 text-memora-text-muted">
                  {result?.markdown || "Run the image pipeline to generate Markdown."}
                </pre>
              </Tabs.Panel>
              <Tabs.Panel value="blocks" className="min-h-[360px] outline-none [[hidden]]:hidden">
                <pre className="min-h-[360px] overflow-auto bg-memora-surface-soft p-6 text-xs leading-5 text-memora-text-muted">
                  {result
                    ? JSON.stringify(result.blocks, null, 2)
                    : "Run the image pipeline to inspect structured blocks."}
                </pre>
              </Tabs.Panel>
            </Tabs.Root>
          </section>
        </div>
      </div>

      <div className="flex gap-3 rounded-2xl border border-memora-border bg-memora-surface-soft px-4 py-3 text-xs leading-5 text-memora-text-soft">
        <WarningCircleIcon className="mt-0.5 size-4 shrink-0" />
        <p>
          PP-DocLayoutV3, PP-OCRv6, and Texo use the same @memora/fs-backed OPFS model cache as
          local ASR and LLM models. Media stays in the browser. Tables and figures are preserved as
          positioned placeholders in this first version. Texo and Texo-web are AGPL-3.0 projects, so
          this Playground integration is marked for development evaluation before product
          distribution.
        </p>
      </div>
    </div>
  );
}
