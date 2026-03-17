import { Button } from "@base-ui/react/button";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { useStore } from "@livestore/react";
import { write as opfsWrite } from "@memora/fs";
import { AudioPlayer } from "@/components/library/AudioPlayer";
import { VideoPlayer } from "@/components/library/VideoPlayer";
import { TranscriptSidebar } from "@/components/library/TranscriptSidebar";
import { formatDateTime, formatDuration } from "@/lib/format";
import { useRecordingDetail } from "@/hooks/transcript/useRecordingDetail";
import { useMediaFiles } from "@/hooks/library/useMediaFiles";
import { useFileTranscription } from "@/hooks/transcript/useFileTranscription";
import { getMediaDuration, resolveRecordingBlob } from "@/lib/library/fileService";
import { BackButton } from "@/components/transcript/BackButton";
import { TranscriptDiagnosticsCard } from "@/components/transcript/TranscriptDiagnosticsCard";
import { fileEvents } from "@/livestore/file";
import {
  FILES_DIR,
  TRANSCRIPT_SUFFIX,
  type FileType,
  type RecordingWord,
} from "@/types/library";
import {
  buildSrt,
  downloadText,
  searchTranscript,
} from "@/lib/transcript/transcriptSearchExport";
import {
  CaretDownIcon,
  CaretUpIcon,
  DownloadSimpleIcon,
  MagnifyingGlassIcon,
  TrashIcon,
  PencilSimpleIcon,
  SpinnerGapIcon,
  FloppyDiskIcon,
  SubtitlesIcon,
} from "@phosphor-icons/react";

const buildExportFileName = (name: string, ext: "txt" | "srt"): string => {
  const sanitized = name
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return `${sanitized || "transcript"}.${ext}`;
};

const EMPTY_WORDS: RecordingWord[] = [];

const getRecordingTypeLabel = (type: FileType): string => {
  switch (type) {
    case "audio":
      return "Audio recording";
    case "video":
      return "Video recording";
    case "image":
      return "Image";
    case "document":
      return "Document";
    default:
      return "File";
  }
};

