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
  activeMatchId?: string;
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
  activeMatchId,
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
    <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <div className="border-b border-zinc-200 px-4 py-4 md:px-5">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-zinc-900">Transcript</h2>
              <p className="mt-1 text-sm text-zinc-500">
                Search the transcript or jump to a matching moment.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                onClick={onExportTxt}
                disabled={!hasSearchableTranscript}
                className="flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <DownloadSimpleIcon className="size-3.5" />
                Export TXT
              </Button>
              <Button
                onClick={onExportSrt}
                disabled={!canExportSrt}
                title={canExportSrt ? "Export SRT" : "SRT export needs word-level timestamps"}
                className="flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <DownloadSimpleIcon className="size-3.5" />
                Export SRT
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus-within:border-zinc-300">
              <MagnifyingGlassIcon className="size-4 text-zinc-400" />
              <input
                value={searchQuery}
                onChange={(event) => onSearchQueryChange(event.target.value)}
                placeholder="Search transcript..."
                disabled={!canSearch}
                className="w-full bg-transparent text-sm text-zinc-800 placeholder:text-zinc-400 focus:outline-none disabled:cursor-not-allowed disabled:text-zinc-400"
              />
            </label>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center rounded-xl border border-zinc-200 bg-white">
                <Button
                  onClick={() => onJumpToMatch(activeMatchIndex - 1)}
                  disabled={searchMatches.length === 0}
                  className="flex h-9 w-9 items-center justify-center rounded-l-xl text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-40"
                  title="Previous match"
                >
                  <CaretUpIcon className="size-3.5" />
                </Button>
                <Button
                  onClick={() => onJumpToMatch(activeMatchIndex + 1)}
                  disabled={searchMatches.length === 0}
                  className="flex h-9 w-9 items-center justify-center rounded-r-xl border-l border-zinc-200 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-40"
                  title="Next match"
                >
                  <CaretDownIcon className="size-3.5" />
                </Button>
              </div>

              <p className="text-xs text-zinc-500">
                {searchQuery.trim().length === 0
                  ? "Type to search"
                  : searchMatches.length === 0
                    ? "No matches"
                    : `${activeMatchIndex + 1}/${searchMatches.length} matches`}
              </p>
            </div>
          </div>

          {!canExportSrt && hasTranscript && (
            <p className="text-xs text-zinc-400">
              SRT export is unavailable because this transcript has no word timestamps.
            </p>
          )}

          {searchQuery.trim().length > 0 && (
            <div className="max-h-36 space-y-1 overflow-y-auto rounded-xl border border-zinc-200 bg-zinc-50 p-2">
              {searchMatches.length === 0 ? (
                <p className="px-2 py-2 text-xs text-zinc-500">
                  No matches found in this transcript.
                </p>
              ) : (
                searchMatches.map((match, index) => {
                  const isActive = match.id === activeMatchId;
                  const hasTimestamp = match.startSec != null;
                  return (
                    <button
                      key={match.id}
                      onClick={() => onJumpToMatch(index)}
                      className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-xs transition-colors ${
                        isActive
                          ? "bg-zinc-900 text-white"
                          : "text-zinc-600 hover:bg-white hover:text-zinc-900"
                      }`}
                    >
                      <span className="line-clamp-1">{match.snippet}</span>
                      <span className="shrink-0 tabular-nums">
                        {hasTimestamp && match.startSec != null
                          ? formatDuration(match.startSec)
                          : "Text only"}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>

      {!hasSearchableTranscript && !isTranscribing ? (
        <div className="space-y-4 p-4 md:p-5">
          {transcriptDiagnostics?.dropped && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              The last auto-transcription was filtered as likely hallucination. Retry it or save a
              manual transcript.
            </div>
          )}

          <textarea
            value={manualTranscript}
            onChange={(event) => onManualTranscriptChange(event.target.value)}
            placeholder="Type or paste your transcript here..."
            className="min-h-[220px] w-full resize-y rounded-xl border border-zinc-200 p-4 text-sm leading-7 text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none"
          />

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Button
              onClick={onTranscriptToggle}
              disabled={isTranscribing}
              className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50"
            >
              {transcriptDiagnostics ? "Retry auto transcribe" : "Auto transcribe"}
            </Button>
            <Button
              onClick={onSaveManualTranscript}
              disabled={!manualTranscript.trim() || isSavingManual}
              className="flex items-center justify-center gap-1.5 rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
            >
              <FloppyDiskIcon className="size-3.5" />
              {isSavingManual ? "Saving..." : "Save transcript"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="h-[min(50vh,620px)]">
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
      )}
    </section>
  );
};
