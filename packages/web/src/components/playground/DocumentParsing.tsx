import { Button } from "@base-ui/react/button";
import { Tabs } from "@base-ui/react/tabs";
import {
  ArrowClockwiseIcon,
  CheckCircleIcon,
  ClipboardIcon,
  CodeIcon,
  FileImageIcon,
  FileSearchIcon,
  PlayIcon,
  ScanIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { createInstance } from "i18next";
import * as stylex from "@stylexjs/stylex";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  SlideCanvas,
  type PowerPointViewerHandle,
  useViewerBuildingBlocks,
} from "pptx-react-viewer";
import { keyToLabel, translationsEn } from "pptx-react-viewer/i18n";
import "@/styles/pptxViewer.css";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { Streamdown } from "streamdown";

import { formatBytes } from "@/lib/format";
import { tokens } from "../../styles/stylex.stylex";
import {
  getDocumentParseErrorMessage,
  getSupportedDocumentKind,
  parseDocumentFile,
  type DocumentParseProgress,
  type ParsedDocument,
  type ParsedDocxDocument,
  type ParsedPdfPage,
  type ParsedPptxImage,
  type ParsedPptxSlide,
} from "@/lib/playground/documentParsing";
import {
  ImageDocumentPipelineSession,
  type ImageDocumentPipelineProgress,
} from "@/lib/playground/imageDocumentPipeline";
import {
  MEMORA_STREAMDOWN_CLASS_NAME,
  MEMORA_STREAMDOWN_CONTROLS,
  MEMORA_STREAMDOWN_PLUGINS,
  MEMORA_STREAMDOWN_THEME,
} from "@/lib/streamdown";