export const Component = () => {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { store } = useStore();
  const [mediaReadyToken, setMediaReadyToken] = useState(0);
  const { recording, loading, error, reload } = useRecordingDetail(id);
  const { deleteRecording } = useMediaFiles();

  const {
    transcribeFile,
    status: transcriptionStatus,
    progress: transcriptionProgress,
  } = useFileTranscription();

  const [showTranscript, setShowTranscript] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [manualTranscript, setManualTranscript] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);
  const [isSavingManual, setIsSavingManual] = useState(false);
  const currentTimeRef = useRef(0);
  const seekRef = useRef<number | null>(null);
  const lastAppliedSeekKeyRef = useRef<string | null>(null);
  const transcriptWords = recording?.transcript?.words ?? EMPTY_WORDS;
  const transcriptText = recording?.transcript?.text ?? "";
  const transcriptDiagnostics = recording?.transcript?.diagnostics;
  const hasSearchableTranscript =
    transcriptWords.length > 0 || transcriptText.trim().length > 0;
  const hasTranscript =
    !!recording?.transcript && (hasSearchableTranscript || !!transcriptDiagnostics);

  const isTranscribing =
    transcriptionStatus === "decoding" ||
    transcriptionStatus === "loading-model" ||
    transcriptionStatus === "transcribing" ||
    transcriptionStatus === "saving";

  useEffect(() => {
    if (recording) {
      setRenameValue(recording.name);
    }
  }, [recording]);

  useEffect(() => {
    setSearchQuery("");
    setActiveMatchIndex(0);
  }, [recording?.id]);

  const backfilledRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!recording) return;
    if (recording.durationSec) return;
    if (recording.type !== "audio" && recording.type !== "video") return;
    if (backfilledRef.current.has(recording.id)) return;
    backfilledRef.current.add(recording.id);

    const backfill = async () => {
      try {
        const blob = await resolveRecordingBlob(recording);
        if (!blob) return;
        const dur = await getMediaDuration(blob);
        if (dur == null) return;

        const updatedMeta = { ...recording, durationSec: dur, updatedAt: Date.now() };
        delete (updatedMeta as Record<string, unknown>).audioUrl;
        delete (updatedMeta as Record<string, unknown>).transcript;

        await opfsWrite(recording.metaPath, JSON.stringify(updatedMeta), {
          overwrite: true,
        });

        store.commit(
          fileEvents.fileUpdated({
            id: recording.id,
            durationSec: dur,
            updatedAt: new Date(),
          }),
        );

        reload?.();
      } catch {
        backfilledRef.current.delete(recording.id);
      }
    };

    void backfill();
  }, [recording, store, reload]);

  const handleTranscriptToggle = useCallback(async () => {
    if (hasTranscript) {
      setShowTranscript((prev) => !prev);
    } else if (recording && !isTranscribing) {
      setShowTranscript(true);
      try {
        await transcribeFile(recording);
        reload?.();
      } catch {
        // Error handled in hook
      }
    }
  }, [hasTranscript, recording, isTranscribing, transcribeFile, reload]);

  const handleRenameSubmit = useCallback(async () => {
    if (!recording || !renameValue.trim()) {
      setIsRenaming(false);
      return;
    }

    const newName = renameValue.trim();
    if (newName === recording.name) {
      setIsRenaming(false);
      return;
    }

    const updatedMeta = { ...recording, name: newName, updatedAt: Date.now() };
    delete (updatedMeta as Record<string, unknown>).audioUrl;
    delete (updatedMeta as Record<string, unknown>).transcript;

    await opfsWrite(recording.metaPath, JSON.stringify(updatedMeta), {
      overwrite: true,
    });

    store.commit(
      fileEvents.fileUpdated({
        id: recording.id,
        name: newName,
        updatedAt: new Date(),
      }),
    );

    setIsRenaming(false);
    reload?.();
  }, [recording, renameValue, store, reload]);

  const handleSaveManualTranscript = useCallback(async () => {
    if (!recording || !manualTranscript.trim()) return;

    setIsSavingManual(true);
    try {
      const transcriptPath = `${FILES_DIR}/${recording.id}/${recording.id}${TRANSCRIPT_SUFFIX}`;
      const transcript = {
        text: manualTranscript.trim(),
        words: [],
      };

      await opfsWrite(transcriptPath, JSON.stringify(transcript), {
        overwrite: true,
      });

      const updatedMeta = {
        ...recording,
        transcriptPath,
        transcriptPreview: manualTranscript.trim().slice(0, 280),
        updatedAt: Date.now(),
      };
      delete (updatedMeta as Record<string, unknown>).audioUrl;
      delete (updatedMeta as Record<string, unknown>).transcript;

      await opfsWrite(recording.metaPath, JSON.stringify(updatedMeta), {
        overwrite: true,
      });

      store.commit(
        fileEvents.fileTranscribed({
          id: recording.id,
          transcriptPath,
          updatedAt: new Date(),
        }),
      );

      reload?.();
    } finally {
      setIsSavingManual(false);
    }
  }, [recording, manualTranscript, store, reload]);

  const handleMediaReady = useCallback(() => {
    setMediaReadyToken((prev) => prev + 1);
  }, []);

  const handleTranscriptSeek = useCallback((time: number) => {
    seekRef.current = time;
  }, []);
  const canExportSrt = transcriptWords.length > 0;

  const searchMatches = useMemo(() => {
    return searchTranscript({
      query: searchQuery,
      text: transcriptText,
      words: transcriptWords,
    });
  }, [searchQuery, transcriptText, transcriptWords]);

  useEffect(() => {
    if (activeMatchIndex < searchMatches.length) return;
    setActiveMatchIndex(searchMatches.length > 0 ? searchMatches.length - 1 : 0);
  }, [activeMatchIndex, searchMatches.length]);

  const jumpToMatch = useCallback(
    (nextIndex: number) => {
      if (searchMatches.length === 0) return;
      const normalized =
        ((nextIndex % searchMatches.length) + searchMatches.length) %
        searchMatches.length;
      const match = searchMatches[normalized];
      setActiveMatchIndex(normalized);

      if (match?.startSec != null) {
        handleTranscriptSeek(match.startSec);
      }
    },
    [handleTranscriptSeek, searchMatches],
  );

  const handleExportTxt = useCallback(() => {
    if (!recording) return;

    const content =
      transcriptText.trim() || transcriptWords.map((word) => word.text).join("").trim();
    if (!content) return;

    downloadText(content, buildExportFileName(recording.name, "txt"));
  }, [recording, transcriptText, transcriptWords]);

  const handleExportSrt = useCallback(() => {
    if (!recording || !canExportSrt) return;
    const srt = buildSrt(transcriptWords);
    if (!srt.trim()) return;

    downloadText(
      srt,
      buildExportFileName(recording.name, "srt"),
      "application/x-subrip;charset=utf-8",
    );
  }, [canExportSrt, recording, transcriptWords]);

  useEffect(() => {
    if (!recording?.id) return;

    const params = new URLSearchParams(location.search);
    const rawSeek = params.get("seek");
    if (!rawSeek) return;

    const seekValue = Number(rawSeek);
    if (!Number.isFinite(seekValue) || seekValue < 0) {
      return;
    }

    const key = `${recording.id}:${seekValue}`;
    if (lastAppliedSeekKeyRef.current === key) {
      return;
    }

    lastAppliedSeekKeyRef.current = key;
    seekRef.current = seekValue;
  }, [location.search, recording?.id]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="rounded-2xl border border-zinc-200 bg-white px-5 py-4 shadow-sm">
          <p className="text-sm text-zinc-500">Loading recording...</p>
        </div>
      </div>
    );
  }

  if (error || !recording) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="rounded-2xl border border-zinc-200 bg-white px-5 py-4 shadow-sm">
          <p className="text-sm text-zinc-500">Failed to load recording.</p>
        </div>
      </div>
    );
  }

  const isMedia = recording.type === "audio" || recording.type === "video";
  const activeMatch = searchMatches[activeMatchIndex];
  const canSearch = hasSearchableTranscript && !isTranscribing;
  const shouldShowDiagnostics = import.meta.env.DEV;
  const recordingTypeLabel = getRecordingTypeLabel(recording.type);
  const transcriptWordCount =
    transcriptWords.length > 0
      ? transcriptWords.length
      : transcriptText
          .trim()
          .split(/\s+/)
          .filter(Boolean).length;
  const transcriptStatusLabel = isTranscribing
    ? "Transcribing now"
    : hasSearchableTranscript
      ? canExportSrt
        ? "Word-timed transcript"
        : "Transcript ready"
      : transcriptDiagnostics?.dropped
        ? "Transcript needs review"
        : "No transcript yet";
  const recordingDurationLabel =
    typeof recording.durationSec === "number" && recording.durationSec > 0
      ? formatDuration(recording.durationSec)
      : "Measuring...";
  const metaPills = [
    recordingTypeLabel,
    recordingDurationLabel,
    transcriptStatusLabel,
    transcriptWordCount > 0
      ? `${transcriptWordCount.toLocaleString()} words`
      : "No text yet",
  ] as const;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6 md:p-8">
      <BackButton />

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 flex-1 space-y-3">
            {isRenaming ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleRenameSubmit();
                }}
                className="flex flex-col gap-3 sm:flex-row sm:items-center"
              >
                <input
                  type="text"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  className="min-w-0 flex-1 rounded-xl border border-zinc-200 px-4 py-3 text-2xl font-semibold tracking-tight text-zinc-900 focus:border-zinc-400 focus:outline-none"
                  autoFocus
                />
                <div className="flex items-center gap-2">
                  <Button
                    type="submit"
                    className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
                  >
                    Save
                  </Button>
                  <Button
                    type="button"
                    onClick={() => {
                      setIsRenaming(false);
                      setRenameValue(recording.name);
                    }}
                    className="rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50 hover:text-zinc-900"
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            ) : (
              <button
                onClick={() => setIsRenaming(true)}
                className="group flex items-start gap-2 text-left"
              >
                <span className="break-words text-3xl font-semibold tracking-tight text-zinc-900">
                  {recording.name}
                </span>
                <PencilSimpleIcon className="mt-2 size-3.5 shrink-0 text-zinc-400 transition-colors group-hover:text-zinc-700" />
              </button>
            )}

            <p className="text-sm text-zinc-500">
              {formatDateTime(recording.createdAt)}
            </p>

            <div className="flex flex-wrap gap-2">
              {metaPills.map((item) => (
                <span
                  key={item}
                  className="rounded-full border border-zinc-200 px-3 py-1 text-xs text-zinc-500"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isMedia && (
              <Button
                onClick={handleTranscriptToggle}
                disabled={isTranscribing}
                className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
                  showTranscript
                    ? "bg-zinc-900 text-white hover:bg-zinc-800"
                    : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                }`}
                title={showTranscript ? "Hide transcript" : "Show transcript"}
              >
                {isTranscribing ? (
                  <SpinnerGapIcon className="size-4 animate-spin" />
                ) : (
                  <SubtitlesIcon
                    className="size-4"
                    weight={showTranscript ? "fill" : "bold"}
                  />
                )}
                <span>
                  {showTranscript
                    ? "Hide transcript"
                    : hasTranscript
                      ? "Open transcript"
                      : "Generate transcript"}
                </span>
              </Button>
            )}

            <Button
              onClick={async () => {
                await deleteRecording(recording);
                navigate("/files");
              }}
              className="flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-rose-600 transition-colors hover:bg-zinc-50"
              title="Delete recording"
            >
              <TrashIcon className="size-4" weight="bold" />
              <span>Delete</span>
            </Button>
          </div>
        </div>
      </section>

      {recording.type === "video" ? (
        <VideoPlayer
          videoUrl={recording.audioUrl}
          readyToken={mediaReadyToken}
          duration={recording.durationSec || 0}
          onReady={handleMediaReady}
          transcriptWords={transcriptWords}
          timeRef={currentTimeRef}
          seekRef={seekRef}
        />
      ) : (
        <AudioPlayer
          audioUrl={recording.audioUrl}
          audioReadyToken={mediaReadyToken}
          duration={recording.durationSec || 0}
          handleAudioReady={handleMediaReady}
          timeRef={currentTimeRef}
          seekRef={seekRef}
        />
      )}

      {showTranscript && (
        <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <div className="border-b border-zinc-200 px-4 py-4 md:px-5">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-zinc-900">
                    Transcript
                  </h2>
                  <p className="mt-1 text-sm text-zinc-500">
                    Search the transcript or jump to a matching moment.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    onClick={handleExportTxt}
                    disabled={!hasSearchableTranscript}
                    className="flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <DownloadSimpleIcon className="size-3.5" />
                    Export TXT
                  </Button>
                  <Button
                    onClick={handleExportSrt}
                    disabled={!canExportSrt}
                    title={
                      canExportSrt
                        ? "Export SRT"
                        : "SRT export needs word-level timestamps"
                    }
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
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search transcript..."
                    disabled={!canSearch}
                    className="w-full bg-transparent text-sm text-zinc-800 placeholder:text-zinc-400 focus:outline-none disabled:cursor-not-allowed disabled:text-zinc-400"
                  />
                </label>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center rounded-xl border border-zinc-200 bg-white">
                    <Button
                      onClick={() => jumpToMatch(activeMatchIndex - 1)}
                      disabled={searchMatches.length === 0}
                      className="flex h-9 w-9 items-center justify-center rounded-l-xl text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-40"
                      title="Previous match"
                    >
                      <CaretUpIcon className="size-3.5" />
                    </Button>
                    <Button
                      onClick={() => jumpToMatch(activeMatchIndex + 1)}
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
                      const isActive = match.id === activeMatch?.id;
                      const hasTimestamp = match.startSec != null;
                      return (
                        <button
                          key={match.id}
                          onClick={() => jumpToMatch(index)}
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
                  The last auto-transcription was filtered as likely hallucination.
                  Retry it or save a manual transcript.
                </div>
              )}

              <textarea
                value={manualTranscript}
                onChange={(event) => setManualTranscript(event.target.value)}
                placeholder="Type or paste your transcript here..."
                className="min-h-[220px] w-full resize-y rounded-xl border border-zinc-200 p-4 text-sm leading-7 text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none"
              />

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <Button
                  onClick={handleTranscriptToggle}
                  disabled={isTranscribing}
                  className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50"
                >
                  {transcriptDiagnostics
                    ? "Retry auto transcribe"
                    : "Auto transcribe"}
                </Button>
                <Button
                  onClick={handleSaveManualTranscript}
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
                onSeek={handleTranscriptSeek}
                isTranscribing={isTranscribing}
                transcriptionStatus={transcriptionStatus}
                transcriptionProgress={transcriptionProgress}
              />
            </div>
          )}
        </section>
      )}

      {shouldShowDiagnostics && transcriptDiagnostics && (
        <details className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <summary className="cursor-pointer list-none px-4 py-4 text-sm font-medium text-zinc-700 marker:hidden">
            Transcript diagnostics
          </summary>
          <div className="border-t border-zinc-200 p-4">
            <TranscriptDiagnosticsCard
              diagnostics={transcriptDiagnostics}
              title="Transcript Diagnostics"
            />
          </div>
        </details>
      )}
    </div>
  );
};
