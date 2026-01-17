import { Button } from "@base-ui/react/button";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { RecordingPlayer } from "@/components/files/RecordingPlayer";
import { TranscriptWords } from "@/components/files/TranscriptWords";
import { formatDateTime } from "@/lib/format";
import { useAudioPlayer } from "@/hooks/useAudioPlayer";
import { useRecordingDetail } from "@/hooks/useRecordingDetail";
import { useRecordings } from "@/hooks/useRecordings";
import { BackButton } from "@/components/backButton";
import { TrashIcon } from "@phosphor-icons/react";

export const Component = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audioReadyToken, setAudioReadyToken] = useState(0);
  const audioCallbackRef = useCallback((node: HTMLAudioElement | null) => {
    audioRef.current = node;
    setAudioReadyToken((prev) => prev + 1);
  }, []);
  const { recording, loading, error } = useRecordingDetail(id);
  const { deleteRecording } = useRecordings();
  const { isPlaying, currentTime, duration, togglePlay, seek } = useAudioPlayer(
    audioRef,
    audioReadyToken,
    recording?.durationSec ?? undefined
  );

  useEffect(() => {
    const audio = audioRef.current;
    if (recording?.audioUrl && audio) {
      audio.src = recording.audioUrl;
      audio.load();
      if (audio.readyState >= 1) {
        audio.dispatchEvent(new Event("durationchange"));
      }
    }
  }, [recording, audioReadyToken]);

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl rounded-lg border border-zinc-200 bg-white p-6 text-sm text-zinc-500">
        Loading recording...
      </div>
    );
  }

  if (error || !recording) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <p className="text-sm text-zinc-500">Failed to load recording.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="mb-2.5">
          <BackButton />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-500">
          <div>
            <span className="rounded-full bg-zinc-100 px-3 py-1 text-zinc-600">
              {formatDateTime(recording.createdAt)}
            </span>
          </div>
          <Button
            onClick={async () => {
              if (!recording) return;
              await deleteRecording(recording);
              navigate("/files");
            }}
            className="text-rose-500 hover:text-rose-600 flex items-center cursor-pointer"
          >
            <TrashIcon className="size-4 mr-1" />
            Delete
          </Button>
        </div>
      </div>

      <RecordingPlayer
        audioRef={audioCallbackRef}
        isPlaying={isPlaying}
        currentTime={currentTime}
        duration={duration}
        onTogglePlay={togglePlay}
        onSeek={seek}
      />

      <TranscriptWords
        words={recording.transcript?.words ?? []}
        currentTime={currentTime}
        onSeek={seek}
      />
    </div>
  );
};
