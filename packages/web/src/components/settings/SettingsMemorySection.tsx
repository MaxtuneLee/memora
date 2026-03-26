import { Button } from "@base-ui/react/button";
import { TrashIcon } from "@phosphor-icons/react";
import { useMemo } from "react";

import { useMemorySettings } from "@/hooks/settings/useMemorySettings";
import { formatMemoryTimestamp } from "@/lib/settings/dialogHelpers";

interface SettingsMemorySectionProps {
  open: boolean;
}

export default function SettingsMemorySection({ open }: SettingsMemorySectionProps) {
  const {
    memoryData,
    isMemoryLoading,
    refreshMemoryData,
    handleDeletePersonality,
    handleDeleteNotice,
    handleClearNotices,
    handleClearAllMemory,
  } = useMemorySettings({ open });
  const sortedNotices = useMemo(() => {
    return [...(memoryData?.notices ?? [])].sort((left, right) => right.updatedAt - left.updatedAt);
  }, [memoryData]);
  const hasStoredMemory = !!memoryData?.personality || sortedNotices.length > 0;

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h4 className="text-sm font-semibold text-zinc-900">Assistant memory</h4>
            <p className="mt-1 text-sm text-zinc-500">
              Saved personality context and durable communication preferences.
            </p>
          </div>
          <Button
            onClick={() => void refreshMemoryData()}
            disabled={isMemoryLoading}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isMemoryLoading ? "Refreshing..." : "Refresh"}
          </Button>
        </div>
      </div>

      {!hasStoredMemory && !isMemoryLoading ? (
        <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50/60 p-6 text-sm text-zinc-500">
          No saved memory yet. Notices will appear here after the assistant learns durable
          preferences.
        </div>
      ) : null}

      <div className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h4 className="text-sm font-semibold text-zinc-900">Personality</h4>
            <p className="mt-1 text-sm text-zinc-500">
              The long-form profile used to personalize the assistant.
            </p>
          </div>
          <Button
            onClick={() => void handleDeletePersonality()}
            disabled={!memoryData?.personality}
            className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Delete
          </Button>
        </div>
        {memoryData?.personality ? (
          <pre className="mt-4 max-h-56 overflow-auto rounded-lg bg-zinc-50 p-3 text-xs leading-6 whitespace-pre-wrap text-zinc-700">
            {memoryData.personality}
          </pre>
        ) : (
          <p className="mt-4 text-sm text-zinc-400">No saved personality.</p>
        )}
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h4 className="text-sm font-semibold text-zinc-900">Notices</h4>
            <p className="mt-1 text-sm text-zinc-500">
              Short reminders about how the assistant should talk to the user.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => void handleClearNotices()}
              disabled={sortedNotices.length === 0}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Clear notices
            </Button>
            <Button
              onClick={() => void handleClearAllMemory()}
              disabled={!hasStoredMemory}
              className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Clear all memory
            </Button>
          </div>
        </div>
        {sortedNotices.length > 0 ? (
          <div className="mt-4 space-y-2">
            {sortedNotices.map((notice) => (
              <div
                key={notice.id}
                className="flex items-start justify-between gap-3 rounded-lg border border-zinc-100 bg-zinc-50/70 px-3 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-zinc-800">{notice.text}</p>
                  <p className="mt-1 text-[11px] text-zinc-400">
                    Updated {formatMemoryTimestamp(notice.updatedAt)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleDeleteNotice(notice.id)}
                  className="flex size-8 items-center justify-center rounded-md text-zinc-400 transition hover:bg-red-50 hover:text-red-500"
                  aria-label="Delete notice"
                >
                  <TrashIcon className="size-4" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-zinc-400">No saved notices.</p>
        )}
      </div>
    </div>
  );
}
