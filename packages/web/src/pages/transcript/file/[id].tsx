import { Button } from "@base-ui/react/button";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { useStore } from "@livestore/react";
import { write as opfsWrite } from "@memora/fs";
import { AudioPlayer } from "@/components/files/AudioPlayer";
import { VideoPlayer } from "@/components/files/VideoPlayer";
import { TranscriptSidebar } from "@/components/files/TranscriptSidebar";
import { formatDateTime, formatDuration } from "@/lib/format";
import { useRecordingDetail } from "@/hooks/useRecordingDetail";
import { useRecordings } from "@/hooks/useRecordings";
import { useFileTranscription } from "@/hooks/useFileTranscription";
import { getMediaDuration, resolveRecordingBlob } from "@/lib/fileService";
import { BackButton } from "@/components/backButton";
import { fileEvents } from "@/livestore/file";
import { FILES_DIR, TRANSCRIPT_SUFFIX, type RecordingWord } from "@/lib/files";
import {
  buildSrt,
  downloadText,
  searchTranscript,
} from "@/lib/transcriptSearchExport";
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
import { HeartIcon } from "@phosphor-icons/react/dist/ssr";

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

export const Component = () => {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { store } = useStore();
  const [mediaReadyToken, setMediaReadyToken] = useState(0);
  const { recording, loading, error, reload } = useRecordingDetail(id);
  const { deleteRecording } = useRecordings();

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

  const hasTranscript =
    recording?.transcript &&
    (recording.transcript.text || recording.transcript.words.length > 0);

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

  const transcriptWords = recording?.transcript?.words ?? EMPTY_WORDS;
  const transcriptText = recording?.transcript?.text ?? "";
  const hasSearchableTranscript =
    transcriptWords.length > 0 || transcriptText.trim().length > 0;
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
        <p className="text-sm text-zinc-500">Loading...</p>
      </div>
    );
  }

  if (error || !recording) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="text-sm text-zinc-500">Failed to load recording.</p>
      </div>
    );
  }

  const isMedia = recording.type === "audio" || recording.type === "video";

  const activeMatch = searchMatches[activeMatchIndex];
  const canSearch = hasSearchableTranscript && !isTranscribing;

  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto p-6 md:p-8">
        <div className="mx-auto w-full max-w-4xl space-y-6">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <BackButton />
              <div className="flex items-center rounded-full border border-zinc-200 bg-white p-1 shadow-sm">
                {isMedia && (
                  <Button
                    onClick={handleTranscriptToggle}
                    disabled={isTranscribing}
                    className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-zinc-100 active:bg-zinc-200 disabled:opacity-50 ${
                      showTranscript ? "bg-zinc-900 text-white hover:bg-zinc-800" : "text-zinc-600"
                    }`}
                    title={showTranscript ? "Hide transcript" : "Show transcript"}
                  >
                    {isTranscribing ? (
                      <SpinnerGapIcon className="size-3.5 animate-spin" />
                    ) : (
                      <SubtitlesIcon
                        className="size-3.5"
                        weight={showTranscript ? "fill" : "bold"}
                      />
                    )}
                  </Button>
                )}
                <Button className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-600 transition-colors hover:bg-zinc-100 active:bg-zinc-200">
                  <HeartIcon className="size-3.5" weight="bold" />
                </Button>
                <Button
                  onClick={async () => {
                    if (!recording) return;
                    await deleteRecording(recording);
                    navigate("/files");
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-rose-500 transition-colors hover:bg-zinc-100 active:bg-zinc-200"
                  title="Delete"
                >
                  <TrashIcon className="size-3.5" weight="bold" />
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              {isRenaming ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleRenameSubmit();
                  }}
                  className="flex flex-wrap items-center gap-2"
                >
                  <input
                    type="text"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    className="rounded-md border border-zinc-300 px-2 py-1 text-lg text-zinc-900 focus:border-zinc-400 focus:outline-none"
                    autoFocus
                  />
                  <Button
                    type="submit"
                    className="rounded-md bg-zinc-900 px-2 py-1 text-xs text-white hover:bg-zinc-800"
                  >
                    Save
                  </Button>
                  <Button
                    type="button"
                    onClick={() => {
                      setIsRenaming(false);
                      setRenameValue(recording.name);
                    }}
                    className="text-zinc-500 hover:text-zinc-700"
                  >
                    Cancel
                  </Button>
                </form>
              ) : (
                <button
                  onClick={() => setIsRenaming(true)}
                  className="flex items-center gap-2 text-left text-xl font-semibold text-zinc-900"
                >
                  <span>{recording.name}</span>
                  <PencilSimpleIcon className="size-3.5 text-zinc-400" />
                </button>
              )}
              <div className="text-xs text-zinc-400">
                {formatDateTime(recording.createdAt)}
              </div>
            </div>
          </div>

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
            <section className="rounded-xl border border-zinc-200 bg-white shadow-sm">
              <div className="border-b border-zinc-200 px-4 py-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <label className="flex min-w-0 items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm">
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
                    <div className="flex items-center rounded-lg border border-zinc-200 bg-white">
                      <Button
                        onClick={() => jumpToMatch(activeMatchIndex - 1)}
                        disabled={searchMatches.length === 0}
                        className="flex h-8 w-8 items-center justify-center text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-40"
                        title="Previous match"
                      >
                        <CaretUpIcon className="size-3.5" />
                      </Button>
                      <Button
                        onClick={() => jumpToMatch(activeMatchIndex + 1)}
                        disabled={searchMatches.length === 0}
                        className="flex h-8 w-8 items-center justify-center border-l border-zinc-200 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-40"
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

                    <Button
                      onClick={handleExportTxt}
                      disabled={!hasSearchableTranscript}
                      className="flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
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
                      className="flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <DownloadSimpleIcon className="size-3.5" />
                      Export SRT
                    </Button>
                  </div>
                </div>

                {!canExportSrt && hasTranscript && (
                  <p className="mt-2 text-xs text-zinc-400">
                    SRT export is unavailable because this transcript has no word timestamps.
                  </p>
                )}

                {searchQuery.trim().length > 0 && (
                  <div className="mt-3 max-h-36 space-y-1 overflow-y-auto rounded-lg border border-zinc-200 bg-zinc-50 p-2">
                    {searchMatches.length === 0 ? (
                      <p className="px-2 py-1 text-xs text-zinc-500">
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
                            className={`flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
                              isActive
                                ? "bg-zinc-900 text-white"
                                : "text-zinc-600 hover:bg-zinc-200/70 hover:text-zinc-900"
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

              {showTranscript && !hasTranscript && !isTranscribing ? (
                <div className="space-y-3 p-4">
                  <textarea
                    value={manualTranscript}
                    onChange={(event) => setManualTranscript(event.target.value)}
                    placeholder="Type or paste your transcript here..."
                    className="min-h-32 w-full resize-y rounded-lg border border-zinc-200 bg-white p-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none"
                  />
                  <div className="flex items-center justify-between">
                    <Button
                      onClick={handleTranscriptToggle}
                      disabled={isTranscribing}
                      className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs text-white hover:bg-zinc-800 disabled:opacity-50"
                    >
                      Auto Transcribe
                    </Button>
                    <Button
                      onClick={handleSaveManualTranscript}
                      disabled={!manualTranscript.trim() || isSavingManual}
                      className="flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-xs text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      <FloppyDiskIcon className="size-3.5" />
                      {isSavingManual ? "Saving..." : "Save"}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="h-[min(42vh,480px)]">
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
        </div>
      </div>
    </div>
  );
};
