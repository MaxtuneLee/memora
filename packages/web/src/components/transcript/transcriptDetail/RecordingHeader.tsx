import type { CSSProperties } from "react";
import { Button } from "@base-ui/react/button";
import { PencilSimpleIcon, SpinnerGapIcon, SubtitlesIcon, TrashIcon } from "@phosphor-icons/react";

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
  const metaLine = metaPills.join(" \u00b7 ");

  return (
    <header
      data-surface="transcript-detail-header"
      className="memora-motion-enter pt-4"
      style={{ "--enter-delay": "40ms" } as CSSProperties}
    >
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-memora-text-soft)]">
            Saved {createdAtLabel}
          </p>

          <div className="mt-1.5">
            {isRenaming ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  onRenameSubmit();
                }}
                className="flex flex-col gap-3 sm:flex-row sm:items-end"
              >
                <input
                  type="text"
                  value={renameValue}
                  onChange={(event) => onRenameChange(event.target.value)}
                  className="min-w-0 flex-1 bg-transparent px-0 py-2 text-[clamp(1.3rem,2.8vw,2rem)] leading-[0.98] font-semibold tracking-[-0.035em] text-[var(--color-memora-text-strong)] focus:outline-none"
                  autoFocus
                  style={{ fontFamily: "var(--font-serif)" }}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="submit"
                    className="memora-interactive px-0 py-2 text-sm font-medium text-[var(--color-memora-text)] transition-colors hover:text-[var(--color-memora-text-strong)]"
                  >
                    Save
                  </Button>
                  <Button
                    type="button"
                    onClick={onRenameCancel}
                    className="memora-interactive px-0 py-2 text-sm font-medium text-[var(--color-memora-text-muted)] transition-colors hover:text-[var(--color-memora-text)]"
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            ) : (
              <button
                onClick={onStartRename}
                className="group flex max-w-4xl items-start gap-3 text-left"
              >
                <h1
                  className="break-words transition-colors duration-300 ease-[var(--ease-out-quart)] group-hover:text-[color-mix(in_srgb,var(--color-memora-text-strong)_86%,var(--color-memora-olive)_14%)] text-[clamp(1.35rem,2.6vw,2rem)] leading-[1] font-semibold tracking-[-0.03em] text-[var(--color-memora-text-strong)]"
                  style={{ fontFamily: "var(--font-serif)" }}
                >
                  {recording.name}
                </h1>
                <PencilSimpleIcon className="mt-1.5 size-4 shrink-0 text-[var(--color-memora-text-soft)] transition-[color,transform] duration-300 ease-[var(--ease-out-quart)] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-[var(--color-memora-text)]" />
              </button>
            )}
          </div>

          <p className="mt-2 text-sm leading-5 text-[var(--color-memora-text-muted)]">{metaLine}</p>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {isMedia ? (
            <Button
              onClick={onToggleTranscript}
              disabled={isTranscribing}
              className={`memora-interactive group flex min-h-10 items-center gap-2 px-0 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                showTranscript
                  ? "text-[var(--color-memora-text-strong)]"
                  : "text-[var(--color-memora-text-muted)] hover:text-[var(--color-memora-text)]"
              }`}
              title={showTranscript ? "Hide transcript" : "Show transcript"}
            >
              {isTranscribing ? (
                <SpinnerGapIcon className="size-4 animate-spin" />
              ) : (
                <SubtitlesIcon
                  className="size-4 transition-transform duration-300 ease-[var(--ease-out-quart)] group-hover:-translate-y-0.5"
                  weight={showTranscript ? "fill" : "bold"}
                />
              )}
              <span>
                {showTranscript
                  ? "Hide transcript"
                  : hasTranscript
                    ? "Show transcript"
                    : "Generate transcript"}
              </span>
            </Button>
          ) : null}

          <Button
            onClick={onDelete}
            className="memora-interactive group flex min-h-10 items-center gap-2 px-0 text-sm font-medium text-[var(--color-memora-warning-text)] transition-colors hover:opacity-80"
            title="Delete recording"
          >
            <TrashIcon
              className="size-4 transition-transform duration-300 ease-[var(--ease-out-quart)] group-hover:-translate-y-0.5"
              weight="bold"
            />
            <span>Delete</span>
          </Button>
        </div>
      </div>
    </header>
  );
};
