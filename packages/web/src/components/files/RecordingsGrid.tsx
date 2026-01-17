import type { RecordingItem } from "../../lib/files";
import { RecordingCard } from "./RecordingCard";

interface RecordingsGridProps {
  recordings: RecordingItem[];
  onDelete: (recording: RecordingItem) => void;
}

export const RecordingsGrid = ({ recordings, onDelete }: RecordingsGridProps) => {
  if (recordings.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500">
        No recordings yet. Record a transcript to see it here.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {recordings.map((recording) => (
        <RecordingCard
          key={recording.id}
          recording={recording}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
};
