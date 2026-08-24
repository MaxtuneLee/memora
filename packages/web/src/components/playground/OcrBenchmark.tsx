import { Button } from "@base-ui/react/button";
import {
  ArrowClockwiseIcon,
  ImageSquareIcon,
  PlayIcon,
  UploadSimpleIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/cn";
import { formatBytes } from "@/lib/format";
import {
  OcrBenchmarkSession,
  type OcrBenchmarkLanguage,
  type OcrBenchmarkProgress,
  type OcrComparisonResult,
  type OcrEngineBenchmarkResult,
  type SuccessfulOcrBenchmarkResult,
} from "@/lib/playground/ocrBenchmark";

const REPEAT_OPTIONS = [1, 3, 5] as const;

const formatMilliseconds = (value: number): string => {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(value >= 10_000 ? 1 : 2)} s`;
  }
  return `${Math.round(value)} ms`;
};

const formatConfidence = (value: number | null): string => {
  return value === null ? "—" : `${value.toFixed(1)}%`;
};

const getSuccessfulResult = (
  result: OcrComparisonResult | null,
  engine: SuccessfulOcrBenchmarkResult["engine"],
): SuccessfulOcrBenchmarkResult | null => {
  const engineResult = result?.results.find((item) => item.engine === engine);
  return engineResult?.status === "success" ? engineResult : null;
};

const getEngineResult = (
  result: OcrComparisonResult | null,
  engine: OcrEngineBenchmarkResult["engine"],
): OcrEngineBenchmarkResult | null => {
  return result?.results.find((item) => item.engine === engine) ?? null;
};

const createSampleFile = async (): Promise<File> => {
  const canvas = document.createElement("canvas");
  canvas.width = 1400;
  canvas.height = 820;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas is unavailable in this browser.");
  }

  context.fillStyle = "#f6f1e7";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#fffdfa";
  context.strokeStyle = "#d9d2c5";
  context.lineWidth = 3;
  context.beginPath();
  context.roundRect(90, 82, 1220, 656, 34);
  context.fill();
  context.stroke();

  context.fillStyle = "#20201c";
  context.font = '600 66px "Noto Sans", "Noto Sans SC", sans-serif';
  context.fillText("Memora OCR benchmark", 160, 206);
  context.fillStyle = "#6f6a60";
  context.font = '400 38px "Noto Sans", "Noto Sans SC", sans-serif';
  context.fillText("Local-first document recognition", 160, 278);

  context.fillStyle = "#2a2924";
  context.font = '500 48px "Noto Sans SC", "Noto Sans", sans-serif';
  context.fillText("浏览器端文字识别性能对比", 160, 402);
  context.font = '400 34px "Noto Sans SC", "Noto Sans", sans-serif';
  context.fillText("同一张图片，本地处理，不上传媒体内容。", 160, 470);

  context.fillStyle = "#7b875a";
  context.fillRect(160, 564, 184, 8);
  context.fillStyle = "#45433d";
  context.font = '400 30px "Noto Sans", "Noto Sans SC", sans-serif';
  context.fillText("Accuracy · latency · confidence · repeatability", 160, 640);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => {
      if (value) {
        resolve(value);
      } else {
        reject(new Error("Could not create the benchmark sample image."));
      }
    }, "image/png");
  });

  return new File([blob], "memora-ocr-benchmark.png", { type: "image/png" });
};

interface MetricRowProps {
  label: string;
  tesseract: string;
  paddle: string;
}

function MetricRow({ label, tesseract, paddle }: MetricRowProps) {
  return (
    <tr className="border-t border-memora-border first:border-t-0">
      <th className="w-[34%] px-5 py-3 text-left text-xs font-medium text-memora-text-muted">
        {label}
      </th>
      <td className="px-5 py-3 text-sm font-semibold text-memora-text">{tesseract}</td>
      <td className="px-5 py-3 text-sm font-semibold text-memora-text">{paddle}</td>
    </tr>
  );
}

interface EngineOutputProps {
  result: OcrEngineBenchmarkResult | null;
  fallbackLabel: string;
}

function EngineOutput({ result, fallbackLabel }: EngineOutputProps) {
  const label = result?.label ?? fallbackLabel;

  return (
    <section className="min-w-0 px-5 py-5 sm:px-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-memora-text">{label}</h3>
          <p className="mt-1 text-xs text-memora-text-soft">
            {result?.status === "success"
              ? `${result.reusedSession ? "Warm session" : "Cold session"} · ${result.timing.samples.length} sample${result.timing.samples.length === 1 ? "" : "s"}`
              : "Benchmark output"}
          </p>
        </div>
        {result?.status === "success" ? (
          <span className="rounded-full border border-memora-border bg-memora-surface-muted px-2.5 py-1 text-xs font-semibold text-memora-text-muted">
            {formatConfidence(result.confidence)} confidence
          </span>
        ) : null}
      </div>

      {result?.status === "error" ? (
        <div className="mt-5 flex gap-3 rounded-2xl border border-memora-warning-border bg-memora-warning-surface p-4 text-sm text-memora-warning-text">
          <WarningCircleIcon className="mt-0.5 size-4 shrink-0" />
          <p className="min-w-0 break-words">{result.error}</p>
        </div>
      ) : (
        <pre className="mt-5 min-h-40 overflow-auto whitespace-pre-wrap rounded-2xl bg-memora-surface-muted p-4 font-sans text-sm leading-6 text-memora-text">
          {result?.text || "Run the comparison to inspect recognized text."}
        </pre>
      )}

      {result?.status === "success" ? (
        <dl className="mt-4 grid grid-cols-2 gap-x-5 gap-y-2 border-t border-memora-border pt-4 text-xs">
          {Object.entries(result.details).map(([key, value]) => (
            <div key={key} className="flex min-w-0 items-center justify-between gap-3">
              <dt className="truncate text-memora-text-soft">{key}</dt>
              <dd className="truncate font-medium text-memora-text-muted">
                {typeof value === "number" && key.endsWith("ms")
                  ? formatMilliseconds(value)
                  : String(value)}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </section>
  );
}

export default function OcrBenchmark() {
  const [image, setImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [language, setLanguage] = useState<OcrBenchmarkLanguage>("eng-chi-sim");
  const [repeatCount, setRepeatCount] = useState<(typeof REPEAT_OPTIONS)[number]>(1);
  const [progress, setProgress] = useState<OcrBenchmarkProgress | null>(null);
  const [result, setResult] = useState<OcrComparisonResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const sessionRef = useRef<OcrBenchmarkSession | null>(null);

  if (!sessionRef.current) {
    sessionRef.current = new OcrBenchmarkSession(setProgress);
  }

  useEffect(() => {
    if (!image) {
      setPreviewUrl(null);
      return;
    }

    const nextPreviewUrl = URL.createObjectURL(image);
    setPreviewUrl(nextPreviewUrl);
    return () => URL.revokeObjectURL(nextPreviewUrl);
  }, [image]);

  useEffect(() => {
    return () => {
      void sessionRef.current?.dispose();
    };
  }, []);

  const selectImage = useCallback((file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setPageError("Choose a PNG, JPEG, WebP, or another browser-readable image.");
      return;
    }

    setImage(file);
    setResult(null);
    setPageError(null);
  }, []);

  const handleUseSample = useCallback(async () => {
    try {
      selectImage(await createSampleFile());
    } catch (error) {
      setPageError(error instanceof Error ? error.message : String(error));
    }
  }, [selectImage]);

  const handleRun = useCallback(async () => {
    if (!image || !sessionRef.current) return;

    setIsRunning(true);
    setResult(null);
    setPageError(null);
    try {
      const comparison = await sessionRef.current.runComparison(image, {
        language,
        repeatCount,
      });
      setResult(comparison);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : String(error));
    } finally {
      setProgress(null);
      setIsRunning(false);
    }
  }, [image, language, repeatCount]);

  const handleResetEngines = useCallback(async () => {
    if (!sessionRef.current || isRunning) return;
    await sessionRef.current.dispose();
    setResult(null);
    setProgress(null);
  }, [isRunning]);

  const tesseract = getSuccessfulResult(result, "tesseract");
  const paddle = getSuccessfulResult(result, "paddle-ocr-v6");
  const tesseractResult = getEngineResult(result, "tesseract");
  const paddleResult = getEngineResult(result, "paddle-ocr-v6");

  return (
    <div className="space-y-7">
      <div className="grid gap-7 xl:grid-cols-[minmax(300px,0.78fr)_minmax(480px,1.22fr)]">
        <section className="overflow-hidden rounded-[28px] border border-memora-border bg-memora-surface shadow-sm-soft">
          <label
            className={cn(
              "group relative m-5 flex min-h-72 cursor-pointer items-center justify-center overflow-hidden rounded-3xl border border-dashed border-memora-border-soft bg-memora-surface-soft outline-none transition-colors hover:border-memora-olive-soft focus-within:ring-2 focus-within:ring-memora-olive-soft",
              previewUrl && "border-solid bg-[#f2eee6]",
            )}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              selectImage(event.dataTransfer.files[0] ?? null);
            }}
          >
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              disabled={isRunning}
              onChange={(event) => {
                selectImage(event.target.files?.[0] ?? null);
                event.target.value = "";
              }}
            />
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="Selected OCR benchmark input"
                className="max-h-[410px] w-full object-contain p-4"
              />
            ) : (
              <div className="max-w-xs px-8 text-center">
                <span className="mx-auto flex size-11 items-center justify-center rounded-2xl bg-memora-surface-muted text-memora-text-muted">
                  <ImageSquareIcon className="size-5" />
                </span>
                <p className="mt-4 text-sm font-semibold text-memora-text">Drop an image here</p>
                <p className="mt-2 text-xs leading-5 text-memora-text-soft">
                  The same browser-local file is passed to both engines.
                </p>
              </div>
            )}
          </label>

          <div className="flex flex-wrap items-center justify-between gap-3 px-6 pb-6">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-memora-text">
                {image?.name ?? "No image selected"}
              </p>
              <p className="mt-0.5 text-xs text-memora-text-soft">
                {image ? formatBytes(image.size) : "PNG, JPEG, or WebP"}
              </p>
            </div>
            <Button
              type="button"
              disabled={isRunning}
              onClick={() => void handleUseSample()}
              className="inline-flex items-center gap-2 rounded-full border border-memora-border bg-memora-surface px-3.5 py-2 text-xs font-semibold text-memora-text-muted outline-none transition-colors hover:bg-memora-hover focus-visible:ring-2 focus-visible:ring-memora-olive-soft disabled:opacity-45"
            >
              <UploadSimpleIcon className="size-4" />
              Use sample
            </Button>
          </div>
        </section>

        <section className="rounded-[28px] border border-memora-border bg-memora-surface px-6 py-6 shadow-sm-soft sm:px-7">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
            <div>
              <h2 className="font-serif text-2xl font-medium tracking-tight text-memora-text-strong">
                Compare cold start and inference
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-memora-text-muted">
                Engines run sequentially to avoid resource contention. Sessions stay warm until you
                reset them.
              </p>
            </div>
            <Button
              type="button"
              disabled={isRunning}
              onClick={() => void handleResetEngines()}
              className="inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold text-memora-text-soft outline-none transition-colors hover:bg-memora-hover hover:text-memora-text focus-visible:ring-2 focus-visible:ring-memora-olive-soft disabled:opacity-45"
            >
              <ArrowClockwiseIcon className="size-4" />
              Reset engines
            </Button>
          </div>

          <div className="mt-8 grid gap-5 border-y border-memora-border py-6 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-semibold text-memora-text-muted">
                Tesseract languages
              </span>
              <select
                value={language}
                disabled={isRunning}
                onChange={(event) => setLanguage(event.target.value as OcrBenchmarkLanguage)}
                className="mt-2 w-full rounded-xl border border-memora-border bg-memora-surface-soft px-3 py-2.5 text-sm text-memora-text outline-none focus:border-memora-olive-soft focus:ring-2 focus:ring-memora-olive-soft/30 disabled:opacity-50"
              >
                <option value="eng">English</option>
                <option value="eng-chi-sim">English + Simplified Chinese</option>
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-semibold text-memora-text-muted">Warm runs</span>
              <select
                value={repeatCount}
                disabled={isRunning}
                onChange={(event) =>
                  setRepeatCount(Number(event.target.value) as (typeof REPEAT_OPTIONS)[number])
                }
                className="mt-2 w-full rounded-xl border border-memora-border bg-memora-surface-soft px-3 py-2.5 text-sm text-memora-text outline-none focus:border-memora-olive-soft focus:ring-2 focus:ring-memora-olive-soft/30 disabled:opacity-50"
              >
                {REPEAT_OPTIONS.map((count) => (
                  <option key={count} value={count}>
                    {count} run{count === 1 ? "" : "s"}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {pageError ? (
            <div className="mt-5 flex gap-3 rounded-2xl border border-memora-warning-border bg-memora-warning-surface p-4 text-sm text-memora-warning-text">
              <WarningCircleIcon className="mt-0.5 size-4 shrink-0" />
              <p>{pageError}</p>
            </div>
          ) : null}

          {isRunning && progress ? (
            <div className="mt-6" aria-live="polite">
              <div className="flex items-center justify-between gap-4 text-xs">
                <span className="font-semibold text-memora-text">{progress.label}</span>
                <span className="text-memora-text-soft">
                  {progress.phase === "initializing" ? "Initializing" : "Running"}
                </span>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-memora-surface-muted">
                <div
                  className="h-full rounded-full bg-memora-olive transition-[width] duration-200"
                  style={{
                    width: `${Math.max(4, Math.min(100, (progress.progress ?? 0) * 100))}%`,
                  }}
                />
              </div>
            </div>
          ) : null}

          <div className="mt-7 flex flex-wrap items-center gap-4">
            <Button
              type="button"
              disabled={!image || isRunning}
              onClick={() => void handleRun()}
              className="inline-flex items-center gap-2 rounded-full bg-memora-primary px-5 py-2.5 text-sm font-semibold text-memora-surface outline-none transition-colors hover:bg-[#34332f] focus-visible:ring-2 focus-visible:ring-memora-olive-soft focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <PlayIcon weight="fill" className="size-4" />
              {isRunning ? "Benchmark running" : "Run comparison"}
            </Button>
            <p className="text-xs leading-5 text-memora-text-soft">
              PP-OCRv6 assets use the shared OPFS model cache. Images remain on this device.
            </p>
          </div>
        </section>
      </div>

      <section className="overflow-hidden rounded-[28px] border border-memora-border bg-memora-surface shadow-sm-soft">
        <div className="flex flex-col justify-between gap-3 border-b border-memora-border px-6 py-5 sm:flex-row sm:items-end">
          <div>
            <h2 className="font-serif text-2xl font-medium tracking-tight text-memora-text-strong">
              Timing and recognition output
            </h2>
          </div>
          <p className="text-xs text-memora-text-soft">
            {result
              ? `${result.repeatCount} run${result.repeatCount === 1 ? "" : "s"} · ${new Date(result.completedAt).toLocaleTimeString()}`
              : "Waiting for a benchmark run"}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[660px] border-collapse">
            <thead className="bg-memora-surface-soft">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-semibold text-memora-text-muted">
                  Metric
                </th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-memora-text-muted">
                  Tesseract.js 7
                </th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-memora-text-muted">
                  PP-OCRv6 tiny
                </th>
              </tr>
            </thead>
            <tbody>
              <MetricRow
                label="Initialization"
                tesseract={tesseract ? formatMilliseconds(tesseract.initMs) : "—"}
                paddle={paddle ? formatMilliseconds(paddle.initMs) : "—"}
              />
              <MetricRow
                label="Mean inference"
                tesseract={tesseract ? formatMilliseconds(tesseract.timing.mean) : "—"}
                paddle={paddle ? formatMilliseconds(paddle.timing.mean) : "—"}
              />
              <MetricRow
                label="Median inference"
                tesseract={tesseract ? formatMilliseconds(tesseract.timing.median) : "—"}
                paddle={paddle ? formatMilliseconds(paddle.timing.median) : "—"}
              />
              <MetricRow
                label="Observed range"
                tesseract={
                  tesseract
                    ? `${formatMilliseconds(tesseract.timing.min)}–${formatMilliseconds(tesseract.timing.max)}`
                    : "—"
                }
                paddle={
                  paddle
                    ? `${formatMilliseconds(paddle.timing.min)}–${formatMilliseconds(paddle.timing.max)}`
                    : "—"
                }
              />
              <MetricRow
                label="Confidence"
                tesseract={formatConfidence(tesseract?.confidence ?? null)}
                paddle={formatConfidence(paddle?.confidence ?? null)}
              />
              <MetricRow
                label="Detected items"
                tesseract="Page-level"
                paddle={paddle?.detectedItems === null ? "—" : String(paddle?.detectedItems ?? "—")}
              />
            </tbody>
          </table>
        </div>

        <div className="grid border-t border-memora-border lg:grid-cols-2 lg:divide-x lg:divide-memora-border">
          <EngineOutput result={tesseractResult} fallbackLabel="Tesseract.js 7" />
          <EngineOutput result={paddleResult} fallbackLabel="PP-OCRv6 tiny" />
        </div>
      </section>
    </div>
  );
}
