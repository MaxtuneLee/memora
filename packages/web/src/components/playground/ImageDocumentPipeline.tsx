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
import * as stylex from "@stylexjs/stylex";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Streamdown } from "streamdown";
import "streamdown/styles.css";
import "katex/dist/katex.min.css";

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

const pulse = stylex.keyframes({
  "0%, 100%": { opacity: 1 },
  "50%": { opacity: 0.5 },
});

const styles = stylex.create({
  root: { display: "flex", flexDirection: "column", gap: "1.75rem" },
  layout: {
    display: "grid",
    gap: "1.75rem",
    gridTemplateColumns: {
      default: "minmax(0,1fr)",
      "@media (min-width: 1280px)": "minmax(420px,0.95fr) minmax(560px,1.05fr)",
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
  imagePanel: {
    gridColumnStart: { default: "auto", "@media (min-width: 1280px)": 1 },
    gridRowStart: { default: "auto", "@media (min-width: 1280px)": 1 },
  },
  pipelinePanel: {
    gridColumnStart: { default: "auto", "@media (min-width: 1280px)": 1 },
    gridRowStart: { default: "auto", "@media (min-width: 1280px)": 2 },
    overflow: "visible",
    padding: "1.5rem",
  },
  resultsColumn: {
    display: "flex",
    flexDirection: "column",
    gap: "1.75rem",
    gridColumnStart: { default: "auto", "@media (min-width: 1280px)": 2 },
    gridRow: { default: "auto", "@media (min-width: 1280px)": "1 / span 2" },
  },
  panelHeader: {
    alignItems: "flex-end",
    borderBottomColor: "var(--color-memora-border)",
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    display: "flex",
    flexWrap: "wrap",
    gap: "1rem",
    justifyContent: "space-between",
    paddingBlock: "1.25rem",
    paddingInline: "1.5rem",
  },
  title: {
    color: "var(--color-memora-text-strong)",
    fontFamily: '"IBM Plex Serif", serif',
    fontSize: "1.5rem",
    fontWeight: 500,
    letterSpacing: "-0.025em",
    lineHeight: "2rem",
  },
  secondaryButton: {
    backgroundColor: {
      default: "var(--color-memora-surface)",
      ":hover": "var(--color-memora-surface-muted)",
    },
    borderColor: "var(--color-memora-border)",
    borderRadius: "0.75rem",
    borderStyle: "solid",
    borderWidth: 1,
    color: "var(--color-memora-text-muted)",
    fontSize: "0.75rem",
    fontWeight: 600,
    paddingBlock: "0.5rem",
    paddingInline: "0.75rem",
    transition: "background-color 150ms",
    ":disabled": { opacity: 0.5 },
  },
  previewWrap: { padding: "1.25rem" },
  dropzone: {
    alignItems: "center",
    backgroundColor: "var(--color-memora-surface-soft)",
    borderColor: {
      default: "var(--color-memora-border-soft)",
      ":hover": "var(--color-memora-olive-soft)",
    },
    borderRadius: "24px",
    borderStyle: "dashed",
    borderWidth: 1,
    cursor: "pointer",
    display: "flex",
    justifyContent: "center",
    minHeight: "520px",
    outline: "none",
    overflow: "hidden",
    position: "relative",
    transition: "border-color 150ms",
    ":focus-within": { boxShadow: "0 0 0 2px var(--color-memora-olive-soft)" },
  },
  dropzoneSelected: { backgroundColor: "#ebe7df", borderStyle: "solid", padding: "1rem" },
  srOnly: {
    clip: "rect(0,0,0,0)",
    height: 1,
    margin: -1,
    overflow: "hidden",
    position: "absolute",
    whiteSpace: "nowrap",
    width: 1,
  },
  imageFrame: {
    boxShadow: "0 14px 46px rgba(42,39,33,0.14)",
    maxHeight: "720px",
    maxWidth: "100%",
    overflow: "hidden",
    position: "relative",
  },
  previewImage: { display: "block", maxHeight: "720px", maxWidth: "100%" },
  blockButton: {
    borderStyle: "solid",
    borderWidth: 2,
    position: "absolute",
    transition: "background-color 150ms, border-color 150ms",
    ":hover": { backgroundColor: "rgba(255,255,255,0.2)" },
    ":focus-visible": { outline: "2px solid white" },
  },
  blockSelected: { backgroundColor: "rgba(255,255,255,0.2)", boxShadow: "0 0 0 2px white" },
  blockLabel: {
    borderRadius: "0.25rem 0.25rem 0 0",
    color: "white",
    fontSize: "9px",
    fontWeight: 600,
    left: 0,
    maxWidth: "7rem",
    overflow: "hidden",
    paddingBlock: "0.125rem",
    paddingInline: "0.375rem",
    position: "absolute",
    textOverflow: "ellipsis",
    top: "-1.25rem",
    whiteSpace: "nowrap",
  },
  emptyPreview: { maxWidth: "20rem", paddingInline: "2rem", textAlign: "center" },
  emptyIcon: {
    alignItems: "center",
    backgroundColor: "var(--color-memora-surface-muted)",
    borderRadius: "1rem",
    color: "var(--color-memora-text-muted)",
    display: "flex",
    height: "3rem",
    justifyContent: "center",
    marginInline: "auto",
    width: "3rem",
  },
  icon20: { height: "1.25rem", width: "1.25rem" },
  emptyTitle: {
    color: "var(--color-memora-text)",
    fontSize: "0.875rem",
    fontWeight: 600,
    marginTop: "1rem",
  },
  softCopy: {
    color: "var(--color-memora-text-soft)",
    fontSize: "0.75rem",
    lineHeight: "1.25rem",
    marginTop: "0.5rem",
  },
  panelFooter: {
    alignItems: "center",
    borderTopColor: "var(--color-memora-border)",
    borderTopStyle: "solid",
    borderTopWidth: 1,
    display: "flex",
    flexWrap: "wrap",
    gap: "1rem",
    justifyContent: "space-between",
    paddingBlock: "1.25rem",
    paddingInline: "1.5rem",
  },
  minZero: { minWidth: 0 },
  fileName: {
    color: "var(--color-memora-text)",
    fontSize: "0.875rem",
    fontWeight: 500,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  fileMeta: { color: "var(--color-memora-text-soft)", fontSize: "0.75rem", marginTop: "0.125rem" },
  actions: { alignItems: "center", display: "flex", gap: "0.5rem" },
  iconButton: {
    alignItems: "center",
    backgroundColor: {
      default: "var(--color-memora-surface)",
      ":hover": "var(--color-memora-surface-muted)",
    },
    borderColor: "var(--color-memora-border)",
    borderRadius: "0.75rem",
    borderStyle: "solid",
    borderWidth: 1,
    color: "var(--color-memora-text-muted)",
    display: "flex",
    height: "2.5rem",
    justifyContent: "center",
    transition: "background-color 150ms",
    width: "2.5rem",
    ":disabled": { opacity: 0.5 },
  },
  icon16: { height: "1rem", width: "1rem" },
  runButton: {
    alignItems: "center",
    backgroundColor: {
      default: "var(--color-memora-olive)",
      ":hover": "var(--color-memora-olive-strong)",
    },
    borderRadius: "0.75rem",
    color: "white",
    display: "inline-flex",
    fontSize: "0.875rem",
    fontWeight: 600,
    gap: "0.5rem",
    height: "2.5rem",
    paddingInline: "1rem",
    transition: "background-color 150ms",
    ":disabled": { cursor: "not-allowed", opacity: 0.45 },
  },
  icon14: { height: "0.875rem", width: "0.875rem" },
  sectionHeader: {
    alignItems: "flex-start",
    display: "flex",
    gap: "1.25rem",
    justifyContent: "space-between",
  },
  countBadge: {
    backgroundColor: "var(--color-memora-surface-muted)",
    borderColor: "var(--color-memora-border)",
    borderRadius: "9999px",
    borderStyle: "solid",
    borderWidth: 1,
    color: "var(--color-memora-text-muted)",
    fontSize: "0.6875rem",
    fontWeight: 500,
    paddingBlock: "0.375rem",
    paddingInline: "0.75rem",
  },
  stages: {
    display: "grid",
    gap: "0.5rem",
    gridTemplateColumns: {
      default: "minmax(0,1fr)",
      "@media (min-width: 640px)": "repeat(5,minmax(0,1fr))",
    },
    marginTop: "1.5rem",
  },
  stage: {
    backgroundColor: "var(--color-memora-surface-soft)",
    borderColor: "var(--color-memora-border)",
    borderRadius: "1rem",
    borderStyle: "solid",
    borderWidth: 1,
    padding: "0.75rem",
  },
  stageRunning: {
    backgroundColor: "var(--color-memora-olive-faint)",
    borderColor: "var(--color-memora-olive-soft)",
  },
  stageHeader: { alignItems: "center", display: "flex", gap: "0.5rem" },
  stageIcon: { color: "var(--color-memora-olive)", height: "0.875rem", width: "0.875rem" },
  stageDot: {
    backgroundColor: "var(--color-memora-border-soft)",
    borderRadius: "9999px",
    height: "0.5rem",
    width: "0.5rem",
  },
  stageDotRunning: {
    animationName: pulse,
    animationDuration: "2s",
    animationIterationCount: "infinite",
    backgroundColor: "var(--color-memora-olive)",
  },
  stageName: { color: "var(--color-memora-text)", fontSize: "0.75rem", fontWeight: 600 },
  stageDetail: {
    color: "var(--color-memora-text-soft)",
    fontSize: "0.625rem",
    lineHeight: "1rem",
    marginTop: "0.375rem",
  },
  progress: {
    backgroundColor: "var(--color-memora-surface-muted)",
    borderRadius: "1rem",
    marginTop: "1rem",
    padding: "0.75rem",
  },
  progressHeader: {
    alignItems: "center",
    display: "flex",
    fontSize: "0.75rem",
    gap: "0.75rem",
    justifyContent: "space-between",
  },
  progressLabel: { color: "var(--color-memora-text-muted)", fontWeight: 500 },
  progressValue: { color: "var(--color-memora-text-soft)" },
  track: {
    backgroundColor: "var(--color-memora-surface)",
    borderRadius: "9999px",
    height: "0.375rem",
    marginTop: "0.5rem",
    overflow: "hidden",
  },
  bar: {
    backgroundColor: "var(--color-memora-olive)",
    borderRadius: "9999px",
    height: "100%",
    transition: "width 150ms",
  },
  indeterminate: {
    animationName: pulse,
    animationDuration: "2s",
    animationIterationCount: "infinite",
    width: "33.333333%",
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
    marginTop: "1rem",
    padding: "1rem",
  },
  warningIcon: { flexShrink: 0, height: "1rem", marginTop: "0.125rem", width: "1rem" },
  breakWords: { minWidth: 0, overflowWrap: "anywhere" },
  metrics: {
    display: "grid",
    gap: "0.75rem",
    gridTemplateColumns: {
      default: "repeat(2,minmax(0,1fr))",
      "@media (min-width: 640px)": "repeat(3,minmax(0,1fr))",
    },
    marginTop: "1.25rem",
  },
  metric: {
    backgroundColor: "var(--color-memora-surface-soft)",
    borderRadius: "1rem",
    padding: "0.75rem",
  },
  metricLabel: { color: "var(--color-memora-text-soft)", fontSize: "0.6875rem", fontWeight: 500 },
  metricValue: {
    color: "var(--color-memora-text)",
    fontSize: "0.875rem",
    fontWeight: 600,
    marginTop: "0.25rem",
  },
  metricMeta: {
    color: "var(--color-memora-text-soft)",
    fontSize: "0.625rem",
    marginTop: "0.125rem",
  },
  truncate: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  inspectorEmpty: {
    alignItems: "center",
    borderColor: "var(--color-memora-border-soft)",
    borderRadius: "1rem",
    borderStyle: "dashed",
    borderWidth: 1,
    color: "var(--color-memora-text-soft)",
    display: "flex",
    fontSize: "0.75rem",
    justifyContent: "center",
    lineHeight: "1.25rem",
    minHeight: "9rem",
    paddingInline: "1.25rem",
    textAlign: "center",
  },
  inspector: {
    backgroundColor: "var(--color-memora-surface-soft)",
    borderColor: "var(--color-memora-border)",
    borderRadius: "1rem",
    borderStyle: "solid",
    borderWidth: 1,
    padding: "1rem",
  },
  inspectorHeader: {
    alignItems: "flex-start",
    display: "flex",
    gap: "0.75rem",
    justifyContent: "space-between",
  },
  inspectorTitle: { color: "var(--color-memora-text)", fontSize: "0.875rem", fontWeight: 600 },
  score: {
    backgroundColor: "var(--color-memora-surface-muted)",
    borderRadius: "9999px",
    color: "var(--color-memora-text-muted)",
    fontSize: "0.625rem",
    fontWeight: 600,
    paddingBlock: "0.25rem",
    paddingInline: "0.625rem",
  },
  inspectorCopy: {
    color: "var(--color-memora-text-muted)",
    fontSize: "0.875rem",
    lineHeight: "1.5rem",
    marginTop: "0.75rem",
    whiteSpace: "pre-wrap",
  },
  details: {
    borderTopColor: "var(--color-memora-border)",
    borderTopStyle: "solid",
    borderTopWidth: 1,
    display: "grid",
    fontSize: "0.6875rem",
    gap: "0.5rem",
    gridTemplateColumns: "repeat(2,minmax(0,1fr))",
    marginTop: "1rem",
    paddingTop: "0.75rem",
  },
  detailLabel: { color: "var(--color-memora-text-soft)" },
  detailValue: { color: "var(--color-memora-text)", fontWeight: 500, marginTop: "0.125rem" },
  tabHeader: {
    alignItems: "center",
    borderBottomColor: "var(--color-memora-border)",
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    display: "flex",
    flexWrap: "wrap",
    gap: "0.75rem",
    justifyContent: "space-between",
    paddingBlock: "0.75rem",
    paddingInline: "1rem",
  },
  tabList: {
    backgroundColor: "var(--color-memora-surface-muted)",
    borderRadius: "0.75rem",
    display: "flex",
    gap: "0.25rem",
    padding: "0.25rem",
  },
  tab: {
    alignItems: "center",
    borderRadius: "0.5rem",
    color: "var(--color-memora-text-muted)",
    display: "flex",
    fontSize: "0.75rem",
    fontWeight: 600,
    gap: "0.375rem",
    height: "2rem",
    outline: "none",
    paddingInline: "0.75rem",
    ":is([data-active])": {
      backgroundColor: "var(--color-memora-surface)",
      boxShadow: "0 1px 2px rgba(47,45,40,0.08)",
      color: "var(--color-memora-text)",
    },
  },
  copyButton: {
    alignItems: "center",
    borderColor: "var(--color-memora-border)",
    borderRadius: "0.5rem",
    borderStyle: "solid",
    borderWidth: 1,
    color: "var(--color-memora-text-muted)",
    display: "inline-flex",
    fontSize: "0.75rem",
    fontWeight: 600,
    gap: "0.375rem",
    height: "2rem",
    paddingInline: "0.625rem",
    ":disabled": { opacity: 0.4 },
  },
  tabPanel: { minHeight: "360px", outline: "none", padding: "1.5rem" },
  emptyResult: {
    alignItems: "center",
    color: "var(--color-memora-text-soft)",
    display: "flex",
    fontSize: "0.875rem",
    justifyContent: "center",
    minHeight: "300px",
    textAlign: "center",
  },
  centeredIcon: { height: "1.25rem", marginInline: "auto", width: "1.25rem" },
  emptyResultText: { marginTop: "0.75rem" },
  sourcePanel: { minHeight: "360px", outline: "none" },
  source: {
    backgroundColor: "var(--color-memora-surface-soft)",
    color: "var(--color-memora-text-muted)",
    fontSize: "0.75rem",
    lineHeight: "1.5rem",
    minHeight: "360px",
    overflow: "auto",
    padding: "1.5rem",
    whiteSpace: "pre-wrap",
  },
  blocksSource: { lineHeight: "1.25rem", whiteSpace: "pre" },
  notice: {
    backgroundColor: "var(--color-memora-surface-soft)",
    borderColor: "var(--color-memora-border)",
    borderRadius: "1rem",
    borderStyle: "solid",
    borderWidth: 1,
    color: "var(--color-memora-text-soft)",
    display: "flex",
    fontSize: "0.75rem",
    gap: "0.75rem",
    lineHeight: "1.25rem",
    paddingBlock: "0.75rem",
    paddingInline: "1rem",
  },
});

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
      {...stylex.props(styles.dropzone, Boolean(previewUrl) && styles.dropzoneSelected)}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        onSelectImage(event.dataTransfer.files[0] ?? null);
      }}
    >
      <input
        type="file"
        accept="image/*"
        className={stylex.props(styles.srOnly).className}
        disabled={isRunning}
        onChange={(event) => {
          onSelectImage(event.target.files?.[0] ?? null);
          event.target.value = "";
        }}
      />
      {previewUrl && image ? (
        <div {...stylex.props(styles.imageFrame)}>
          <img src={previewUrl} alt={image.name} {...stylex.props(styles.previewImage)} />
          {result
            ? result.blocks.map((block) => (
                <button
                  key={block.id}
                  type="button"
                  aria-label={`Select ${block.kind} block`}
                  {...stylex.props(
                    styles.blockButton,
                    selectedBlockId === block.id && styles.blockSelected,
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
                    className={stylex.props(styles.blockLabel).className}
                    style={{ background: BLOCK_COLORS[block.kind] ?? BLOCK_COLORS.unknown }}
                  >
                    {block.kind.replaceAll("_", " ")}
                  </span>
                </button>
              ))
            : null}
        </div>
      ) : (
        <div {...stylex.props(styles.emptyPreview)}>
          <span {...stylex.props(styles.emptyIcon)}>
            <ImageSquareIcon className={stylex.props(styles.icon20).className} />
          </span>
          <p {...stylex.props(styles.emptyTitle)}>Drop a document image</p>
          <p {...stylex.props(styles.softCopy)}>
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
      <div {...stylex.props(styles.inspectorEmpty)}>
        Run the pipeline, then select a colored region to inspect its source and coordinates.
      </div>
    );
  }
  return (
    <div {...stylex.props(styles.inspector)}>
      <div {...stylex.props(styles.inspectorHeader)}>
        <div>
          <h4 {...stylex.props(styles.inspectorTitle)}>{block.kind.replaceAll("_", " ")}</h4>
        </div>
        <span {...stylex.props(styles.score)}>{(block.score * 100).toFixed(1)}%</span>
      </div>
      <p {...stylex.props(styles.inspectorCopy)}>
        {block.latex ?? block.text ?? "This region is currently retained as a placeholder."}
      </p>
      <dl {...stylex.props(styles.details)}>
        <div>
          <dt {...stylex.props(styles.detailLabel)}>Class</dt>
          <dd {...stylex.props(styles.detailValue)}>
            {block.classId} · {block.label}
          </dd>
        </div>
        <div>
          <dt {...stylex.props(styles.detailLabel)}>Recognizer</dt>
          <dd {...stylex.props(styles.detailValue)}>{block.recognition}</dd>
        </div>
        <div>
          <dt {...stylex.props(styles.detailLabel)}>Position</dt>
          <dd {...stylex.props(styles.detailValue)}>
            {Math.round(block.rect.x)}, {Math.round(block.rect.y)}
          </dd>
        </div>
        <div>
          <dt {...stylex.props(styles.detailLabel)}>Size</dt>
          <dd {...stylex.props(styles.detailValue)}>
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
    <div {...stylex.props(styles.root)}>
      <div {...stylex.props(styles.layout)}>
        <section {...stylex.props(styles.panel, styles.imagePanel)}>
          <div {...stylex.props(styles.panelHeader)}>
            <div>
              <h2 {...stylex.props(styles.title)}>Inspect the page geometry</h2>
            </div>
            <Button
              onClick={handleUseSample}
              disabled={isRunning}
              className={stylex.props(styles.secondaryButton).className}
            >
              Use sample
            </Button>
          </div>
          <div {...stylex.props(styles.previewWrap)}>
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
          <div {...stylex.props(styles.panelFooter)}>
            <div {...stylex.props(styles.minZero)}>
              <p {...stylex.props(styles.fileName)}>{image?.name ?? "No image selected"}</p>
              <p {...stylex.props(styles.fileMeta)}>
                {image ? formatBytes(image.size) : "Full-page raster image"}
              </p>
            </div>
            <div {...stylex.props(styles.actions)}>
              <Button
                onClick={handleResetModels}
                disabled={isRunning}
                title="Release model sessions"
                className={stylex.props(styles.iconButton).className}
              >
                <ArrowClockwiseIcon className={stylex.props(styles.icon16).className} />
              </Button>
              <Button
                onClick={handleRun}
                disabled={!image || isRunning}
                className={stylex.props(styles.runButton).className}
              >
                <PlayIcon weight="fill" className={stylex.props(styles.icon14).className} />
                {isRunning ? "Running…" : "Run pipeline"}
              </Button>
            </div>
          </div>
        </section>

        <section {...stylex.props(styles.panel, styles.pipelinePanel)}>
          <div {...stylex.props(styles.sectionHeader)}>
            <div>
              <h2 {...stylex.props(styles.title)}>Pipeline</h2>
            </div>
            {result ? (
              <span {...stylex.props(styles.countBadge)}>{result.blocks.length} blocks</span>
            ) : null}
          </div>

          <div {...stylex.props(styles.stages)}>
            {PIPELINE_STAGES.map((stage) => {
              const state = getStageState(stage.id, progress, result, isRunning);
              return (
                <div
                  key={stage.id}
                  {...stylex.props(styles.stage, state === "running" && styles.stageRunning)}
                >
                  <div {...stylex.props(styles.stageHeader)}>
                    {state === "complete" ? (
                      <CheckCircleIcon
                        weight="fill"
                        className={stylex.props(styles.stageIcon).className}
                      />
                    ) : (
                      <span
                        {...stylex.props(
                          styles.stageDot,
                          state === "running" && styles.stageDotRunning,
                        )}
                      />
                    )}
                    <p {...stylex.props(styles.stageName)}>{stage.label}</p>
                  </div>
                  <p {...stylex.props(styles.stageDetail)}>{stage.detail}</p>
                </div>
              );
            })}
          </div>
          {progress ? (
            <div {...stylex.props(styles.progress)}>
              <div {...stylex.props(styles.progressHeader)}>
                <span {...stylex.props(styles.progressLabel)}>{progress.label}</span>
                {progress.progress !== undefined ? (
                  <span {...stylex.props(styles.progressValue)}>
                    {Math.round(progress.progress * 100)}%
                  </span>
                ) : null}
              </div>
              <div {...stylex.props(styles.track)}>
                <div
                  {...stylex.props(
                    styles.bar,
                    progress.progress === undefined && styles.indeterminate,
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
            <div {...stylex.props(styles.warning)}>
              <WarningCircleIcon className={stylex.props(styles.warningIcon).className} />
              <p {...stylex.props(styles.breakWords)}>{error}</p>
            </div>
          ) : null}
          {result ? (
            <dl {...stylex.props(styles.metrics)}>
              <div {...stylex.props(styles.metric)}>
                <dt {...stylex.props(styles.metricLabel)}>Layout</dt>
                <dd {...stylex.props(styles.metricValue)}>
                  {formatMilliseconds(result.timings.layoutMs)}
                </dd>
                <dd {...stylex.props(styles.metricMeta)}>{result.backend.layout}</dd>
              </div>
              <div {...stylex.props(styles.metric)}>
                <dt {...stylex.props(styles.metricLabel)}>Text OCR</dt>
                <dd {...stylex.props(styles.metricValue)}>
                  {formatMilliseconds(result.timings.ocrMs)}
                </dd>
                <dd {...stylex.props(styles.metricMeta, styles.truncate)}>{result.backend.ocr}</dd>
              </div>
              <div {...stylex.props(styles.metric)}>
                <dt {...stylex.props(styles.metricLabel)}>Formula</dt>
                <dd {...stylex.props(styles.metricValue)}>
                  {formatMilliseconds(result.timings.formulaMs)}
                </dd>
                <dd {...stylex.props(styles.metricMeta)}>{result.backend.formula}</dd>
              </div>
              <div {...stylex.props(styles.metric)}>
                <dt {...stylex.props(styles.metricLabel)}>Compose</dt>
                <dd {...stylex.props(styles.metricValue)}>
                  {formatMilliseconds(result.timings.composeMs)}
                </dd>
              </div>
              <div {...stylex.props(styles.metric)}>
                <dt {...stylex.props(styles.metricLabel)}>Total</dt>
                <dd {...stylex.props(styles.metricValue)}>
                  {formatMilliseconds(result.timings.totalMs)}
                </dd>
              </div>
              <div {...stylex.props(styles.metric)}>
                <dt {...stylex.props(styles.metricLabel)}>Image</dt>
                <dd {...stylex.props(styles.metricValue)}>
                  {result.image.width} × {result.image.height}
                </dd>
              </div>
            </dl>
          ) : null}
        </section>

        <div {...stylex.props(styles.resultsColumn)}>
          <BlockInspector block={selectedBlock} />

          <section {...stylex.props(styles.panel)}>
            <Tabs.Root defaultValue="preview">
              <div {...stylex.props(styles.tabHeader)}>
                <Tabs.List className={stylex.props(styles.tabList).className}>
                  <Tabs.Tab value="preview" className={stylex.props(styles.tab).className}>
                    <FileImageIcon className={stylex.props(styles.icon14).className} />
                    Preview
                  </Tabs.Tab>
                  <Tabs.Tab value="source" className={stylex.props(styles.tab).className}>
                    <CodeIcon className={stylex.props(styles.icon14).className} />
                    Markdown
                  </Tabs.Tab>
                  <Tabs.Tab value="blocks" className={stylex.props(styles.tab).className}>
                    <BracketsCurlyIcon className={stylex.props(styles.icon14).className} />
                    Blocks
                  </Tabs.Tab>
                </Tabs.List>
                <Button
                  onClick={handleCopy}
                  disabled={!result?.markdown}
                  className={stylex.props(styles.copyButton).className}
                >
                  <ClipboardIcon className={stylex.props(styles.icon14).className} />
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
              <Tabs.Panel value="preview" className={stylex.props(styles.tabPanel).className}>
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
                  <div {...stylex.props(styles.emptyResult)}>
                    <div>
                      <ScanIcon className={stylex.props(styles.centeredIcon).className} />
                      <p {...stylex.props(styles.emptyResultText)}>
                        Rendered Markdown will appear here.
                      </p>
                    </div>
                  </div>
                )}
              </Tabs.Panel>
              <Tabs.Panel value="source" className={stylex.props(styles.sourcePanel).className}>
                <pre {...stylex.props(styles.source)}>
                  {result?.markdown || "Run the image pipeline to generate Markdown."}
                </pre>
              </Tabs.Panel>
              <Tabs.Panel value="blocks" className={stylex.props(styles.sourcePanel).className}>
                <pre {...stylex.props(styles.source, styles.blocksSource)}>
                  {result
                    ? JSON.stringify(result.blocks, null, 2)
                    : "Run the image pipeline to inspect structured blocks."}
                </pre>
              </Tabs.Panel>
            </Tabs.Root>
          </section>
        </div>
      </div>

      <div {...stylex.props(styles.notice)}>
        <WarningCircleIcon className={stylex.props(styles.warningIcon).className} />
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