const formatMilliseconds = (value: number): string => {
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10_000 ? 1 : 2)} s`;
  return `${Math.round(value)} ms`;
};

const DOCUMENT_FILE_INPUT_ID = "playground-document-file";

const pulse = stylex.keyframes({ "0%, 100%": { opacity: 1 }, "50%": { opacity: 0.5 } });

const styles = stylex.create({
  visualError: {
    alignItems: "center",
    backgroundColor: tokens.surface,
    borderRadius: "0.75rem",
    color: tokens.warningText,
    display: "flex",
    fontSize: "0.875rem",
    height: "540px",
    justifyContent: "center",
    lineHeight: "1.5rem",
    paddingInline: "2rem",
    textAlign: "center",
    width: "100%",
  },
  visualPreview: {
    backgroundColor: tokens.surface,
    borderRadius: "0.75rem",
    height: "540px",
    overflow: "auto",
    width: "100%",
  },
  minFullHeight: { minHeight: "100%" },
  // ponytail: the PPTX viewer renders a third-party slide surface on a fixed dark canvas
  // (like a video player chrome), so its message/error text stays fixed light/red for
  // contrast on that canvas regardless of app theme — justified "media artwork" exception.
  viewerMessage: {
    alignItems: "center",
    color: "rgba(255,255,255,0.7)",
    display: "flex",
    fontSize: "0.875rem",
    height: "100%",
    justifyContent: "center",
  },
  viewerError: {
    color: "#fecaca",
    lineHeight: "1.5rem",
    paddingInline: "2rem",
    textAlign: "center",
  },
  pptxViewer: {
    backgroundColor: "#191919",
    borderColor: tokens.border,
    borderRadius: "0.75rem",
    borderStyle: "solid",
    borderWidth: 1,
    height: "540px",
    overflow: "hidden",
    width: "100%",
  },
  stack5: { display: "flex", flexDirection: "column", gap: "1.25rem" },
  stack6: { display: "flex", flexDirection: "column", gap: "1.5rem" },
  comparisonGrid: {
    borderColor: tokens.border,
    borderRadius: "1rem",
    borderStyle: "solid",
    borderWidth: 1,
    display: "grid",
    gridTemplateColumns: {
      default: "minmax(0,1fr)",
      "@media (min-width: 768px)": "repeat(2,minmax(0,1fr))",
    },
    overflow: "hidden",
  },
  comparisonSection: { padding: "1.25rem" },
  comparisonFirst: {
    borderRightColor: {
      default: "transparent",
      "@media (min-width: 768px)": tokens.border,
    },
    borderRightStyle: "solid",
    borderRightWidth: { default: 0, "@media (min-width: 768px)": 1 },
  },
  headingSmall: { color: tokens.text, fontSize: "0.875rem", fontWeight: 600 },
  softDescription: {
    color: tokens.textSoft,
    fontSize: "0.75rem",
    lineHeight: "1.25rem",
    marginTop: "0.25rem",
  },
  metrics: {
    display: "grid",
    gap: "0.75rem",
    gridTemplateColumns: "repeat(2,minmax(0,1fr))",
    marginTop: "1.25rem",
  },
  metric: {
    backgroundColor: tokens.surfaceSoft,
    borderRadius: "0.75rem",
    padding: "0.75rem",
  },
  metricLabel: { color: tokens.textSoft, fontSize: "0.6875rem" },
  metricValue: {
    color: tokens.text,
    fontSize: "0.875rem",
    fontWeight: 600,
    marginTop: "0.25rem",
  },
  wrapRow: { alignItems: "center", display: "flex", flexWrap: "wrap", gap: "0.5rem" },
  experimental: {
    backgroundColor: tokens.warningSurface,
    borderColor: tokens.warningBorder,
    borderRadius: "9999px",
    borderStyle: "solid",
    borderWidth: 1,
    color: tokens.warningText,
    fontSize: "0.625rem",
    fontWeight: 500,
    paddingBlock: "0.125rem",
    paddingInline: "0.5rem",
  },
  warningMessage: {
    backgroundColor: tokens.warningSurface,
    borderRadius: "0.75rem",
    color: tokens.warningText,
    fontSize: "0.75rem",
    lineHeight: "1.25rem",
    marginTop: "1.25rem",
    padding: "0.75rem",
  },
  structureGrid: {
    display: "grid",
    gap: "1.25rem",
    gridTemplateColumns: {
      default: "minmax(0,1fr)",
      "@media (min-width: 1024px)": "minmax(0,0.8fr) minmax(0,1.2fr)",
    },
  },
  sectionLabel: { color: tokens.textMuted, fontSize: "0.75rem", fontWeight: 500 },
  chips: { display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "0.5rem" },
  chip: {
    backgroundColor: tokens.surfaceSoft,
    borderColor: tokens.border,
    borderRadius: "0.5rem",
    borderStyle: "solid",
    borderWidth: 1,
    color: tokens.textMuted,
    fontSize: "0.6875rem",
    paddingBlock: "0.25rem",
    paddingInline: "0.5rem",
  },
  softText12: { color: tokens.textSoft, fontSize: "0.75rem" },
  softParagraph: {
    color: tokens.textSoft,
    fontSize: "0.75rem",
    lineHeight: "1.25rem",
    marginTop: "0.5rem",
  },
  warningText: {
    color: tokens.warningText,
    fontSize: "0.875rem",
    lineHeight: "1.5rem",
  },
  contentHeader: {
    alignItems: "center",
    borderBottomColor: tokens.border,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    display: "flex",
    flexWrap: "wrap",
    gap: "0.75rem",
    justifyContent: "space-between",
    paddingBottom: "1rem",
  },
  warningInline: {
    backgroundColor: tokens.warningSurface,
    borderRadius: "0.75rem",
    color: tokens.warningText,
    fontSize: "0.75rem",
    lineHeight: "1.25rem",
    marginTop: "1rem",
    paddingBlock: "0.5rem",
    paddingInline: "0.75rem",
  },
  codeTree: {
    backgroundColor: tokens.surfaceSoft,
    borderRadius: "0.75rem",
    color: tokens.textMuted,
    fontSize: "0.75rem",
    lineHeight: "1.5rem",
    marginTop: "1rem",
    maxHeight: "560px",
    overflow: "auto",
    padding: "1rem",
    whiteSpace: "pre-wrap",
  },
  warningList: {
    backgroundColor: tokens.warningSurface,
    borderRadius: "0.75rem",
    color: tokens.warningText,
    display: "flex",
    flexDirection: "column",
    fontSize: "0.75rem",
    gap: "0.25rem",
    lineHeight: "1.25rem",
    marginTop: "1rem",
    paddingBlock: "0.5rem",
    paddingInline: "0.75rem",
  },
  streamdownSpacing: { marginTop: "1.25rem" },
  emptyMarkdown: {
    color: tokens.textSoft,
    fontSize: "0.875rem",
    lineHeight: "1.5rem",
    marginTop: "1.25rem",
  },
  dropzone: {
    alignItems: "center",
    backgroundColor: tokens.surfaceSoft,
    borderColor: tokens.borderSoft,
    borderRadius: "24px",
    borderStyle: "dashed",
    borderWidth: 1,
    display: "flex",
    justifyContent: "center",
    minHeight: "560px",
    outline: "none",
    overflow: "hidden",
    position: "relative",
    transition: "border-color 150ms",
    ":focus-within": { boxShadow: `0 0 0 2px ${tokens.oliveSoft}` },
  },
  dropzoneResult: {
    backgroundColor: tokens.surfaceMuted,
    borderStyle: "solid",
    padding: "0.75rem",
  },
  srOnly: {
    clip: "rect(0,0,0,0)",
    height: 1,
    margin: -1,
    overflow: "hidden",
    position: "absolute",
    whiteSpace: "nowrap",
    width: 1,
  },
  pdfFrame: {
    backgroundColor: tokens.surface,
    borderRadius: "0.75rem",
    height: "540px",
    width: "100%",
  },
  dropLabel: {
    cursor: "pointer",
    maxWidth: "20rem",
    outline: "none",
    paddingInline: "2rem",
    textAlign: "center",
    ":focus-visible": { boxShadow: `0 0 0 2px ${tokens.oliveSoft}` },
  },
  dropIcon: {
    alignItems: "center",
    backgroundColor: tokens.surfaceMuted,
    borderRadius: "1rem",
    color: tokens.textMuted,
    display: "flex",
    height: "3rem",
    justifyContent: "center",
    marginInline: "auto",
    width: "3rem",
  },
  icon20: { height: "1.25rem", width: "1.25rem" },
  dropTitle: {
    color: tokens.text,
    fontSize: "0.875rem",
    fontWeight: 600,
    marginTop: "1rem",
  },
  dropCopy: {
    color: tokens.textSoft,
    fontSize: "0.75rem",
    lineHeight: "1.25rem",
    marginTop: "0.5rem",
  },
  inspectorEmpty: {
    alignItems: "center",
    borderColor: tokens.borderSoft,
    borderRadius: "1rem",
    borderStyle: "dashed",
    borderWidth: 1,
    color: tokens.textSoft,
    display: "flex",
    fontSize: "0.75rem",
    justifyContent: "center",
    lineHeight: "1.25rem",
    minHeight: "10rem",
    paddingInline: "1.25rem",
    textAlign: "center",
  },
  inspector: {
    backgroundColor: tokens.surfaceSoft,
    borderColor: tokens.border,
    borderRadius: "1rem",
    borderStyle: "solid",
    borderWidth: 1,
    padding: "1rem",
  },
  rowBetween: {
    alignItems: "flex-start",
    display: "flex",
    gap: "0.75rem",
    justifyContent: "space-between",
  },
  inspectorMeta: {
    color: tokens.textSoft,
    fontSize: "0.75rem",
    marginTop: "0.25rem",
  },
  badge: {
    borderRadius: "9999px",
    fontSize: "0.625rem",
    fontWeight: 600,
    paddingBlock: "0.25rem",
    paddingInline: "0.625rem",
  },
  badgeSuccess: {
    backgroundColor: tokens.selected,
    color: tokens.oliveText,
  },
  badgeWarning: {
    backgroundColor: tokens.warningSurface,
    color: tokens.warningText,
  },
  inspectorDetails: {
    borderTopColor: tokens.border,
    borderTopStyle: "solid",
    borderTopWidth: 1,
    display: "grid",
    fontSize: "0.6875rem",
    gap: "0.5rem",
    gridTemplateColumns: "repeat(2,minmax(0,1fr))",
    marginTop: "1rem",
    paddingTop: "0.75rem",
  },
  detailLabel: { color: tokens.textSoft },
  detailValue: { color: tokens.text, fontWeight: 500, marginTop: "0.125rem" },
  pagination: {
    borderTopColor: tokens.border,
    borderTopStyle: "solid",
    borderTopWidth: 1,
    marginTop: "1rem",
    paddingTop: "0.75rem",
  },
  paginationLabel: {
    color: tokens.textSoft,
    fontSize: "0.6875rem",
    fontWeight: 500,
  },
  pageList: {
    display: "flex",
    flexWrap: "wrap",
    gap: "0.375rem",
    marginTop: "0.5rem",
    maxHeight: "6rem",
    overflowY: "auto",
    paddingRight: "0.25rem",
  },
  pageButton: {
    borderRadius: "0.5rem",
    fontSize: "0.6875rem",
    fontWeight: 600,
    height: "1.75rem",
    outline: "none",
    transition: "background-color 150ms",
    width: "1.75rem",
    ":focus-visible": { boxShadow: `0 0 0 2px ${tokens.oliveSoft}` },
  },
  pageActive: { backgroundColor: tokens.olive, color: tokens.selectionText },
  pageIdle: {
    backgroundColor: {
      default: tokens.surface,
      ":hover": tokens.hover,
    },
    color: tokens.textMuted,
  },
  thumbnailLoading: {
    animationName: pulse,
    animationDuration: "2s",
    animationIterationCount: "infinite",
    aspectRatio: "16 / 9",
    backgroundColor: tokens.surfaceMuted,
    borderRadius: "0.75rem",
  },
  thumbnail: {
    aspectRatio: "16 / 9",
    borderRadius: "0.75rem",
    objectFit: "contain",
    width: "100%",
  },
  parsedEmpty: {
    alignItems: "center",
    color: tokens.textSoft,
    display: "flex",
    fontSize: "0.875rem",
    justifyContent: "center",
    minHeight: "300px",
    textAlign: "center",
  },
  parsedTitle: { color: tokens.textMuted, fontSize: "0.75rem", fontWeight: 600 },
  preText: {
    color: tokens.textMuted,
    fontSize: "0.875rem",
    lineHeight: "1.75rem",
    marginTop: "0.75rem",
    whiteSpace: "pre-wrap",
  },
  inset: {
    backgroundColor: tokens.surfaceSoft,
    borderColor: tokens.border,
    borderRadius: "1rem",
    borderStyle: "solid",
    borderWidth: 1,
    padding: "1rem",
  },
  list: {
    color: tokens.textMuted,
    display: "flex",
    flexDirection: "column",
    fontSize: "0.875rem",
    gap: "0.5rem",
    lineHeight: "1.5rem",
    marginTop: "0.75rem",
  },
  imageGrid: {
    display: "grid",
    gap: "1rem",
    gridTemplateColumns: {
      default: "minmax(0,1fr)",
      "@media (min-width: 640px)": "repeat(2,minmax(0,1fr))",
      "@media (min-width: 1280px)": "repeat(3,minmax(0,1fr))",
    },
    marginTop: "0.75rem",
  },
  imageCard: {
    backgroundColor: tokens.surfaceSoft,
    borderColor: tokens.border,
    borderRadius: "1rem",
    borderStyle: "solid",
    borderWidth: 1,
    overflow: "hidden",
    padding: "0.75rem",
  },
  imageInfo: {
    alignItems: "flex-start",
    display: "flex",
    gap: "0.75rem",
    justifyContent: "space-between",
    marginTop: "0.75rem",
  },
  minZero: { minWidth: 0 },
  imageName: {
    color: tokens.text,
    fontSize: "0.75rem",
    fontWeight: 600,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  imageType: {
    color: tokens.textSoft,
    fontSize: "0.6875rem",
    marginTop: "0.25rem",
  },
  imageButton: {
    backgroundColor: tokens.surface,
    borderColor: tokens.border,
    borderRadius: "0.5rem",
    borderStyle: "solid",
    borderWidth: 1,
    color: tokens.textMuted,
    flexShrink: 0,
    fontSize: "0.6875rem",
    fontWeight: 600,
    paddingBlock: "0.375rem",
    paddingInline: "0.5rem",
    ":disabled": { opacity: 0.45 },
  },
  imageOcr: {
    backgroundColor: tokens.surface,
    borderRadius: "0.75rem",
    color: tokens.textMuted,
    fontSize: "0.6875rem",
    lineHeight: "1.25rem",
    marginTop: "0.75rem",
    maxHeight: "7rem",
    overflow: "auto",
    padding: "0.75rem",
    whiteSpace: "pre-wrap",
  },
  markdownHeader: {
    borderBottomColor: tokens.border,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    paddingBottom: "1rem",
  },
  root: { display: "flex", flexDirection: "column", gap: "1.75rem" },
  topGrid: {
    display: "grid",
    gap: "1.75rem",
    gridTemplateColumns: {
      default: "minmax(0,1fr)",
      "@media (min-width: 1280px)": "minmax(460px,1.1fr) minmax(380px,0.9fr)",
    },
  },
  panel: {
    backgroundColor: tokens.surface,
    borderColor: tokens.border,
    borderRadius: "28px",
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: "0 1px 3px rgb(0 0 0 / 0.08)",
    overflow: "hidden",
  },
  panelHeader: {
    alignItems: "flex-end",
    borderBottomColor: tokens.border,
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
    color: tokens.textStrong,
    fontFamily: '"IBM Plex Serif", serif',
    fontSize: "1.5rem",
    fontWeight: 500,
    letterSpacing: "-0.025em",
    lineHeight: "2rem",
  },
  subtitle: {
    color: tokens.textMuted,
    fontSize: "0.875rem",
    marginTop: "0.375rem",
  },
  parsedBadge: {
    alignItems: "center",
    backgroundColor: tokens.surfaceMuted,
    borderColor: tokens.border,
    borderRadius: "9999px",
    borderStyle: "solid",
    borderWidth: 1,
    color: tokens.textMuted,
    display: "inline-flex",
    fontSize: "0.6875rem",
    fontWeight: 500,
    gap: "0.375rem",
    paddingBlock: "0.375rem",
    paddingInline: "0.75rem",
  },
  icon14Olive: { color: tokens.olive, height: "0.875rem", width: "0.875rem" },
  icon14: { height: "0.875rem", width: "0.875rem" },
  chooseFile: {
    backgroundColor: {
      default: tokens.surface,
      ":hover": tokens.surfaceMuted,
    },
    borderColor: tokens.border,
    borderRadius: "0.75rem",
    borderStyle: "solid",
    borderWidth: 1,
    color: tokens.textMuted,
    cursor: "pointer",
    fontSize: "0.75rem",
    fontWeight: 600,
    paddingBlock: "0.5rem",
    paddingInline: "0.75rem",
    transition: "background-color 150ms",
    ":focus-within": { boxShadow: `0 0 0 2px ${tokens.oliveSoft}` },
  },
  previewPadding: { padding: "1.25rem" },
  panelFooter: {
    alignItems: "center",
    borderTopColor: tokens.border,
    borderTopStyle: "solid",
    borderTopWidth: 1,
    display: "flex",
    flexWrap: "wrap",
    gap: "1rem",
    justifyContent: "space-between",
    paddingBlock: "1.25rem",
    paddingInline: "1.5rem",
  },
  fileName: {
    color: tokens.text,
    fontSize: "0.875rem",
    fontWeight: 500,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  fileMeta: { color: tokens.textSoft, fontSize: "0.75rem", marginTop: "0.125rem" },
  actions: { alignItems: "center", display: "flex", gap: "0.5rem" },
  iconButton: {
    alignItems: "center",
    backgroundColor: {
      default: tokens.surface,
      ":hover": tokens.surfaceMuted,
    },
    borderColor: tokens.border,
    borderRadius: "0.75rem",
    borderStyle: "solid",
    borderWidth: 1,
    color: tokens.textMuted,
    display: "flex",
    height: "2.5rem",
    justifyContent: "center",
    width: "2.5rem",
    ":disabled": { opacity: 0.5 },
  },
  icon16: { height: "1rem", width: "1rem" },
  primaryButton: {
    alignItems: "center",
    backgroundColor: {
      default: tokens.olive,
      ":hover": `color-mix(in srgb, ${tokens.olive} 86%, ${tokens.surface})`,
    },
    borderRadius: "0.75rem",
    color: tokens.selectionText,
    display: "inline-flex",
    fontSize: "0.875rem",
    fontWeight: 600,
    gap: "0.5rem",
    height: "2.5rem",
    paddingInline: "1rem",
    ":disabled": { cursor: "not-allowed", opacity: 0.45 },
  },
  rightStack: { display: "flex", flexDirection: "column", gap: "1.75rem" },
  statusPanel: { overflow: "visible", padding: "1.5rem" },
  progress: {
    backgroundColor: tokens.surfaceMuted,
    borderRadius: "1rem",
    marginTop: "1.25rem",
    padding: "1rem",
  },
  progressRow: {
    alignItems: "center",
    color: tokens.textMuted,
    display: "flex",
    fontSize: "0.875rem",
    fontWeight: 500,
    gap: "0.5rem",
  },
  pulseDot: {
    animationName: pulse,
    animationDuration: "2s",
    animationIterationCount: "infinite",
    backgroundColor: tokens.olive,
    borderRadius: "9999px",
    flexShrink: 0,
    height: "0.5rem",
    width: "0.5rem",
  },
  progressMeta: {
    color: tokens.textSoft,
    fontSize: "0.75rem",
    marginTop: "0.5rem",
  },
  statusMetrics: {
    display: "grid",
    gap: "0.75rem",
    gridTemplateColumns: {
      default: "minmax(0,1fr)",
      "@media (min-width: 640px)": "repeat(2,minmax(0,1fr))",
    },
    marginTop: "1.25rem",
  },
  statusEmpty: {
    color: tokens.textSoft,
    fontSize: "0.875rem",
    lineHeight: "1.5rem",
    marginTop: "1rem",
  },
  errorBox: {
    backgroundColor: tokens.warningSurface,
    borderColor: tokens.warningBorder,
    borderRadius: "1rem",
    borderStyle: "solid",
    borderWidth: 1,
    color: tokens.warningText,
    display: "flex",
    fontSize: "0.875rem",
    gap: "0.75rem",
    marginTop: "1rem",
    padding: "1rem",
  },
  warningIcon: { flexShrink: 0, height: "1rem", marginTop: "0.125rem", width: "1rem" },
  breakWords: { minWidth: 0, overflowWrap: "anywhere" },
  notesBox: {
    backgroundColor: tokens.warningSurface,
    borderColor: tokens.warningBorder,
    borderRadius: "1rem",
    borderStyle: "solid",
    borderWidth: 1,
    marginTop: "1rem",
    padding: "1rem",
  },
  notesHeader: {
    color: tokens.warningText,
    display: "flex",
    fontSize: "0.875rem",
    fontWeight: 500,
    gap: "0.5rem",
  },
  notesList: {
    color: tokens.warningText,
    display: "flex",
    flexDirection: "column",
    fontSize: "0.75rem",
    gap: "0.375rem",
    lineHeight: "1.25rem",
    marginTop: "0.5rem",
    paddingLeft: "1.5rem",
  },
  tabsHeader: {
    alignItems: "center",
    borderBottomColor: tokens.border,
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
    backgroundColor: tokens.surfaceMuted,
    borderRadius: "0.75rem",
    display: "flex",
    gap: "0.25rem",
    padding: "0.25rem",
  },
  tab: {
    alignItems: "center",
    borderRadius: "0.5rem",
    color: tokens.textMuted,
    display: "flex",
    fontSize: "0.75rem",
    fontWeight: 600,
    gap: "0.375rem",
    height: "2rem",
    outline: "none",
    paddingInline: "0.75rem",
    ":is([data-active])": {
      backgroundColor: tokens.surface,
      boxShadow: "0 1px 2px rgb(0 0 0 / 0.08)",
      color: tokens.text,
    },
  },
  copyButton: {
    alignItems: "center",
    borderColor: tokens.border,
    borderRadius: "0.5rem",
    borderStyle: "solid",
    borderWidth: 1,
    color: tokens.textMuted,
    display: "inline-flex",
    fontSize: "0.75rem",
    fontWeight: 600,
    gap: "0.375rem",
    height: "2rem",
    paddingInline: "0.625rem",
    ":disabled": { opacity: 0.4 },
  },
  tabPanel: { minHeight: "360px", outline: "none", padding: "1.5rem" },
  plainPanel: { minHeight: "360px", outline: "none" },
  source: {
    backgroundColor: tokens.surfaceSoft,
    color: tokens.textMuted,
    fontSize: "0.75rem",
    lineHeight: "1.5rem",
    minHeight: "360px",
    overflow: "auto",
    padding: "1.5rem",
    whiteSpace: "pre-wrap",
  },
  parsedText: {
    color: tokens.textMuted,
    fontSize: "0.875rem",
    lineHeight: "1.75rem",
    whiteSpace: "pre-wrap",
  },
  emptyIcon: { height: "1.25rem", marginInline: "auto", width: "1.25rem" },
  emptyText: { marginTop: "0.75rem" },
  fallbackText: { color: tokens.textSoft, fontSize: "0.875rem" },
  notice: {
    backgroundColor: tokens.surfaceSoft,
    borderColor: tokens.border,
    borderRadius: "1rem",
    borderStyle: "solid",
    borderWidth: 1,
    color: tokens.textSoft,
    display: "flex",
    fontSize: "0.75rem",
    gap: "0.75rem",
    lineHeight: "1.25rem",
    paddingBlock: "0.75rem",
    paddingInline: "1rem",
  },
});

const pptxViewerI18n = createInstance();

void pptxViewerI18n.use(initReactI18next).init({
  lng: "en",
  fallbackLng: "en",
  resources: { en: { translation: translationsEn } },
  interpolation: { escapeValue: false },
  parseMissingKeyHandler: keyToLabel,
  react: { useSuspense: false },
});

const getPageSourceLabel = (page: ParsedPdfPage): string =>
  page.source === "text" ? "PDF text layer" : "Local OCR";

interface DocumentPreviewProps {
  file: File | null;
  result: ParsedDocument | null;
  pdfUrl: string | null;
  selectedPage: ParsedPdfPage | null;
  selectedPptxSlide: ParsedPptxSlide | null;
  isRunning: boolean;
  onSelectFile: (file: File | null) => void;
  onPptxSlideChange: (slideNumber: number) => void;
}

interface DocxVisualPreviewProps {
  file: File;
}

function DocxVisualPreview({ file }: DocxVisualPreviewProps) {
  const bodyContainerRef = useRef<HTMLDivElement>(null);
  const styleContainerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const bodyContainer = bodyContainerRef.current;
    const styleContainer = styleContainerRef.current;
    if (!bodyContainer || !styleContainer) return;

    let disposed = false;
    bodyContainer.replaceChildren();
    styleContainer.replaceChildren();
    setError(null);

    void (async () => {
      try {
        const { renderAsync } = await import("docx-preview");
        if (disposed) return;

        await renderAsync(file, bodyContainer, styleContainer, {
          breakPages: true,
          className: "memora-docx-preview",
          ignoreHeight: true,
          ignoreWidth: true,
          renderAltChunks: false,
          renderComments: false,
          useBase64URL: true,
        });
      } catch (reason) {
        if (!disposed) {
          setError(reason instanceof Error ? reason.message : "Unable to render this DOCX file.");
        }
      }
    })();

    return () => {
      disposed = true;
      bodyContainer.replaceChildren();
      styleContainer.replaceChildren();
    };
  }, [file]);

  if (error) {
    return (
      <div {...stylex.props(styles.visualError)}>DOCX preview could not be rendered: {error}</div>
    );
  }

  return (
    <div {...stylex.props(styles.visualPreview)}>
      <div ref={styleContainerRef} />
      <div ref={bodyContainerRef} className={stylex.props(styles.minFullHeight).className} />
    </div>
  );
}

interface PptxVisualPreviewProps {
  content: Uint8Array;
  activeSlideNumber: number;
  onActiveSlideChange: (slideNumber: number) => void;
}

function PptxSlideCanvas({
  content,
  activeSlideNumber,
  onActiveSlideChange,
}: PptxVisualPreviewProps) {
  const handleRef = useRef<PowerPointViewerHandle>(null);
  const { canvasProps, error, loading } = useViewerBuildingBlocks({
    content,
    canEdit: false,
    autosaveEnabled: false,
    handle: handleRef,
    onActiveSlideChange: (slideIndex) => onActiveSlideChange(slideIndex + 1),
  });

  useEffect(() => {
    if (!loading && !error) handleRef.current?.goTo(activeSlideNumber - 1);
  }, [activeSlideNumber, error, loading]);

  if (loading) {
    return <div {...stylex.props(styles.viewerMessage)}>Rendering slides…</div>;
  }
  if (error) {
    return (
      <div {...stylex.props(styles.viewerMessage, styles.viewerError)}>
        PPTX preview could not be rendered: {error}
      </div>
    );
  }
  return <SlideCanvas {...canvasProps} />;
}

function PptxVisualPreview({
  content,
  activeSlideNumber,
  onActiveSlideChange,
}: PptxVisualPreviewProps) {
  return (
    <div {...stylex.props(styles.pptxViewer)}>
      <I18nextProvider i18n={pptxViewerI18n}>
        <PptxSlideCanvas
          content={content}
          activeSlideNumber={activeSlideNumber}
          onActiveSlideChange={onActiveSlideChange}
        />
      </I18nextProvider>
    </div>
  );
}

function DocxParserComparison({ document }: { document: ParsedDocxDocument }) {
  const parser = document.docxPreviewParser;

  return (
    <div {...stylex.props(styles.stack5)}>
      <div {...stylex.props(styles.comparisonGrid)}>
        <section {...stylex.props(styles.comparisonSection, styles.comparisonFirst)}>
          <p {...stylex.props(styles.headingSmall)}>Mammoth</p>
          <p {...stylex.props(styles.softDescription)}>
            Stable semantic HTML and plain-text extraction used by the document pipeline.
          </p>
          <dl {...stylex.props(styles.metrics)}>
            <div {...stylex.props(styles.metric)}>
              <dt {...stylex.props(styles.metricLabel)}>Text</dt>
              <dd {...stylex.props(styles.metricValue)}>
                {document.text.length.toLocaleString()} chars
              </dd>
            </div>
            <div {...stylex.props(styles.metric)}>
              <dt {...stylex.props(styles.metricLabel)}>Semantic HTML</dt>
              <dd {...stylex.props(styles.metricValue)}>
                {document.html.length.toLocaleString()} chars
              </dd>
            </div>
          </dl>
        </section>

        <section {...stylex.props(styles.comparisonSection)}>
          <div {...stylex.props(styles.wrapRow)}>
            <p {...stylex.props(styles.headingSmall)}>docx-preview.parseAsync</p>
            <span {...stylex.props(styles.experimental)}>Experimental</span>
          </div>
          <p {...stylex.props(styles.softDescription)}>
            Internal document structure used here only for comparison and formula diagnostics.
          </p>
          {parser.status === "available" ? (
            <dl {...stylex.props(styles.metrics)}>
              <div {...stylex.props(styles.metric)}>
                <dt {...stylex.props(styles.metricLabel)}>Math expressions</dt>
                <dd {...stylex.props(styles.metricValue)}>{parser.mathExpressionCount}</dd>
              </div>
              <div {...stylex.props(styles.metric)}>
                <dt {...stylex.props(styles.metricLabel)}>Body nodes</dt>
                <dd {...stylex.props(styles.metricValue)}>
                  {parser.bodyNodeCount.toLocaleString()}
                </dd>
              </div>
              <div {...stylex.props(styles.metric)}>
                <dt {...stylex.props(styles.metricLabel)}>Package parts</dt>
                <dd {...stylex.props(styles.metricValue)}>{parser.partCount}</dd>
              </div>
              <div {...stylex.props(styles.metric)}>
                <dt {...stylex.props(styles.metricLabel)}>Inspection time</dt>
                <dd {...stylex.props(styles.metricValue)}>
                  {formatMilliseconds(parser.elapsedMs)}
                </dd>
              </div>
              <div {...stylex.props(styles.metric)}>
                <dt {...stylex.props(styles.metricLabel)}>Markdown</dt>
                <dd {...stylex.props(styles.metricValue)}>
                  {parser.markdown.length.toLocaleString()} chars
                </dd>
              </div>
            </dl>
          ) : (
            <p {...stylex.props(styles.warningMessage)}>
              parseAsync could not inspect this file: {parser.error}
            </p>
          )}
        </section>
      </div>

      <div {...stylex.props(styles.structureGrid)}>
        <section>
          <p {...stylex.props(styles.sectionLabel)}>Detected node types</p>
          <div {...stylex.props(styles.chips)}>
            {parser.nodeTypes.length ? (
              parser.nodeTypes.slice(0, 12).map((entry) => (
                <span key={entry.type} {...stylex.props(styles.chip)}>
                  {entry.type} · {entry.count}
                </span>
              ))
            ) : (
              <span {...stylex.props(styles.softText12)}>No structure is available.</span>
            )}
          </div>
        </section>
        <section>
          <p {...stylex.props(styles.sectionLabel)}>Top-level parser fields</p>
          <p {...stylex.props(styles.softParagraph)}>
            {parser.topLevelKeys.length
              ? parser.topLevelKeys.join(", ")
              : "No fields are available."}
          </p>
        </section>
      </div>
    </div>
  );
}

function DocxPreviewParsedContent({ document }: { document: ParsedDocxDocument }) {
  const parser = document.docxPreviewParser;

  if (parser.status === "unavailable") {
    return (
      <p {...stylex.props(styles.warningText)}>
        parseAsync could not inspect this file: {parser.error}
      </p>
    );
  }

  return (
    <div>
      <div {...stylex.props(styles.contentHeader)}>
        <div>
          <p {...stylex.props(styles.headingSmall)}>docx-preview parsed content</p>
          <p {...stylex.props(styles.softDescription)}>
            A safe projection of documentPart.body.children: node types, text runs, and formula
            nodes.
          </p>
        </div>
        <span {...stylex.props(styles.experimental)}>Experimental API</span>
      </div>
      {parser.contentTruncated ? (
        <p {...stylex.props(styles.warningInline)}>
          The displayed tree is capped at 10,000 nodes for this playground.
        </p>
      ) : null}
      <pre {...stylex.props(styles.codeTree)}>{JSON.stringify(parser.content, null, 2)}</pre>
    </div>
  );
}

function DocxPreviewMarkdown({ document }: { document: ParsedDocxDocument }) {
  const parser = document.docxPreviewParser;

  if (parser.status === "unavailable") {
    return (
      <p {...stylex.props(styles.warningText)}>
        parseAsync could not inspect this file: {parser.error}
      </p>
    );
  }

  return (
    <div>
      <div {...stylex.props(styles.contentHeader)}>
        <div>
          <p {...stylex.props(styles.headingSmall)}>docx-preview Markdown</p>
          <p {...stylex.props(styles.softDescription)}>
            Markdown generated from the parsed DOCX nodes, independently of Mammoth.
          </p>
        </div>
        <span {...stylex.props(styles.experimental)}>Experimental conversion</span>
      </div>
      {parser.markdownWarnings.length ? (
        <ul {...stylex.props(styles.warningList)}>
          {parser.markdownWarnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
      {parser.markdown ? (
        <Streamdown
          className={`${MEMORA_STREAMDOWN_CLASS_NAME} ${stylex.props(styles.streamdownSpacing).className}`}
          controls={MEMORA_STREAMDOWN_CONTROLS}
          plugins={{ ...MEMORA_STREAMDOWN_PLUGINS }}
          shikiTheme={MEMORA_STREAMDOWN_THEME}
        >
          {parser.markdown}
        </Streamdown>
      ) : (
        <p {...stylex.props(styles.emptyMarkdown)}>
          No Markdown could be generated from this document.
        </p>
      )}
    </div>
  );
}

function DocumentPreview({
  file,
  result,
  pdfUrl,
  selectedPage,
  selectedPptxSlide,
  isRunning,
  onSelectFile,
  onPptxSlideChange,
}: DocumentPreviewProps) {
  const documentKind = file ? getSupportedDocumentKind(file) : null;
  const pdfSource =
    result?.kind === "pdf" && pdfUrl
      ? `${pdfUrl}#page=${selectedPage?.pageNumber ?? 1}&zoom=page-width`
      : null;

  return (
    <div
      {...stylex.props(styles.dropzone, result && styles.dropzoneResult)}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        if (!isRunning) onSelectFile(event.dataTransfer.files[0] ?? null);
      }}
    >
      <input
        id={DOCUMENT_FILE_INPUT_ID}
        type="file"
        accept="application/pdf,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx,application/vnd.openxmlformats-officedocument.presentationml.presentation,.pptx"
        className={stylex.props(styles.srOnly).className}
        disabled={isRunning}
        onChange={(event) => {
          onSelectFile(event.target.files?.[0] ?? null);
          event.target.value = "";
        }}
      />
      {result?.kind === "pdf" && pdfSource ? (
        <iframe
          key={pdfSource}
          title={`${result.fileName}, page ${selectedPage?.pageNumber ?? 1}`}
          src={pdfSource}
          className={stylex.props(styles.pdfFrame).className}
        />
      ) : result?.kind === "docx" && file ? (
        <DocxVisualPreview file={file} />
      ) : result?.kind === "pptx" ? (
        <PptxVisualPreview
          content={result.viewerContent}
          activeSlideNumber={selectedPptxSlide?.slideNumber ?? 1}
          onActiveSlideChange={onPptxSlideChange}
        />
      ) : (
        <label htmlFor={DOCUMENT_FILE_INPUT_ID} {...stylex.props(styles.dropLabel)}>
          <span {...stylex.props(styles.dropIcon)}>
            <FileSearchIcon className={stylex.props(styles.icon20).className} />
          </span>
          <p {...stylex.props(styles.dropTitle)}>Drop a PDF, DOCX, or PPTX</p>
          <p {...stylex.props(styles.dropCopy)}>
            {documentKind === "pdf"
              ? "Ready to inspect the PDF text layer and route scanned pages through OCR."
              : documentKind === "docx"
                ? "Ready to convert DOCX content into a local semantic preview."
                : documentKind === "pptx"
                  ? "Ready to extract slide text, notes, and embedded images locally."
                  : "The file remains in this browser while the demo parses it."}
          </p>
        </label>
      )}
    </div>
  );
}

