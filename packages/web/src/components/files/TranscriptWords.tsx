import { Button } from "@base-ui/react/button";
import type { RecordingWord } from "../../lib/files";

interface TranscriptWordsProps {
  words: RecordingWord[];
  currentTime: number;
  onSeek: (time: number) => void;
}

export const TranscriptWords = ({
  words,
  currentTime,
  onSeek,
}: TranscriptWordsProps) => {
  if (words.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-500">
        Transcript will appear here once processing completes.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-800">
      <div className="mb-3 flex items-center justify-between text-xs text-zinc-400">
        <span>{words.length} words</span>
        <span>Click a word to jump</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {words.map((word, index) => {
          const isActive =
            currentTime >= word.timestamp[0] && currentTime <= word.timestamp[1];
          return (
            <Button
              key={`${word.timestamp[0]}-${index}`}
              className={`rounded px-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 ${
                isActive ? "bg-zinc-900 text-white" : "hover:bg-white"
              }`}
              onClick={() => onSeek(word.timestamp[0])}
              title={`${word.timestamp[0].toFixed(2)} → ${word.timestamp[1].toFixed(2)}`}
            >
              {word.text.startsWith(" ") ? " " : ""}
              {word.text.trim()}
            </Button>
          );
        })}
      </div>
    </div>
  );
};
