import { Button } from "@base-ui/react/button";
import {
  CaretDownIcon,
  CaretUpIcon,
  DownloadSimpleIcon,
  FloppyDiskIcon,
  MagnifyingGlassIcon,
} from "@phosphor-icons/react";
import * as stylex from "@stylexjs/stylex";
import type { MutableRefObject } from "react";

import { TranscriptSidebar } from "@/components/library/TranscriptSidebar";
import { formatDuration } from "@/lib/format";
import type { TranscriptSearchMatch } from "@/lib/transcript/transcriptSearchExport";
import type { RecordingWord, TranscriptDiagnostics } from "@/types/library";

const styles = stylex.create({
  panel: {
    backgroundColor: "var(--color-memora-surface)",
    borderColor: "var(--color-memora-border)",
    borderRadius: "2rem",
    borderStyle: "solid",
    borderWidth: 1,
    display: "flex",
    flexDirection: "column",
    height: "min(72vh, 44rem)",
    minHeight: "22rem",
    padding: "1.25rem",
    "@media (min-width: 768px)": { paddingInline: "1.5rem" },
  },
  toolbar: { display: "flex", flexDirection: "column", gap: "0.75rem", paddingBottom: "1rem" },
  toolbarRow: {
    display: "flex",
    flexDirection: "column",
    gap: "0.75rem",
    "@media (min-width: 1280px)": { alignItems: "center", flexDirection: "row" },
  },
  search: {
    alignItems: "center",
    backgroundColor: "var(--color-memora-surface-soft)",
    borderRadius: "9999px",
    boxShadow: "0 0 0 1px var(--color-memora-border-soft)",
    display: "flex",
    flex: 1,
    fontSize: "0.875rem",
    gap: "0.5rem",
    lineHeight: "1.25rem",
    minWidth: 0,
    paddingBlock: "0.75rem",
    paddingInline: "1rem",
  },
  searchIcon: { color: "var(--color-memora-text-soft)", height: "1rem", width: "1rem" },
  searchInput: {
    backgroundColor: "transparent",
    color: { default: "var(--color-memora-text)", ":disabled": "var(--color-memora-text-soft)" },
    cursor: { default: "text", ":disabled": "not-allowed" },
    fontSize: "0.875rem",
    lineHeight: "1.25rem",
    width: "100%",
    "::placeholder": { color: "var(--color-memora-text-soft)" },
    ":focus": { outline: "none" },
  },
  toolbarActions: {
    alignItems: "center",
    columnGap: "1rem",
    display: "flex",
    flexWrap: "wrap",
    rowGap: "0.5rem",
  },
  textButton: {
    alignItems: "center",
    backgroundColor: "transparent",
    color: { default: "var(--color-memora-text-muted)", ":hover": "var(--color-memora-text)" },
    display: "flex",
    fontSize: "0.75rem",
    fontWeight: 500,
    gap: "0.375rem",
    lineHeight: "1rem",
    minHeight: "2.5rem",
    paddingInline: 0,
    transitionDuration: "150ms",
    transitionProperty: "color, opacity",
    ":disabled": { cursor: "not-allowed", opacity: 0.4 },
  },
  smallIcon: { height: "0.875rem", width: "0.875rem" },
  matchNavigation: { alignItems: "center", display: "flex", gap: "0.25rem" },
  navigationButton: {
    alignItems: "center",
    backgroundColor: "transparent",
    color: { default: "var(--color-memora-text-muted)", ":hover": "var(--color-memora-text)" },
    display: "flex",
    height: "2rem",
    justifyContent: "center",
    transitionDuration: "150ms",
    transitionProperty: "color, opacity, transform",
    width: "2rem",
    ":disabled": { cursor: "not-allowed", opacity: 0.4 },
  },
  previousButton: { ":hover": { transform: "translateY(-0.125rem)" } },
  nextButton: { ":hover": { transform: "translateY(0.125rem)" } },
  searchStatus: {
    alignItems: "center",
    color: "var(--color-memora-text-muted)",
    display: "flex",
    flexWrap: "wrap",
    fontSize: "0.75rem",
    gap: "0.5rem",
    lineHeight: "1rem",
  },
  truncated: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  hint: { color: "var(--color-memora-text-soft)", fontSize: "0.75rem", lineHeight: "1rem" },
  emptyContent: {
    display: "flex",
    flex: 1,
    flexDirection: "column",
    minHeight: 0,
    paddingTop: "1rem",
  },
  warning: {
    backgroundColor: "var(--color-memora-warning-surface)",
    borderRadius: "1.25rem",
    boxShadow: "0 0 0 1px var(--color-memora-warning-border)",
    color: "var(--color-memora-warning-text)",
    fontSize: "0.875rem",
    lineHeight: "1.25rem",
    marginBottom: "1rem",
    paddingBlock: "0.75rem",
    paddingInline: "1rem",
  },
  textarea: {
    backgroundColor: "var(--color-memora-surface-soft)",
    borderRadius: "1.5rem",
    boxShadow: "0 0 0 1px var(--color-memora-border-soft)",
    color: "var(--color-memora-text)",
    flex: 1,
    fontSize: "0.875rem",
    lineHeight: "1.75rem",
    minHeight: "16rem",
    padding: "1rem",
    resize: "none",
    "::placeholder": { color: "var(--color-memora-text-soft)" },
    ":focus": { outline: "none" },
  },
  emptyActions: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: "0.5rem",
    justifyContent: "space-between",
    marginTop: "1rem",
    paddingTop: "0.5rem",
  },
  transcribeButton: {
    backgroundColor: "transparent",
    color: { default: "var(--color-memora-text-muted)", ":hover": "var(--color-memora-text)" },
    fontSize: "0.875rem",
    fontWeight: 500,
    lineHeight: "1.25rem",
    paddingBlock: "0.5rem",
    paddingInline: 0,
    transitionDuration: "150ms",
    transitionProperty: "color, opacity",
    ":disabled": { opacity: 0.5 },
  },
  saveButton: {
    alignItems: "center",
    backgroundColor: {
      default: "var(--color-memora-text-strong)",
      ":hover":
        "color-mix(in srgb, var(--color-memora-text-strong) 86%, var(--color-memora-surface))",
    },
    borderRadius: "9999px",
    color: "var(--color-memora-surface)",
    display: "flex",
    fontSize: "0.875rem",
    fontWeight: 500,
    gap: "0.375rem",
    lineHeight: "1.25rem",
    paddingBlock: "0.625rem",
    paddingInline: "1rem",
    transitionDuration: "150ms",
    transitionProperty: "background-color, transform, box-shadow, opacity",
    ":hover": { boxShadow: "var(--shadow-md-soft)" },
    ":disabled": { opacity: 0.5 },
  },
  transcriptContent: { flex: 1, minHeight: 0, paddingTop: "1rem" },
  transcriptSurface: {
    backgroundColor: "var(--color-memora-surface-soft)",
    borderRadius: "1.5rem",
    boxShadow: "0 0 0 1px var(--color-memora-border-soft)",
    height: "100%",
    minHeight: 0,
    overflow: "hidden",
  },
});

