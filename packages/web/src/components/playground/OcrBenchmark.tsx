import { Button } from "@base-ui/react/button";
import {
  ArrowClockwiseIcon,
  ImageSquareIcon,
  PlayIcon,
  UploadSimpleIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import * as stylex from "@stylexjs/stylex";
import { useCallback, useEffect, useRef, useState } from "react";

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

const styles = stylex.create({
  root: { display: "flex", flexDirection: "column", gap: "1.75rem" },
  upperGrid: {
    display: "grid",
    gap: "1.75rem",
    gridTemplateColumns: {
      default: "minmax(0,1fr)",
      "@media (min-width: 1280px)": "minmax(300px,0.78fr) minmax(480px,1.22fr)",
    },
  },
  panel: {
    backgroundColor: "var(--color-memora-surface)",
    borderColor: "var(--color-memora-border)",
    borderRadius: "28px",
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: "0 1px 3px rgba(47,45,40,0.08)",
    overflow: "hidden",
  },
  paddedPanel: {
    overflow: "visible",
    paddingBlock: "1.5rem",
    paddingInline: { default: "1.5rem", "@media (min-width: 640px)": "1.75rem" },
  },
  dropzone: {
    alignItems: "center",
    backgroundColor: "var(--color-memora-surface-soft)",
    borderColor: {
      default: "var(--color-memora-border-soft)",
      ":hover": "var(--color-memora-olive-soft)",
    },
    borderRadius: "1.5rem",
    borderStyle: "dashed",
    borderWidth: 1,
    cursor: "pointer",
    display: "flex",
    justifyContent: "center",
    margin: "1.25rem",
    minHeight: "18rem",
    outline: "none",
    overflow: "hidden",
    position: "relative",
    transition: "border-color 150ms",
    ":focus-within": { boxShadow: "0 0 0 2px var(--color-memora-olive-soft)" },
  },
  dropzoneSelected: { backgroundColor: "#f2eee6", borderStyle: "solid" },
  srOnly: {
    clip: "rect(0,0,0,0)",
    height: 1,
    margin: -1,
    overflow: "hidden",
    position: "absolute",
    whiteSpace: "nowrap",
    width: 1,
  },
  previewImage: { maxHeight: "410px", objectFit: "contain", padding: "1rem", width: "100%" },
  emptyDropzone: { maxWidth: "20rem", paddingInline: "2rem", textAlign: "center" },
  emptyIconFrame: {
    alignItems: "center",
    backgroundColor: "var(--color-memora-surface-muted)",
    borderRadius: "1rem",
    color: "var(--color-memora-text-muted)",
    display: "flex",
    height: "2.75rem",
    justifyContent: "center",
    marginInline: "auto",
    width: "2.75rem",
  },
  mediumIcon: { height: "1.25rem", width: "1.25rem" },
  emptyTitle: {
    color: "var(--color-memora-text)",
    fontSize: "0.875rem",
    fontWeight: 600,
    lineHeight: "1.25rem",
    marginTop: "1rem",
  },
  emptyText: {
    color: "var(--color-memora-text-soft)",
    fontSize: "0.75rem",
    lineHeight: "1.25rem",
    marginTop: "0.5rem",
  },
  fileFooter: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: "0.75rem",
    justifyContent: "space-between",
    paddingBottom: "1.5rem",
    paddingInline: "1.5rem",
  },
  fileCopy: { minWidth: 0 },
  fileName: {
    color: "var(--color-memora-text)",
    fontSize: "0.875rem",
    fontWeight: 500,
    lineHeight: "1.25rem",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  fileMeta: {
    color: "var(--color-memora-text-soft)",
    fontSize: "0.75rem",
    lineHeight: "1rem",
    marginTop: "0.125rem",
  },
  pillButton: {
    alignItems: "center",
    backgroundColor: {
      default: "var(--color-memora-surface)",
      ":hover": "var(--color-memora-hover)",
    },
    borderColor: "var(--color-memora-border)",
    borderRadius: "9999px",
    borderStyle: "solid",
    borderWidth: 1,
    color: "var(--color-memora-text-muted)",
    display: "inline-flex",
    fontSize: "0.75rem",
    fontWeight: 600,
    gap: "0.5rem",
    outline: "none",
    paddingBlock: "0.5rem",
    paddingInline: "0.875rem",
    transition: "background-color 150ms",
    ":focus-visible": { outline: "2px solid var(--color-memora-olive-soft)", outlineOffset: 2 },
    ":disabled": { opacity: 0.45 },
  },
  icon: { height: "1rem", width: "1rem" },
  configHeader: {
    display: "flex",
    flexDirection: { default: "column", "@media (min-width: 640px)": "row" },
    gap: "1.25rem",
    justifyContent: "space-between",
    alignItems: { default: "stretch", "@media (min-width: 640px)": "flex-start" },
  },
  title: {
    color: "var(--color-memora-text-strong)",
    fontFamily: '"IBM Plex Serif", serif',
    fontSize: "1.5rem",
    fontWeight: 500,
    letterSpacing: "-0.025em",
    lineHeight: "2rem",
  },
  description: {
    color: "var(--color-memora-text-muted)",
    fontSize: "0.875rem",
    lineHeight: "1.5rem",
    marginTop: "0.5rem",
    maxWidth: "36rem",
  },
  resetButton: {
    alignItems: "center",
    borderRadius: "9999px",
    color: { default: "var(--color-memora-text-soft)", ":hover": "var(--color-memora-text)" },
    display: "inline-flex",
    flexShrink: 0,
    fontSize: "0.75rem",
    fontWeight: 600,
    gap: "0.5rem",
    outline: "none",
    paddingBlock: "0.5rem",
    paddingInline: "0.75rem",
    transition: "background-color 150ms, color 150ms",
    ":hover": { backgroundColor: "var(--color-memora-hover)" },
    ":focus-visible": { outline: "2px solid var(--color-memora-olive-soft)", outlineOffset: 2 },
    ":disabled": { opacity: 0.45 },
  },
  fields: {
    borderBottomColor: "var(--color-memora-border)",
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    borderTopColor: "var(--color-memora-border)",
    borderTopStyle: "solid",
    borderTopWidth: 1,
    display: "grid",
    gap: "1.25rem",
    gridTemplateColumns: {
      default: "minmax(0,1fr)",
      "@media (min-width: 640px)": "repeat(2,minmax(0,1fr))",
    },
    marginTop: "2rem",
    paddingBlock: "1.5rem",
  },
  label: { display: "block" },
  labelText: {
    color: "var(--color-memora-text-muted)",
    fontSize: "0.75rem",
    fontWeight: 600,
    lineHeight: "1rem",
  },
  select: {
    backgroundColor: "var(--color-memora-surface-soft)",
    borderColor: "var(--color-memora-border)",
    borderRadius: "0.75rem",
    borderStyle: "solid",
    borderWidth: 1,
    color: "var(--color-memora-text)",
    fontSize: "0.875rem",
    marginTop: "0.5rem",
    outline: "none",
    paddingBlock: "0.625rem",
    paddingInline: "0.75rem",
    width: "100%",
    ":focus": {
      borderColor: "var(--color-memora-olive-soft)",
      boxShadow: "0 0 0 2px color-mix(in srgb, var(--color-memora-olive-soft) 30%, transparent)",
    },
    ":disabled": { opacity: 0.5 },
  },
  warning: {
    backgroundColor: "var(--color-memora-warning-surface)",
    borderColor: "var(--color-memora-warning-border)",
    borderRadius: "1rem",
    borderStyle: "solid",
    borderWidth: 1,
    color: "var(--color-memora-warning-text)",
    display: "flex",
    fontSize: "0.875rem",
    gap: "0.75rem",
    marginTop: "1.25rem",
    padding: "1rem",
  },
  warningIcon: { flexShrink: 0, height: "1rem", marginTop: "0.125rem", width: "1rem" },
  progress: { marginTop: "1.5rem" },
  progressHeader: {
    alignItems: "center",
    display: "flex",
    fontSize: "0.75rem",
    gap: "1rem",
    justifyContent: "space-between",
    lineHeight: "1rem",
  },
  progressLabel: { color: "var(--color-memora-text)", fontWeight: 600 },
  progressPhase: { color: "var(--color-memora-text-soft)" },
  progressTrack: {
    backgroundColor: "var(--color-memora-surface-muted)",
    borderRadius: "9999px",
    height: "0.375rem",
    marginTop: "0.75rem",
    overflow: "hidden",
  },
  progressBar: {
    backgroundColor: "var(--color-memora-olive)",
    borderRadius: "9999px",
    height: "100%",
    transition: "width 200ms",
  },
  runRow: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: "1rem",
    marginTop: "1.75rem",
  },
  runButton: {
    alignItems: "center",
    backgroundColor: { default: "var(--color-memora-primary)", ":hover": "#34332f" },
    borderRadius: "9999px",
    color: "var(--color-memora-surface)",
    display: "inline-flex",
    fontSize: "0.875rem",
    fontWeight: 600,
    gap: "0.5rem",
    outline: "none",
    paddingBlock: "0.625rem",
    paddingInline: "1.25rem",
    ":focus-visible": { outline: "2px solid var(--color-memora-olive-soft)", outlineOffset: 2 },
    ":disabled": { cursor: "not-allowed", opacity: 0.4 },
  },
  privacy: { color: "var(--color-memora-text-soft)", fontSize: "0.75rem", lineHeight: "1.25rem" },
  resultsHeader: {
    alignItems: { default: "stretch", "@media (min-width: 640px)": "flex-end" },
    borderBottomColor: "var(--color-memora-border)",
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    display: "flex",
    flexDirection: { default: "column", "@media (min-width: 640px)": "row" },
    gap: "0.75rem",
    justifyContent: "space-between",
    paddingBlock: "1.25rem",
    paddingInline: "1.5rem",
  },
  runMeta: { color: "var(--color-memora-text-soft)", fontSize: "0.75rem", lineHeight: "1rem" },
  tableScroll: { overflowX: "auto" },
  table: { borderCollapse: "collapse", minWidth: "660px", width: "100%" },
  tableHead: { backgroundColor: "var(--color-memora-surface-soft)" },
  tableHeader: {
    color: "var(--color-memora-text-muted)",
    fontSize: "0.75rem",
    fontWeight: 600,
    lineHeight: "1rem",
    paddingBlock: "0.75rem",
    paddingInline: "1.25rem",
    textAlign: "left",
  },
  metricRow: {
    borderTopColor: "var(--color-memora-border)",
    borderTopStyle: "solid",
    borderTopWidth: 1,
    ":first-child": { borderTopWidth: 0 },
  },
  metricLabel: {
    color: "var(--color-memora-text-muted)",
    fontSize: "0.75rem",
    fontWeight: 500,
    lineHeight: "1rem",
    paddingBlock: "0.75rem",
    paddingInline: "1.25rem",
    textAlign: "left",
    width: "34%",
  },
  metricValue: {
    color: "var(--color-memora-text)",
    fontSize: "0.875rem",
    fontWeight: 600,
    lineHeight: "1.25rem",
    paddingBlock: "0.75rem",
    paddingInline: "1.25rem",
  },
  outputs: {
    borderTopColor: "var(--color-memora-border)",
    borderTopStyle: "solid",
    borderTopWidth: 1,
    display: "grid",
    gridTemplateColumns: {
      default: "minmax(0,1fr)",
      "@media (min-width: 1024px)": "repeat(2,minmax(0,1fr))",
    },
  },
  output: {
    minWidth: 0,
    paddingBlock: "1.25rem",
    paddingInline: { default: "1.25rem", "@media (min-width: 640px)": "1.5rem" },
    borderLeftColor: {
      default: "transparent",
      "@media (min-width: 1024px)": "var(--color-memora-border)",
    },
    borderLeftStyle: "solid",
    borderLeftWidth: { default: 0, "@media (min-width: 1024px)": 1 },
    ":first-child": { borderLeftWidth: 0 },
  },
  outputHeader: {
    alignItems: "flex-start",
    display: "flex",
    gap: "1rem",
    justifyContent: "space-between",
  },
  outputTitle: {
    color: "var(--color-memora-text)",
    fontSize: "0.875rem",
    fontWeight: 600,
    lineHeight: "1.25rem",
  },
  outputMeta: {
    color: "var(--color-memora-text-soft)",
    fontSize: "0.75rem",
    lineHeight: "1rem",
    marginTop: "0.25rem",
  },
  confidence: {
    backgroundColor: "var(--color-memora-surface-muted)",
    borderColor: "var(--color-memora-border)",
    borderRadius: "9999px",
    borderStyle: "solid",
    borderWidth: 1,
    color: "var(--color-memora-text-muted)",
    fontSize: "0.75rem",
    fontWeight: 600,
    lineHeight: "1rem",
    paddingBlock: "0.25rem",
    paddingInline: "0.625rem",
  },
  outputText: {
    backgroundColor: "var(--color-memora-surface-muted)",
    borderRadius: "1rem",
    color: "var(--color-memora-text)",
    fontFamily: '"Noto Sans", "Noto Sans SC", sans-serif',
    fontSize: "0.875rem",
    lineHeight: "1.5rem",
    marginTop: "1.25rem",
    minHeight: "10rem",
    overflow: "auto",
    padding: "1rem",
    whiteSpace: "pre-wrap",
  },
  details: {
    borderTopColor: "var(--color-memora-border)",
    borderTopStyle: "solid",
    borderTopWidth: 1,
    display: "grid",
    fontSize: "0.75rem",
    gap: "0.5rem 1.25rem",
    gridTemplateColumns: "repeat(2,minmax(0,1fr))",
    marginTop: "1rem",
    paddingTop: "1rem",
  },
  detailRow: {
    alignItems: "center",
    display: "flex",
    gap: "0.75rem",
    justifyContent: "space-between",
    minWidth: 0,
  },
  detailKey: {
    color: "var(--color-memora-text-soft)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  detailValue: {
    color: "var(--color-memora-text-muted)",
    fontWeight: 500,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  breakWords: { minWidth: 0, overflowWrap: "anywhere" },
});

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
    <tr {...stylex.props(styles.metricRow)}>
      <th {...stylex.props(styles.metricLabel)}>{label}</th>
      <td {...stylex.props(styles.metricValue)}>{tesseract}</td>
      <td {...stylex.props(styles.metricValue)}>{paddle}</td>
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
    <section {...stylex.props(styles.output)}>
      <div {...stylex.props(styles.outputHeader)}>
        <div>
          <h3 {...stylex.props(styles.outputTitle)}>{label}</h3>
          <p {...stylex.props(styles.outputMeta)}>
            {result?.status === "success"
              ? `${result.reusedSession ? "Warm session" : "Cold session"} · ${result.timing.samples.length} sample${result.timing.samples.length === 1 ? "" : "s"}`
              : "Benchmark output"}
          </p>
        </div>
        {result?.status === "success" ? (
          <span {...stylex.props(styles.confidence)}>
            {formatConfidence(result.confidence)} confidence
          </span>
        ) : null}
      </div>

      {result?.status === "error" ? (
        <div {...stylex.props(styles.warning)}>
          <WarningCircleIcon className={stylex.props(styles.warningIcon).className} />
          <p {...stylex.props(styles.breakWords)}>{result.error}</p>
        </div>
      ) : (
        <pre {...stylex.props(styles.outputText)}>
          {result?.text || "Run the comparison to inspect recognized text."}
        </pre>
      )}

      {result?.status === "success" ? (
        <dl {...stylex.props(styles.details)}>
          {Object.entries(result.details).map(([key, value]) => (
            <div key={key} {...stylex.props(styles.detailRow)}>
              <dt {...stylex.props(styles.detailKey)}>{key}</dt>
              <dd {...stylex.props(styles.detailValue)}>
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
    <div {...stylex.props(styles.root)}>
      <div {...stylex.props(styles.upperGrid)}>
        <section {...stylex.props(styles.panel)}>
          <label
            className={
              stylex.props(styles.dropzone, Boolean(previewUrl) && styles.dropzoneSelected)
                .className
            }
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              selectImage(event.dataTransfer.files[0] ?? null);
            }}
          >
            <input
              type="file"
              accept="image/*"
              className={stylex.props(styles.srOnly).className}
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
                className={stylex.props(styles.previewImage).className}
              />
            ) : (
              <div {...stylex.props(styles.emptyDropzone)}>
                <span {...stylex.props(styles.emptyIconFrame)}>
                  <ImageSquareIcon className={stylex.props(styles.mediumIcon).className} />
                </span>
                <p {...stylex.props(styles.emptyTitle)}>Drop an image here</p>
                <p {...stylex.props(styles.emptyText)}>
                  The same browser-local file is passed to both engines.
                </p>
              </div>
            )}
          </label>

          <div {...stylex.props(styles.fileFooter)}>
            <div {...stylex.props(styles.fileCopy)}>
              <p {...stylex.props(styles.fileName)}>{image?.name ?? "No image selected"}</p>
              <p {...stylex.props(styles.fileMeta)}>
                {image ? formatBytes(image.size) : "PNG, JPEG, or WebP"}
              </p>
            </div>
            <Button
              type="button"
              disabled={isRunning}
              onClick={() => void handleUseSample()}
              className={stylex.props(styles.pillButton).className}
            >
              <UploadSimpleIcon className={stylex.props(styles.icon).className} />
              Use sample
            </Button>
          </div>
        </section>

        <section {...stylex.props(styles.panel, styles.paddedPanel)}>
          <div {...stylex.props(styles.configHeader)}>
            <div>
              <h2 {...stylex.props(styles.title)}>Compare cold start and inference</h2>
              <p {...stylex.props(styles.description)}>
                Engines run sequentially to avoid resource contention. Sessions stay warm until you
                reset them.
              </p>
            </div>
            <Button
              type="button"
              disabled={isRunning}
              onClick={() => void handleResetEngines()}
              className={stylex.props(styles.resetButton).className}
            >
              <ArrowClockwiseIcon className={stylex.props(styles.icon).className} />
              Reset engines
            </Button>
          </div>

          <div {...stylex.props(styles.fields)}>
            <label {...stylex.props(styles.label)}>
              <span {...stylex.props(styles.labelText)}>Tesseract languages</span>
              <select
                value={language}
                disabled={isRunning}
                onChange={(event) => setLanguage(event.target.value as OcrBenchmarkLanguage)}
                className={stylex.props(styles.select).className}
              >
                <option value="eng">English</option>
                <option value="eng-chi-sim">English + Simplified Chinese</option>
              </select>
            </label>

            <label {...stylex.props(styles.label)}>
              <span {...stylex.props(styles.labelText)}>Warm runs</span>
              <select
                value={repeatCount}
                disabled={isRunning}
                onChange={(event) =>
                  setRepeatCount(Number(event.target.value) as (typeof REPEAT_OPTIONS)[number])
                }
                className={stylex.props(styles.select).className}
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
            <div {...stylex.props(styles.warning)}>
              <WarningCircleIcon className={stylex.props(styles.warningIcon).className} />
              <p>{pageError}</p>
            </div>
          ) : null}

          {isRunning && progress ? (
            <div {...stylex.props(styles.progress)} aria-live="polite">
              <div {...stylex.props(styles.progressHeader)}>
                <span {...stylex.props(styles.progressLabel)}>{progress.label}</span>
                <span {...stylex.props(styles.progressPhase)}>
                  {progress.phase === "initializing" ? "Initializing" : "Running"}
                </span>
              </div>
              <div {...stylex.props(styles.progressTrack)}>
                <div
                  {...stylex.props(styles.progressBar)}
                  style={{
                    width: `${Math.max(4, Math.min(100, (progress.progress ?? 0) * 100))}%`,
                  }}
                />
              </div>
            </div>
          ) : null}

          <div {...stylex.props(styles.runRow)}>
            <Button
              type="button"
              disabled={!image || isRunning}
              onClick={() => void handleRun()}
              className={stylex.props(styles.runButton).className}
            >
              <PlayIcon weight="fill" className={stylex.props(styles.icon).className} />
              {isRunning ? "Benchmark running" : "Run comparison"}
            </Button>
            <p {...stylex.props(styles.privacy)}>
              PP-OCRv6 assets use the shared OPFS model cache. Images remain on this device.
            </p>
          </div>
        </section>
      </div>

      <section {...stylex.props(styles.panel)}>
        <div {...stylex.props(styles.resultsHeader)}>
          <div>
            <h2 {...stylex.props(styles.title)}>Timing and recognition output</h2>
          </div>
          <p {...stylex.props(styles.runMeta)}>
            {result
              ? `${result.repeatCount} run${result.repeatCount === 1 ? "" : "s"} · ${new Date(result.completedAt).toLocaleTimeString()}`
              : "Waiting for a benchmark run"}
          </p>
        </div>

        <div {...stylex.props(styles.tableScroll)}>
          <table {...stylex.props(styles.table)}>
            <thead {...stylex.props(styles.tableHead)}>
              <tr>
                <th {...stylex.props(styles.tableHeader)}>Metric</th>
                <th {...stylex.props(styles.tableHeader)}>Tesseract.js 7</th>
                <th {...stylex.props(styles.tableHeader)}>PP-OCRv6 tiny</th>
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

        <div {...stylex.props(styles.outputs)}>
          <EngineOutput result={tesseractResult} fallbackLabel="Tesseract.js 7" />
          <EngineOutput result={paddleResult} fallbackLabel="PP-OCRv6 tiny" />
        </div>
      </section>
    </div>
  );
}
