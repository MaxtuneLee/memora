import { Button } from "@base-ui/react/button";
import {
  PencilSimpleIcon,
  SpinnerGapIcon,
  SubtitlesIcon,
  TrashIcon,
} from "@phosphor-icons/react";

import type { RecordingItem } from "@/types/library";

interface RecordingHeaderProps {
  recording: RecordingItem;
  isRenaming: boolean;
  renameValue: string;
  metaPills: readonly string[];
  isMedia: boolean;
  showTranscript: boolean;
  hasTranscript: boolean;
  isTranscribing: boolean;
  createdAtLabel: string;
  onRenameChange: (value: string) => void;
  onRenameSubmit: () => void;
  onRenameCancel: () => void;
  onStartRename: () => void;
  onToggleTranscript: () => void | Promise<void>;
  onDelete: () => void | Promise<void>;
}

export const RecordingHeader = ({
  recording,
  isRenaming,
  renameValue,
  metaPills,
  isMedia,
  showTranscript,
  hasTranscript,
  isTranscribing,
  createdAtLabel,
  onRenameChange,
  onRenameSubmit,
  onRenameCancel,
  onStartRename,
  onToggleTranscript,
  onDelete,
}: RecordingHeaderProps) => {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1 space-y-3">
          {isRenaming ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                onRenameSubmit();
              }}
              className="flex flex-col gap-3 sm:flex-row sm:items-center"
            >
              <input
                type="text"
                value={renameValue}
                onChange={(event) => onRenameChange(event.target.value)}
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
                  onClick={onRenameCancel}
                  className="rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50 hover:text-zinc-900"
                >
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <button
              onClick={onStartRename}
              className="group flex items-start gap-2 text-left"
            >
              <span className="break-words text-3xl font-semibold tracking-tight text-zinc-900">
                {recording.name}
              </span>
              <PencilSimpleIcon className="mt-2 size-3.5 shrink-0 text-zinc-400 transition-colors group-hover:text-zinc-700" />
            </button>
          )}

          <p className="text-sm text-zinc-500">{createdAtLabel}</p>

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
              onClick={onToggleTranscript}
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
            onClick={onDelete}
            className="flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-rose-600 transition-colors hover:bg-zinc-50"
            title="Delete recording"
          >
            <TrashIcon className="size-4" weight="bold" />
            <span>Delete</span>
          </Button>
        </div>
      </div>
    </section>
  );
};