interface PageInspectorProps {
  page: ParsedPdfPage | null;
  totalPages: number;
  onSelectPage: (page: number) => void;
}

function PageInspector({ page, totalPages, onSelectPage }: PageInspectorProps) {
  if (!page) {
    return (
      <div {...stylex.props(styles.inspectorEmpty)}>
        Parse a PDF to inspect its text layer or local OCR result page by page.
      </div>
    );
  }
  return (
    <section {...stylex.props(styles.inspector)}>
      <div {...stylex.props(styles.rowBetween)}>
        <div>
          <h3 {...stylex.props(styles.headingSmall)}>Page {page.pageNumber}</h3>
          <p {...stylex.props(styles.inspectorMeta)}>{getPageSourceLabel(page)}</p>
        </div>
        <span
          {...stylex.props(
            styles.badge,
            page.source === "text" ? styles.badgeSuccess : styles.badgeWarning,
          )}
        >
          {page.source === "text" ? "Text" : "OCR"}
        </span>
      </div>
      <dl {...stylex.props(styles.inspectorDetails)}>
        <div>
          <dt {...stylex.props(styles.detailLabel)}>Text items</dt>
          <dd {...stylex.props(styles.detailValue)}>{page.textItems.length}</dd>
        </div>
        <div>
          <dt {...stylex.props(styles.detailLabel)}>Page size</dt>
          <dd {...stylex.props(styles.detailValue)}>
            {Math.round(page.width)} × {Math.round(page.height)}
          </dd>
        </div>
        {page.ocr ? (
          <>
            <div>
              <dt {...stylex.props(styles.detailLabel)}>OCR blocks</dt>
              <dd {...stylex.props(styles.detailValue)}>{page.ocr.blockCount}</dd>
            </div>
            <div>
              <dt {...stylex.props(styles.detailLabel)}>OCR time</dt>
              <dd {...stylex.props(styles.detailValue)}>
                {formatMilliseconds(page.ocr.elapsedMs)}
              </dd>
            </div>
          </>
        ) : null}
      </dl>
      {totalPages > 1 ? (
        <div {...stylex.props(styles.pagination)}>
          <p {...stylex.props(styles.paginationLabel)}>Pages</p>
          <div {...stylex.props(styles.pageList)}>
            {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
              <button
                key={pageNumber}
                type="button"
                aria-pressed={pageNumber === page.pageNumber}
                {...stylex.props(
                  styles.pageButton,
                  pageNumber === page.pageNumber ? styles.pageActive : styles.pageIdle,
                )}
                onClick={() => onSelectPage(pageNumber)}
              >
                {pageNumber}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

interface PptxInspectorProps {
  slide: ParsedPptxSlide | null;
  totalSlides: number;
  onSelectSlide: (slideNumber: number) => void;
}

function PptxInspector({ slide, totalSlides, onSelectSlide }: PptxInspectorProps) {
  if (!slide) {
    return (
      <div {...stylex.props(styles.inspectorEmpty)}>
        Parse a PPTX to inspect its slide text, notes, and embedded images.
      </div>
    );
  }
  return (
    <section {...stylex.props(styles.inspector)}>
      <div {...stylex.props(styles.rowBetween)}>
        <div>
          <h3 {...stylex.props(styles.headingSmall)}>Slide {slide.slideNumber}</h3>
          <p {...stylex.props(styles.inspectorMeta)}>PPTX viewer active</p>
        </div>
        <span {...stylex.props(styles.badge, styles.badgeSuccess)}>PPTX</span>
      </div>
      <dl {...stylex.props(styles.inspectorDetails)}>
        <div>
          <dt {...stylex.props(styles.detailLabel)}>Extracted text</dt>
          <dd {...stylex.props(styles.detailValue)}>{slide.text.length.toLocaleString()} chars</dd>
        </div>
        <div>
          <dt {...stylex.props(styles.detailLabel)}>Embedded images</dt>
          <dd {...stylex.props(styles.detailValue)}>{slide.imageAttachmentNames.length}</dd>
        </div>
        <div>
          <dt {...stylex.props(styles.detailLabel)}>Speaker notes</dt>
          <dd {...stylex.props(styles.detailValue)}>{slide.notes.length}</dd>
        </div>
        <div>
          <dt {...stylex.props(styles.detailLabel)}>Comments</dt>
          <dd {...stylex.props(styles.detailValue)}>{slide.comments.length}</dd>
        </div>
      </dl>
      {totalSlides > 1 ? (
        <div {...stylex.props(styles.pagination)}>
          <p {...stylex.props(styles.paginationLabel)}>Slides</p>
          <div {...stylex.props(styles.pageList)}>
            {Array.from({ length: totalSlides }, (_, index) => index + 1).map((slideNumber) => (
              <button
                key={slideNumber}
                type="button"
                aria-pressed={slideNumber === slide.slideNumber}
                {...stylex.props(
                  styles.pageButton,
                  slideNumber === slide.slideNumber ? styles.pageActive : styles.pageIdle,
                )}
                onClick={() => onSelectSlide(slideNumber)}
              >
                {slideNumber}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function PptxImageThumbnail({ image }: { image: ParsedPptxImage }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const nextUrl = URL.createObjectURL(image.file);
    setUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [image.file]);

  if (!url) return <div {...stylex.props(styles.thumbnailLoading)} />;
  return (
    <img
      src={url}
      alt={image.altText ?? image.name}
      className={stylex.props(styles.thumbnail).className}
    />
  );
}

interface PptxParsedContentProps {
  slide: ParsedPptxSlide | null;
  images: ParsedPptxImage[];
  isRunning: boolean;
  onRunImageOcr: (image: ParsedPptxImage) => void;
}

function PptxParsedContent({ slide, images, isRunning, onRunImageOcr }: PptxParsedContentProps) {
  if (!slide) {
    return (
      <div {...stylex.props(styles.parsedEmpty)}>Select a slide to inspect its parsed content.</div>
    );
  }
  const slideImages = images.filter((image) => slide.imageAttachmentNames.includes(image.name));
  return (
    <div {...stylex.props(styles.stack6)}>
      <section>
        <p {...stylex.props(styles.parsedTitle)}>Slide {slide.slideNumber} text</p>
        <pre {...stylex.props(styles.preText)}>
          {slide.text || "No text was extracted from this slide."}
        </pre>
      </section>
      {slide.notes.length ? (
        <section {...stylex.props(styles.inset)}>
          <p {...stylex.props(styles.parsedTitle)}>Speaker notes</p>
          <pre {...stylex.props(styles.preText)}>{slide.notes.join("\n\n")}</pre>
        </section>
      ) : null}
      {slide.comments.length ? (
        <section {...stylex.props(styles.inset)}>
          <p {...stylex.props(styles.parsedTitle)}>Comments</p>
          <ul {...stylex.props(styles.list)}>
            {slide.comments.map((comment) => (
              <li key={comment}>{comment}</li>
            ))}
          </ul>
        </section>
      ) : null}
      {slideImages.length ? (
        <section>
          <p {...stylex.props(styles.parsedTitle)}>Embedded images</p>
          <div {...stylex.props(styles.imageGrid)}>
            {slideImages.map((image) => (
              <article key={image.name} {...stylex.props(styles.imageCard)}>
                <PptxImageThumbnail image={image} />
                <div {...stylex.props(styles.imageInfo)}>
                  <div {...stylex.props(styles.minZero)}>
                    <p className={stylex.props(styles.imageName).className} title={image.name}>
                      {image.name}
                    </p>
                    <p {...stylex.props(styles.imageType)}>{image.mimeType}</p>
                  </div>
                  <Button
                    onClick={() => onRunImageOcr(image)}
                    disabled={isRunning}
                    className={stylex.props(styles.imageButton).className}
                  >
                    {image.ocr ? "Run again" : "Run OCR"}
                  </Button>
                </div>
                {image.ocr ? (
                  <pre {...stylex.props(styles.imageOcr)}>
                    {image.ocr.markdown || "No text was recognised from this image."}
                  </pre>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function PptxMarkdownPreview({
  document,
}: {
  document: Extract<ParsedDocument, { kind: "pptx" }>;
}) {
  if (!document.markdown) {
    return (
      <p {...stylex.props(styles.warningText)}>
        Markdown conversion did not return any content for this presentation.
      </p>
    );
  }

  return (
    <div>
      <div {...stylex.props(styles.markdownHeader)}>
        <p {...stylex.props(styles.headingSmall)}>PPTX converted to Markdown</p>
        <p {...stylex.props(styles.softDescription)}>
          Semantic Markdown generated locally from the parsed slide model, including speaker notes.
        </p>
      </div>
      <Streamdown
        className={`${MEMORA_STREAMDOWN_CLASS_NAME} ${stylex.props(styles.streamdownSpacing).className}`}
        controls={MEMORA_STREAMDOWN_CONTROLS}
        plugins={{ ...MEMORA_STREAMDOWN_PLUGINS }}
        shikiTheme={MEMORA_STREAMDOWN_THEME}
      >
        {document.markdown}
      </Streamdown>
    </div>
  );
}

export default function DocumentParsing() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ParsedDocument | null>(null);
  const [progress, setProgress] = useState<DocumentParseProgress | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPageNumber, setSelectedPageNumber] = useState(1);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const ocrSessionRef = useRef<ImageDocumentPipelineSession | null>(null);

  if (!ocrSessionRef.current) {
    ocrSessionRef.current = new ImageDocumentPipelineSession(
      (ocrProgress: ImageDocumentPipelineProgress) => {
        setProgress({ stage: "ocr", label: ocrProgress.label });
      },
    );
  }

  useEffect(() => {
    if (!file || getSupportedDocumentKind(file) !== "pdf") {
      setPdfUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPdfUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => () => void ocrSessionRef.current?.dispose(), []);

  const selectFile = useCallback((nextFile: File | null) => {
    if (!nextFile) return;
    if (!getSupportedDocumentKind(nextFile)) {
      setError(
        "Choose a PDF, DOCX, or PPTX file. Legacy .doc files are not supported in this browser demo.",
      );
      return;
    }
    setFile(nextFile);
    setResult(null);
    setSelectedPageNumber(1);
    setProgress(null);
    setError(null);
  }, []);

  const handleRun = useCallback(async () => {
    if (!file || !ocrSessionRef.current) return;
    setIsRunning(true);
    setResult(null);
    setError(null);
    setSelectedPageNumber(1);
    try {
      const parsed = await parseDocumentFile(file, {
        onProgress: setProgress,
        runOcrPage: async (pageFile) => {
          const ocrResult = await ocrSessionRef.current!.run(pageFile);
          return {
            markdown: ocrResult.markdown,
            blockCount: ocrResult.blocks.length,
            warnings: ocrResult.warnings,
            elapsedMs: ocrResult.timings.totalMs,
          };
        },
      });
      setResult(parsed);
    } catch (reason) {
      setError(getDocumentParseErrorMessage(reason));
    } finally {
      setIsRunning(false);
      setProgress(null);
    }
  }, [file]);

  const handleReleaseOcr = useCallback(async () => {
    if (isRunning || !ocrSessionRef.current) return;
    await ocrSessionRef.current.dispose();
    setResult(null);
    setSelectedPageNumber(1);
  }, [isRunning]);

  const handleCopy = useCallback(async () => {
    if (!result?.text) return;
    await navigator.clipboard.writeText(result.text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }, [result]);

  const selectedPage = useMemo(
    () =>
      result?.kind === "pdf"
        ? (result.pages.find((page) => page.pageNumber === selectedPageNumber) ??
          result.pages[0] ??
          null)
        : null,
    [result, selectedPageNumber],
  );
  const selectedPptxSlide = useMemo(
    () =>
      result?.kind === "pptx"
        ? (result.slides.find((slide) => slide.slideNumber === selectedPageNumber) ??
          result.slides[0] ??
          null)
        : null,
    [result, selectedPageNumber],
  );
  const hasOcrPages = result?.kind === "pdf" && result.pages.some((page) => page.source === "ocr");
  const hasPptxOcrImages = result?.kind === "pptx" && result.images.some((image) => image.ocr);

  const handleRunPptxImageOcr = useCallback(
    async (image: ParsedPptxImage) => {
      if (!ocrSessionRef.current || isRunning) return;
      setIsRunning(true);
      setError(null);
      setProgress({ stage: "ocr", label: `Running OCR for ${image.name}` });
      try {
        const ocrResult = await ocrSessionRef.current.run(image.file);
        const ocr = {
          markdown: ocrResult.markdown,
          blockCount: ocrResult.blocks.length,
          warnings: ocrResult.warnings,
          elapsedMs: ocrResult.timings.totalMs,
        };
        setResult((current) => {
          if (!current || current.kind !== "pptx") return current;
          return {
            ...current,
            images: current.images.map((currentImage) =>
              currentImage.name === image.name ? { ...currentImage, ocr } : currentImage,
            ),
          };
        });
      } catch (reason) {
        setError(getDocumentParseErrorMessage(reason));
      } finally {
        setIsRunning(false);
        setProgress(null);
      }
    },
    [isRunning],
  );

  const sourceData = useMemo(() => {
    if (result?.kind !== "pptx") return result;
    const { viewerContent: _viewerContent, ...sourceResult } = result;
    return {
      ...sourceResult,
      images: result.images.map(({ file: imageFile, ...image }) => ({
        ...image,
        fileSize: imageFile.size,
      })),
    };
  }, [result]);

  return (
    <div {...stylex.props(styles.root)}>
      <div {...stylex.props(styles.topGrid)}>
        <section {...stylex.props(styles.panel)}>
          <div {...stylex.props(styles.panelHeader)}>
            <div>
              <h2 {...stylex.props(styles.title)}>Parse and preview a document</h2>
              <p {...stylex.props(styles.subtitle)}>
                PDFs, DOCX, and PPTX stay in this browser; OCR runs only when needed.
              </p>
            </div>
            {result ? (
              <span {...stylex.props(styles.parsedBadge)}>
                <CheckCircleIcon
                  weight="fill"
                  className={stylex.props(styles.icon14Olive).className}
                />
                Parsed locally
              </span>
            ) : null}
            <label htmlFor={DOCUMENT_FILE_INPUT_ID} {...stylex.props(styles.chooseFile)}>
              Choose file
            </label>
          </div>
          <div {...stylex.props(styles.previewPadding)}>
            <DocumentPreview
              file={file}
              result={result}
              pdfUrl={pdfUrl}
              selectedPage={selectedPage}
              selectedPptxSlide={selectedPptxSlide}
              isRunning={isRunning}
              onSelectFile={selectFile}
              onPptxSlideChange={setSelectedPageNumber}
            />
          </div>
          <div {...stylex.props(styles.panelFooter)}>
            <div {...stylex.props(styles.minZero)}>
              <p {...stylex.props(styles.fileName)}>{file?.name ?? "No document selected"}</p>
              <p {...stylex.props(styles.fileMeta)}>
                {file
                  ? `${getSupportedDocumentKind(file)?.toUpperCase()} · ${formatBytes(file.size)}`
                  : "PDF, DOCX, or PPTX"}
              </p>
            </div>
            <div {...stylex.props(styles.actions)}>
              <Button
                onClick={handleReleaseOcr}
                disabled={isRunning}
                title="Release local OCR models"
                className={stylex.props(styles.iconButton).className}
              >
                <ArrowClockwiseIcon className={stylex.props(styles.icon16).className} />
              </Button>
              <Button
                onClick={handleRun}
                disabled={!file || isRunning}
                className={stylex.props(styles.primaryButton).className}
              >
                <PlayIcon weight="fill" className={stylex.props(styles.icon14).className} />
                {isRunning ? "Parsing…" : "Parse document"}
              </Button>
            </div>
          </div>
        </section>

        <div {...stylex.props(styles.rightStack)}>
          {result?.kind === "pptx" ? (
            <PptxInspector
              slide={selectedPptxSlide}
              totalSlides={result.slides.length}
              onSelectSlide={setSelectedPageNumber}
            />
          ) : (
            <PageInspector
              page={selectedPage}
              totalPages={result?.kind === "pdf" ? result.pages.length : 0}
              onSelectPage={setSelectedPageNumber}
            />
          )}

          <section {...stylex.props(styles.panel, styles.statusPanel)}>
            <h2 {...stylex.props(styles.title)}>Processing status</h2>
            {progress ? (
              <div {...stylex.props(styles.progress)}>
                <div {...stylex.props(styles.progressRow)}>
                  <span {...stylex.props(styles.pulseDot)} />
                  {progress.label}
                </div>
                {progress.current && progress.total ? (
                  <p {...stylex.props(styles.progressMeta)}>
                    Page {progress.current} of {progress.total}
                  </p>
                ) : null}
              </div>
            ) : result ? (
              <dl {...stylex.props(styles.statusMetrics)}>
                <div {...stylex.props(styles.metric)}>
                  <dt {...stylex.props(styles.metricLabel)}>Total time</dt>
                  <dd {...stylex.props(styles.metricValue)}>
                    {formatMilliseconds(result.elapsedMs)}
                  </dd>
                </div>
                <div {...stylex.props(styles.metric)}>
                  <dt {...stylex.props(styles.metricLabel)}>
                    {result.kind === "pdf"
                      ? "Pages"
                      : result.kind === "pptx"
                        ? "Slides"
                        : "Extracted text"}
                  </dt>
                  <dd {...stylex.props(styles.metricValue)}>
                    {result.kind === "pdf"
                      ? result.pages.length
                      : result.kind === "pptx"
                        ? result.slides.length
                        : `${result.text.length.toLocaleString()} chars`}
                  </dd>
                </div>
                {result.kind === "pdf" ? (
                  <div {...stylex.props(styles.metric)}>
                    <dt {...stylex.props(styles.metricLabel)}>OCR fallback</dt>
                    <dd {...stylex.props(styles.metricValue)}>
                      {result.pages.filter((page) => page.source === "ocr").length} pages
                    </dd>
                  </div>
                ) : null}
                {result.kind === "pptx" ? (
                  <div {...stylex.props(styles.metric)}>
                    <dt {...stylex.props(styles.metricLabel)}>Embedded images</dt>
                    <dd {...stylex.props(styles.metricValue)}>{result.images.length}</dd>
                  </div>
                ) : null}
                {result.kind === "docx" ? (
                  <div {...stylex.props(styles.metric)}>
                    <dt {...stylex.props(styles.metricLabel)}>Formula nodes</dt>
                    <dd {...stylex.props(styles.metricValue)}>
                      {result.docxPreviewParser.mathExpressionCount}
                    </dd>
                  </div>
                ) : null}
              </dl>
            ) : (
              <p {...stylex.props(styles.statusEmpty)}>
                Select a local document, then run the parser to inspect the processing path.
              </p>
            )}
            {error ? (
              <div {...stylex.props(styles.errorBox)}>
                <WarningCircleIcon className={stylex.props(styles.warningIcon).className} />
                <p {...stylex.props(styles.breakWords)}>{error}</p>
              </div>
            ) : null}
            {result?.warnings.length ? (
              <div {...stylex.props(styles.notesBox)}>
                <div {...stylex.props(styles.notesHeader)}>
                  <WarningCircleIcon className={stylex.props(styles.warningIcon).className} />
                  Parser notes
                </div>
                <ul {...stylex.props(styles.notesList)}>
                  {result.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        </div>
      </div>

      <section {...stylex.props(styles.panel)}>
        <Tabs.Root defaultValue="parsed">
          <div {...stylex.props(styles.tabsHeader)}>
            <Tabs.List className={stylex.props(styles.tabList).className}>
              <Tabs.Tab value="parsed" className={stylex.props(styles.tab).className}>
                <FileImageIcon className={stylex.props(styles.icon14).className} />
                Parsed content
              </Tabs.Tab>
              <Tabs.Tab value="source" className={stylex.props(styles.tab).className}>
                <CodeIcon className={stylex.props(styles.icon14).className} />
                Source data
              </Tabs.Tab>
              {result?.kind === "docx" ? (
                <Tabs.Tab value="comparison" className={stylex.props(styles.tab).className}>
                  Parser comparison
                </Tabs.Tab>
              ) : null}
              {result?.kind === "pptx" ? (
                <Tabs.Tab value="pptx-markdown" className={stylex.props(styles.tab).className}>
                  PPTX Markdown
                </Tabs.Tab>
              ) : null}
              {result?.kind === "docx" ? (
                <Tabs.Tab
                  value="docx-preview-content"
                  className={stylex.props(styles.tab).className}
                >
                  docx-preview content
                </Tabs.Tab>
              ) : null}
              {result?.kind === "docx" ? (
                <Tabs.Tab
                  value="docx-preview-markdown"
                  className={stylex.props(styles.tab).className}
                >
                  docx-preview Markdown
                </Tabs.Tab>
              ) : null}
            </Tabs.List>
            <Button
              onClick={handleCopy}
              disabled={!result?.text}
              className={stylex.props(styles.copyButton).className}
            >
              <ClipboardIcon className={stylex.props(styles.icon14).className} />
              {copied ? "Copied" : "Copy text"}
            </Button>
          </div>
          <Tabs.Panel value="parsed" className={stylex.props(styles.tabPanel).className}>
            {selectedPage?.source === "ocr" && selectedPage.text ? (
              <Streamdown
                className={MEMORA_STREAMDOWN_CLASS_NAME}
                controls={MEMORA_STREAMDOWN_CONTROLS}
                plugins={{ ...MEMORA_STREAMDOWN_PLUGINS }}
                shikiTheme={MEMORA_STREAMDOWN_THEME}
              >
                {selectedPage.text}
              </Streamdown>
            ) : result?.kind === "pdf" && selectedPage ? (
              <pre {...stylex.props(styles.parsedText)}>
                {selectedPage.text || "No usable text was returned for this page."}
              </pre>
            ) : result?.kind === "docx" ? (
              <pre {...stylex.props(styles.parsedText)}>
                {result.text || "The document did not contain extractable text."}
              </pre>
            ) : result?.kind === "pptx" ? (
              <PptxParsedContent
                slide={selectedPptxSlide}
                images={result.images}
                isRunning={isRunning}
                onRunImageOcr={handleRunPptxImageOcr}
              />
            ) : (
              <div {...stylex.props(styles.parsedEmpty)}>
                <div>
                  <ScanIcon className={stylex.props(styles.emptyIcon).className} />
                  <p {...stylex.props(styles.emptyText)}>
                    Parsed document content will appear here.
                  </p>
                </div>
              </div>
            )}
          </Tabs.Panel>
          <Tabs.Panel value="source" className={stylex.props(styles.plainPanel).className}>
            <pre {...stylex.props(styles.source)}>
              {sourceData
                ? JSON.stringify(sourceData, null, 2)
                : "Run the parser to inspect page metadata, text items, and OCR routing."}
            </pre>
          </Tabs.Panel>
          <Tabs.Panel value="comparison" className={stylex.props(styles.tabPanel).className}>
            {result?.kind === "docx" ? (
              <DocxParserComparison document={result} />
            ) : (
              <p {...stylex.props(styles.fallbackText)}>
                Select a DOCX file to compare its parsers.
              </p>
            )}
          </Tabs.Panel>
          <Tabs.Panel
            value="docx-preview-content"
            className={stylex.props(styles.tabPanel).className}
          >
            {result?.kind === "docx" ? (
              <DocxPreviewParsedContent document={result} />
            ) : (
              <p {...stylex.props(styles.fallbackText)}>
                Select a DOCX file to inspect docx-preview parsed content.
              </p>
            )}
          </Tabs.Panel>
          <Tabs.Panel
            value="docx-preview-markdown"
            className={stylex.props(styles.tabPanel).className}
          >
            {result?.kind === "docx" ? (
              <DocxPreviewMarkdown document={result} />
            ) : (
              <p {...stylex.props(styles.fallbackText)}>
                Select a DOCX file to inspect docx-preview Markdown.
              </p>
            )}
          </Tabs.Panel>
          <Tabs.Panel value="pptx-markdown" className={stylex.props(styles.tabPanel).className}>
            {result?.kind === "pptx" ? (
              <PptxMarkdownPreview document={result} />
            ) : (
              <p {...stylex.props(styles.fallbackText)}>
                Select a PPTX file to inspect its Markdown conversion.
              </p>
            )}
          </Tabs.Panel>
        </Tabs.Root>
      </section>

      <div {...stylex.props(styles.notice)}>
        <WarningCircleIcon className={stylex.props(styles.warningIcon).className} />
        <p>
          PDF.js, Mammoth, docx-preview, pptx-viewer-core, and pptx-react-viewer run in this
          browser. PDF pages without a usable text layer are rendered locally and sent only to the
          existing PP-DocLayoutV3, PP-OCRv6, and Texo pipeline. DOCX runs Mammoth text extraction
          beside an experimental docx-preview.parseAsync() structure inspection and Markdown
          conversion. PPTX uses the core parser for slide, notes, comments, and image extraction,
          while the React viewer renders the original local file; only a selected embedded image is
          sent to local OCR. {hasOcrPages ? "This document includes OCR-derived pages." : ""}
          {hasPptxOcrImages ? " This presentation includes OCR-derived image text." : ""}
        </p>
      </div>
    </div>
  );
}
