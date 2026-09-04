import { TrashIcon } from "@phosphor-icons/react";
import { useMemo } from "react";

import {
  SETTINGS_INSET_PANEL_CLASS_NAME,
  SETTINGS_PANEL_CLASS_NAME,
  SETTINGS_ROW_CLASS_NAME,
  SETTINGS_SECTION_BODY_CLASS_NAME,
  SETTINGS_SECTION_TITLE_CLASS_NAME,
} from "@/components/settings/settingsClassNames";
import { Button } from "@/components/ui/Button";
import { useMemorySettings } from "@/hooks/settings/useMemorySettings";
import { cn } from "@/lib/cn";
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
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          variant="secondary"
          onClick={() => void refreshMemoryData()}
          disabled={isMemoryLoading}
        >
          {isMemoryLoading ? "Refreshing..." : "Refresh"}
        </Button>
      </div>

      {!hasStoredMemory && !isMemoryLoading ? (
        <section className={cn(SETTINGS_INSET_PANEL_CLASS_NAME)}>
          <p className={SETTINGS_SECTION_BODY_CLASS_NAME}>No saved memory yet.</p>
        </section>
      ) : null}

      <section className={SETTINGS_PANEL_CLASS_NAME}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h3 className={SETTINGS_SECTION_TITLE_CLASS_NAME}>Personality</h3>
          <Button
            variant="destructive"
            onClick={() => void handleDeletePersonality()}
            disabled={!memoryData?.personality}
          >
            Delete profile
          </Button>
        </div>

        {memoryData?.personality ? (
          <pre className="memora-scrollbar mt-5 max-h-72 overflow-auto rounded-[1.3rem] border border-[var(--color-memora-border-soft)] bg-[var(--color-memora-surface-soft)] p-4 text-sm leading-7 whitespace-pre-wrap text-[var(--color-memora-text)]">
            {memoryData.personality}
          </pre>
        ) : (
          <div className={cn(SETTINGS_INSET_PANEL_CLASS_NAME, "mt-5")}>
            <p className={SETTINGS_SECTION_BODY_CLASS_NAME}>No saved personality.</p>
          </div>
        )}
      </section>

      <section className={SETTINGS_PANEL_CLASS_NAME}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <h3 className={SETTINGS_SECTION_TITLE_CLASS_NAME}>Notices</h3>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => void handleClearNotices()}
              disabled={sortedNotices.length === 0}
            >
              Clear notices
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleClearAllMemory()}
              disabled={!hasStoredMemory}
            >
              Clear all memory
            </Button>
          </div>
        </div>

        {sortedNotices.length > 0 ? (
          <div className="mt-5 space-y-3">
            {sortedNotices.map((notice) => (
              <div
                key={notice.id}
                className={cn(SETTINGS_ROW_CLASS_NAME, "flex items-start gap-3")}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-6 text-[var(--color-memora-text)]">{notice.text}</p>
                  <p className="mt-2 text-[11px] text-[var(--color-memora-text-soft)]">
                    Updated {formatMemoryTimestamp(notice.updatedAt)}
                  </p>
                </div>
                <Button
                  variant="destructiveIcon"
                  type="button"
                  onClick={() => void handleDeleteNotice(notice.id)}
                  aria-label="Delete notice"
                >
                  <TrashIcon className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className={cn(SETTINGS_INSET_PANEL_CLASS_NAME, "mt-5")}>
            <p className={SETTINGS_SECTION_BODY_CLASS_NAME}>No saved notices.</p>
          </div>
        )}
      </section>
    </div>
  );
}
