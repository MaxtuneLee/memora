import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { useStore } from "@livestore/react";
import { write as opfsWrite } from "@memora/fs";
import { AudioPlayer } from "@/components/library/AudioPlayer";
import { VideoPlayer } from "@/components/library/VideoPlayer";
import { formatDateTime, formatDuration } from "@/lib/format";
import { useRecordingDetail } from "@/hooks/transcript/useRecordingDetail";
import { useMediaFiles } from "@/hooks/library/useMediaFiles";
import { useFileTranscription } from "@/hooks/transcript/useFileTranscription";
import { getMediaDuration, resolveRecordingBlob } from "@/lib/library/fileService";
import { BackButton } from "@/components/transcript/BackButton";
import { RecordingHeader } from "@/components/transcript/transcriptDetail/RecordingHeader";
import { TranscriptDiagnosticsPanel } from "@/components/transcript/transcriptDetail/TranscriptDiagnosticsPanel";
import { TranscriptSection } from "@/components/transcript/transcriptDetail/TranscriptSection";
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
          navigate("/files");
        }}
      />

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
        activeMatchId={activeMatch?.id}
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

      <TranscriptDiagnosticsPanel
        diagnostics={transcriptDiagnostics}
        visible={shouldShowDiagnostics}
      />
    </div>
  );
};