interface TranscriptSectionProps {
  showTranscript: boolean;
  hasSearchableTranscript: boolean;
  hasTranscript: boolean;
  isTranscribing: boolean;
  canExportSrt: boolean;
  canSearch: boolean;
  transcriptText: string;
  transcriptWords: RecordingWord[];
  transcriptDiagnostics?: TranscriptDiagnostics;
  transcriptionStatus: string;
  transcriptionProgress: number;
  currentTimeRef: MutableRefObject<number>;
  searchQuery: string;
  activeMatchIndex: number;
  searchMatches: TranscriptSearchMatch[];
  manualTranscript: string;
  isSavingManual: boolean;
  onSearchQueryChange: (value: string) => void;
  onJumpToMatch: (nextIndex: number) => void;
  onManualTranscriptChange: (value: string) => void;
  onExportTxt: () => void;
  onExportSrt: () => void;
  onTranscriptToggle: () => void | Promise<void>;
  onSaveManualTranscript: () => void | Promise<void>;
  onSeek: (time: number) => void;
}

export const TranscriptSection = ({
  showTranscript,
  hasSearchableTranscript,
  hasTranscript,
  isTranscribing,
  canExportSrt,
  canSearch,
  transcriptText,
  transcriptWords,
  transcriptDiagnostics,
  transcriptionStatus,
  transcriptionProgress,
  currentTimeRef,
  searchQuery,
  activeMatchIndex,
  searchMatches,
  manualTranscript,
  isSavingManual,
  onSearchQueryChange,
  onJumpToMatch,
  onManualTranscriptChange,
  onExportTxt,
  onExportSrt,
  onTranscriptToggle,
  onSaveManualTranscript,
  onSeek,
}: TranscriptSectionProps) => {
  if (!showTranscript) {
    return null;
  }

  return (
    <section
      data-surface="transcript-detail-panel"
      className={`memora-surface-glow ${stylex.props(styles.panel).className ?? ""}`}
    >
      <div {...stylex.props(styles.toolbar)}>
        <div {...stylex.props(styles.toolbarRow)}>
          <label className={`memora-surface-glow ${stylex.props(styles.search).className ?? ""}`}>
            <MagnifyingGlassIcon {...stylex.props(styles.searchIcon)} />
            <input
              value={searchQuery}
              onChange={(event) => onSearchQueryChange(event.target.value)}
              placeholder="Search transcript..."
              disabled={!canSearch}
              {...stylex.props(styles.searchInput)}
            />
          </label>

          <div {...stylex.props(styles.toolbarActions)}>
            <Button
              onClick={onExportTxt}
              disabled={!hasSearchableTranscript}
              className={`memora-interactive ${stylex.props(styles.textButton).className ?? ""}`}
            >
              <DownloadSimpleIcon {...stylex.props(styles.smallIcon)} />
              TXT
            </Button>
            <Button
              onClick={onExportSrt}
              disabled={!canExportSrt}
              title={canExportSrt ? "Export SRT" : "SRT export needs word-level timestamps"}
              className={`memora-interactive ${stylex.props(styles.textButton).className ?? ""}`}
            >
              <DownloadSimpleIcon {...stylex.props(styles.smallIcon)} />
              SRT
            </Button>
            <div {...stylex.props(styles.matchNavigation)}>
              <Button
                onClick={() => onJumpToMatch(activeMatchIndex - 1)}
                disabled={searchMatches.length === 0}
                className={`memora-interactive ${stylex.props(styles.navigationButton, styles.previousButton).className ?? ""}`}
                title="Previous match"
              >
                <CaretUpIcon {...stylex.props(styles.smallIcon)} />
              </Button>
              <Button
                onClick={() => onJumpToMatch(activeMatchIndex + 1)}
                disabled={searchMatches.length === 0}
                className={`memora-interactive ${stylex.props(styles.navigationButton, styles.nextButton).className ?? ""}`}
                title="Next match"
              >
                <CaretDownIcon {...stylex.props(styles.smallIcon)} />
              </Button>
            </div>
          </div>
        </div>

        {searchQuery.trim().length > 0 ? (
          <div {...stylex.props(styles.searchStatus)}>
            <span>
              {searchMatches.length === 0
                ? "No matches"
                : `${activeMatchIndex + 1}/${searchMatches.length} matches`}
            </span>
            {searchMatches.length > 0 ? (
              <span {...stylex.props(styles.truncated)}>
                {searchMatches[activeMatchIndex]?.startSec != null
                  ? formatDuration(searchMatches[activeMatchIndex].startSec ?? 0)
                  : "Text match"}
              </span>
            ) : null}
          </div>
        ) : null}

        {!canExportSrt && hasTranscript ? (
          <p {...stylex.props(styles.hint)}>SRT export needs word-level timestamps.</p>
        ) : null}
      </div>

      {!hasSearchableTranscript && !isTranscribing ? (
        <div {...stylex.props(styles.emptyContent)}>
          {transcriptDiagnostics?.dropped ? (
            <div {...stylex.props(styles.warning)}>
              The last auto-transcription was filtered. Retry it or save a manual draft.
            </div>
          ) : null}

          <textarea
            value={manualTranscript}
            onChange={(event) => onManualTranscriptChange(event.target.value)}
            placeholder="Type or paste your transcript here..."
            className={`memora-surface-glow ${stylex.props(styles.textarea).className ?? ""}`}
          />

          <div {...stylex.props(styles.emptyActions)}>
            <Button
              onClick={onTranscriptToggle}
              disabled={isTranscribing}
              className={`memora-interactive ${stylex.props(styles.transcribeButton).className ?? ""}`}
            >
              {transcriptDiagnostics ? "Retry auto transcribe" : "Auto transcribe"}
            </Button>
            <Button
              onClick={onSaveManualTranscript}
              disabled={!manualTranscript.trim() || isSavingManual}
              className={`memora-interactive ${stylex.props(styles.saveButton).className ?? ""}`}
            >
              <FloppyDiskIcon {...stylex.props(styles.smallIcon)} />
              {isSavingManual ? "Saving..." : "Save transcript"}
            </Button>
          </div>
        </div>
      ) : (
        <div {...stylex.props(styles.transcriptContent)}>
          <div
            className={`memora-surface-glow ${stylex.props(styles.transcriptSurface).className ?? ""}`}
          >
            <TranscriptSidebar
              words={transcriptWords}
              text={transcriptText}
              timeRef={currentTimeRef}
              onSeek={onSeek}
              isTranscribing={isTranscribing}
              transcriptionStatus={transcriptionStatus}
              transcriptionProgress={transcriptionProgress}
            />
          </div>
        </div>
      )}
    </section>
  );
};
