import { Button } from "@base-ui/react/button";
import {
  CaretDownIcon,
  CaretUpIcon,
  DownloadSimpleIcon,
  FloppyDiskIcon,
  MagnifyingGlassIcon,
} from "@phosphor-icons/react";
import type { MutableRefObject } from "react";

import { TranscriptSidebar } from "@/components/library/TranscriptSidebar";
import { formatDuration } from "@/lib/format";
import type { TranscriptSearchMatch } from "@/lib/transcript/transcriptSearchExport";
import type { RecordingWord, TranscriptDiagnostics } from "@/types/library";

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
      className="memora-surface-glow flex h-[min(72vh,44rem)] min-h-[22rem] flex-col rounded-[2rem] border border-[var(--color-memora-border)] bg-[var(--color-memora-surface)] px-5 py-5 md:px-6"
    >
      <div className="space-y-3 pb-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <label className="memora-surface-glow flex min-w-0 flex-1 items-center gap-2 rounded-full bg-[var(--color-memora-surface-soft)] px-4 py-3 text-sm ring-1 ring-[var(--color-memora-border-soft)]">
            <MagnifyingGlassIcon className="size-4 text-[var(--color-memora-text-soft)]" />
            <input
              value={searchQuery}
              onChange={(event) => onSearchQueryChange(event.target.value)}
              placeholder="Search transcript..."
              disabled={!canSearch}
              className="w-full bg-transparent text-sm text-[var(--color-memora-text)] placeholder:text-[var(--color-memora-text-soft)] focus:outline-none disabled:cursor-not-allowed disabled:text-[var(--color-memora-text-soft)]"
            />
          </label>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Button
              onClick={onExportTxt}
              disabled={!hasSearchableTranscript}
              className="memora-interactive flex min-h-10 items-center gap-1.5 px-0 text-xs font-medium text-[var(--color-memora-text-muted)] transition-colors hover:text-[var(--color-memora-text)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <DownloadSimpleIcon className="size-3.5" />
              TXT
            </Button>
            <Button
              onClick={onExportSrt}
              disabled={!canExportSrt}
              title={canExportSrt ? "Export SRT" : "SRT export needs word-level timestamps"}
              className="memora-interactive flex min-h-10 items-center gap-1.5 px-0 text-xs font-medium text-[var(--color-memora-text-muted)] transition-colors hover:text-[var(--color-memora-text)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <DownloadSimpleIcon className="size-3.5" />
              SRT
            </Button>
            <div className="flex items-center gap-1">
              <Button
                onClick={() => onJumpToMatch(activeMatchIndex - 1)}
                disabled={searchMatches.length === 0}
                className="memora-interactive flex size-8 items-center justify-center text-[var(--color-memora-text-muted)] transition-colors hover:-translate-y-0.5 hover:text-[var(--color-memora-text)] disabled:cursor-not-allowed disabled:opacity-40"
                title="Previous match"
              >
                <CaretUpIcon className="size-3.5" />
              </Button>
              <Button
                onClick={() => onJumpToMatch(activeMatchIndex + 1)}
                disabled={searchMatches.length === 0}
                className="memora-interactive flex size-8 items-center justify-center text-[var(--color-memora-text-muted)] transition-colors hover:translate-y-0.5 hover:text-[var(--color-memora-text)] disabled:cursor-not-allowed disabled:opacity-40"
                title="Next match"
              >
                <CaretDownIcon className="size-3.5" />
              </Button>
            </div>
          </div>
        </div>

        {searchQuery.trim().length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--color-memora-text-muted)]">
            <span>
              {searchMatches.length === 0
                ? "No matches"
                : `${activeMatchIndex + 1}/${searchMatches.length} matches`}
            </span>
            {searchMatches.length > 0 ? (
              <span className="truncate">
                {searchMatches[activeMatchIndex]?.startSec != null
                  ? formatDuration(searchMatches[activeMatchIndex].startSec ?? 0)
                  : "Text match"}
              </span>
            ) : null}
          </div>
        ) : null}

        {!canExportSrt && hasTranscript ? (
          <p className="text-xs text-[var(--color-memora-text-soft)]">
            SRT export needs word-level timestamps.
          </p>
        ) : null}
      </div>

      {!hasSearchableTranscript && !isTranscribing ? (
        <div className="flex min-h-0 flex-1 flex-col pt-4">
          {transcriptDiagnostics?.dropped ? (
            <div className="mb-4 rounded-[1.25rem] bg-[var(--color-memora-warning-surface)] px-4 py-3 text-sm text-[var(--color-memora-warning-text)] ring-1 ring-[var(--color-memora-warning-border)]">
              The last auto-transcription was filtered. Retry it or save a manual draft.
            </div>
          ) : null}

          <textarea
            value={manualTranscript}
            onChange={(event) => onManualTranscriptChange(event.target.value)}
            placeholder="Type or paste your transcript here..."
            className="memora-surface-glow min-h-[16rem] flex-1 resize-none rounded-[1.5rem] bg-[var(--color-memora-surface-soft)] px-4 py-4 text-sm leading-7 text-[var(--color-memora-text)] placeholder:text-[var(--color-memora-text-soft)] ring-1 ring-[var(--color-memora-border-soft)] focus:outline-none"
          />

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 pt-2">
            <Button
              onClick={onTranscriptToggle}
              disabled={isTranscribing}
              className="memora-interactive px-0 py-2 text-sm font-medium text-[var(--color-memora-text-muted)] transition-colors hover:text-[var(--color-memora-text)] disabled:opacity-50"
            >
              {transcriptDiagnostics ? "Retry auto transcribe" : "Auto transcribe"}
            </Button>
            <Button
              onClick={onSaveManualTranscript}
              disabled={!manualTranscript.trim() || isSavingManual}
              className="memora-interactive flex items-center gap-1.5 rounded-full bg-[var(--color-memora-text-strong)] px-4 py-2.5 text-sm font-medium text-[var(--color-memora-surface)] transition-[background-color,transform,box-shadow] hover:bg-[#2f2d27] hover:shadow-[0_10px_24px_-18px_rgba(34,33,29,0.95)] disabled:opacity-50"
            >
              <FloppyDiskIcon className="size-3.5" />
              {isSavingManual ? "Saving..." : "Save transcript"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 pt-4">
          <div className="memora-surface-glow h-full min-h-0 overflow-hidden rounded-[1.5rem] bg-[var(--color-memora-surface-soft)] ring-1 ring-[var(--color-memora-border-soft)]">
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
