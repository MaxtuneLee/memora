import { Button } from "@base-ui/react/button";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useStore } from "@livestore/react";
import { write as opfsWrite } from "@memora/fs";
import { AnimatePresence, motion } from "motion/react";
import { AudioPlayer } from "@/components/files/AudioPlayer";
import { VideoPlayer } from "@/components/files/VideoPlayer";
import { TranscriptSidebar } from "@/components/files/TranscriptSidebar";
import { formatDateTime } from "@/lib/format";
import { useRecordingDetail } from "@/hooks/useRecordingDetail";
import { useRecordings } from "@/hooks/useRecordings";
import { useFileTranscription } from "@/hooks/useFileTranscription";
import { getMediaDuration, resolveRecordingBlob } from "@/lib/fileService";
import { BackButton } from "@/components/backButton";
import { fileEvents } from "@/livestore/file";
import { FILES_DIR, TRANSCRIPT_SUFFIX } from "@/lib/files";
import {
  TrashIcon,
  PencilSimpleIcon,
  SpinnerGapIcon,
  FloppyDiskIcon,
  SubtitlesIcon,
} from "@phosphor-icons/react";
import { HeartIcon } from "@phosphor-icons/react/dist/ssr";

export const Component = () => {
  const { id } = useParams();
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
  const [isSavingManual, setIsSavingManual] = useState(false);
  const currentTimeRef = useRef(0);
  const seekRef = useRef<number | null>(null);

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

          {showTranscript && !hasTranscript && !isTranscribing && (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 lg:hidden">
              <textarea
                value={manualTranscript}
                onChange={(e) => setManualTranscript(e.target.value)}
                placeholder="Type or paste your transcript here..."
                className="w-full rounded-lg border border-zinc-200 bg-white p-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none min-h-24 resize-y"
              />
              <div className="mt-3 flex items-center justify-between">
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
          )}
        </div>
      </div>

      <AnimatePresence>
        {showTranscript && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 360, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
            className="hidden h-full shrink-0 overflow-hidden border-l border-zinc-200 bg-white lg:block"
          >
            <div className="flex h-full w-[360px] flex-col">
              <TranscriptSidebar
                words={recording.transcript?.words ?? []}
                text={recording.transcript?.text}
                timeRef={currentTimeRef}
                onSeek={handleTranscriptSeek}
                isTranscribing={isTranscribing}
                transcriptionStatus={transcriptionStatus}
                transcriptionProgress={transcriptionProgress}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
