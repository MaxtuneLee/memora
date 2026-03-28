import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { useStore } from "@livestore/react";
import { write as opfsWrite } from "@memora/fs";

import { BackButton } from "@/components/transcript/BackButton";
import { useRecordingDetail } from "@/hooks/transcript/useRecordingDetail";
import { useMediaFiles } from "@/hooks/library/useMediaFiles";
import { useFileTranscription } from "@/hooks/transcript/useFileTranscription";
import { formatDateTime, formatDuration } from "@/lib/format";
import { getMediaDuration, resolveRecordingBlob } from "@/lib/library/fileService";
import { buildSrt, downloadText, searchTranscript } from "@/lib/transcript/transcriptSearchExport";
import { fileEvents } from "@/livestore/file";
import { FILES_DIR, TRANSCRIPT_SUFFIX, type FileType, type RecordingWord } from "@/types/library";
import { RecordingHeader } from "@/components/transcript/transcriptDetail/RecordingHeader";
import { TranscriptDiagnosticsPanel } from "@/components/transcript/transcriptDetail/TranscriptDiagnosticsPanel";
import { RecordingPreviewSurface } from "@/components/transcript/transcriptDetail/RecordingPreviewSurface";
import { TranscriptSection } from "@/components/transcript/transcriptDetail/TranscriptSection";

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
      return "Image file";
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
  const transcriptVisibilitySeedRef = useRef<string | null>(null);
  const transcriptWords = recording?.transcript?.words ?? EMPTY_WORDS;
  const transcriptText = recording?.transcript?.text ?? "";
  const transcriptDiagnostics = recording?.transcript?.diagnostics;
  const hasSearchableTranscript = transcriptWords.length > 0 || transcriptText.trim().length > 0;
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
    if (!recording?.id) {
      return;
    }

    if (transcriptVisibilitySeedRef.current === recording.id) {
      return;
    }

    transcriptVisibilitySeedRef.current = recording.id;
    setShowTranscript(true);
    setManualTranscript(recording.transcript?.text ?? "");
  }, [recording?.id, recording?.transcript?.text]);

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

        const updatedMeta = {
          ...recording,
          durationSec: dur,
          updatedAt: Date.now(),
        };
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
        ((nextIndex % searchMatches.length) + searchMatches.length) % searchMatches.length;
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
      transcriptText.trim() ||
      transcriptWords
        .map((word) => word.text)
        .join("")
        .trim();
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
      <div className="flex min-h-full items-center justify-center bg-[var(--color-memora-shell)] p-6">
        <p className="text-sm text-[var(--color-memora-text-muted)]">Loading recording...</p>
      </div>
    );
  }

  if (error || !recording) {
    return (
      <div className="flex min-h-full items-center justify-center bg-[var(--color-memora-shell)] p-6">
        <p className="text-sm text-[var(--color-memora-text-muted)]">Failed to load recording.</p>
      </div>
    );
  }

  const isMedia = recording.type === "audio" || recording.type === "video";
  const canSearch = hasSearchableTranscript && !isTranscribing;
  const shouldShowDiagnostics = import.meta.env.DEV || transcriptDiagnostics?.dropped === true;
  const recordingTypeLabel = getRecordingTypeLabel(recording.type);
  const transcriptWordCount =
    transcriptWords.length > 0
      ? transcriptWords.length
      : transcriptText.trim().split(/\s+/).filter(Boolean).length;
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
      : isMedia
        ? "Measuring..."
        : "Not timed";
  const metaPills = [
    recordingTypeLabel,
    recordingDurationLabel,
    transcriptStatusLabel,
    transcriptWordCount > 0 ? `${transcriptWordCount.toLocaleString()} words` : "No text yet",
  ] as const;

  return (
    <div
      className="min-h-full bg-memora-bg text-[var(--color-memora-text)]"
      style={{ fontFamily: "var(--font-sans)" }}
    >
      <div className="mx-auto w-full max-w-[1320px] px-6 py-6 md:px-10 md:py-8">
        <div
          className="memora-motion-enter flex items-center justify-between gap-3 pb-3"
          style={{ "--enter-delay": "0ms" } as CSSProperties}
        >
          <BackButton />
          <span className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-memora-text-soft)]">
            Transcript detail
          </span>
        </div>

        <div data-surface="transcript-detail-workbench" className="mt-2">
          <RecordingHeader
            recording={recording}
            isRenaming={isRenaming}
            renameValue={renameValue}
            metaPills={metaPills}
            isMedia={isMedia}
            showTranscript={showTranscript}
            hasTranscript={hasTranscript}
            isTranscribing={isTranscribing}
            createdAtLabel={formatDateTime(recording.createdAt)}
            onRenameChange={setRenameValue}
            onRenameSubmit={handleRenameSubmit}
            onRenameCancel={() => {
              setIsRenaming(false);
              setRenameValue(recording.name);
            }}
            onStartRename={() => setIsRenaming(true)}
            onToggleTranscript={handleTranscriptToggle}
            onDelete={async () => {
              await deleteRecording(recording);
              void navigate("/files");
            }}
          />

          <div
            className={`grid items-start gap-y-8 pt-5 ${
              showTranscript
                ? "xl:grid-cols-[minmax(0,1.05fr)_minmax(22rem,0.95fr)] xl:gap-x-1"
                : ""
            }`}
          >
            <div
              className={`memora-motion-enter ${showTranscript ? "xl:pr-2" : ""}`}
              style={{ "--enter-delay": "90ms" } as CSSProperties}
            >
              <RecordingPreviewSurface
                recording={recording}
                mediaReadyToken={mediaReadyToken}
                transcriptWords={transcriptWords}
                currentTimeRef={currentTimeRef}
                seekRef={seekRef}
                onMediaReady={handleMediaReady}
              />
            </div>

            {showTranscript ? (
              <div
                className="memora-motion-enter xl:pl-2"
                style={{ "--enter-delay": "150ms" } as CSSProperties}
              >
                <TranscriptSection
                  showTranscript={showTranscript}
                  hasSearchableTranscript={hasSearchableTranscript}
                  hasTranscript={hasTranscript}
                  isTranscribing={isTranscribing}
                  canExportSrt={canExportSrt}
                  canSearch={canSearch}
                  transcriptText={transcriptText}
                  transcriptWords={transcriptWords}
                  transcriptDiagnostics={transcriptDiagnostics}
                  transcriptionStatus={transcriptionStatus}
                  transcriptionProgress={transcriptionProgress}
                  currentTimeRef={currentTimeRef}
                  searchQuery={searchQuery}
                  activeMatchIndex={activeMatchIndex}
                  searchMatches={searchMatches}
                  manualTranscript={manualTranscript}
                  isSavingManual={isSavingManual}
                  onSearchQueryChange={setSearchQuery}
                  onJumpToMatch={jumpToMatch}
                  onManualTranscriptChange={setManualTranscript}
                  onExportTxt={handleExportTxt}
                  onExportSrt={handleExportSrt}
                  onTranscriptToggle={handleTranscriptToggle}
                  onSaveManualTranscript={handleSaveManualTranscript}
                  onSeek={handleTranscriptSeek}
                />
              </div>
            ) : null}
          </div>
        </div>

        {shouldShowDiagnostics ? (
          <div
            className="memora-motion-enter mt-10"
            style={{ "--enter-delay": "220ms" } as CSSProperties}
          >
            <TranscriptDiagnosticsPanel
              diagnostics={transcriptDiagnostics}
              visible={shouldShowDiagnostics}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
};
