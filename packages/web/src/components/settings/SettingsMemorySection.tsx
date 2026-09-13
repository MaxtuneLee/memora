import { TrashIcon } from "@phosphor-icons/react";
import { useMemo } from "react";

import {
  SETTINGS_FIELD_LABEL_CLASS_NAME,
  SETTINGS_INSET_PANEL_CLASS_NAME,
  SETTINGS_PANEL_CLASS_NAME,
  SETTINGS_ROW_CLASS_NAME,
  SETTINGS_SECTION_BODY_CLASS_NAME,
  SETTINGS_SECTION_TITLE_CLASS_NAME,
} from "@/components/settings/settingsClassNames";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { usePersonalizationProfile } from "@/hooks/settings/usePersonalizationProfile";
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
    handleDeleteNotice,
    handleClearNotices,
    handleClearAllMemory,
  } = useMemorySettings({ open });
  const {
    name,
    primaryUseCase,
    assistantStyle,
    customInstructions,
    handleNameChange,
    handleUseCaseChange,
    handleStyleChange,
    handleCustomInstructionsChange,
  } = usePersonalizationProfile();
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

      <section className={SETTINGS_PANEL_CLASS_NAME}>
        <div className="space-y-2">
          <h3 className={SETTINGS_SECTION_TITLE_CLASS_NAME}>Personality</h3>
          <p className={SETTINGS_SECTION_BODY_CLASS_NAME}>
            How Memora addresses you and the tone it responds with. Included in every conversation.
          </p>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="personalization-name" className={SETTINGS_FIELD_LABEL_CLASS_NAME}>
              Name
            </label>
            <Input
              id="personalization-name"
              value={name}
              onChange={(event) => handleNameChange(event.target.value)}
              placeholder="What should Memora call you?"
              className="mt-2"
            />
          </div>
          <div>
            <label htmlFor="personalization-use-case" className={SETTINGS_FIELD_LABEL_CLASS_NAME}>
              Use case
            </label>
            <Input
              id="personalization-use-case"
              value={primaryUseCase}
              onChange={(event) => handleUseCaseChange(event.target.value)}
              placeholder="What do you use Memora for?"
              className="mt-2"
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="personalization-style" className={SETTINGS_FIELD_LABEL_CLASS_NAME}>
              Tone
            </label>
            <Input
              id="personalization-style"
              value={assistantStyle}
              onChange={(event) => handleStyleChange(event.target.value)}
              placeholder="How should Memora reply to you?"
              className="mt-2"
            />
          </div>
        </div>
      </section>

      <section className={SETTINGS_PANEL_CLASS_NAME}>
        <div className="space-y-2">
          <h3 className={SETTINGS_SECTION_TITLE_CLASS_NAME}>Custom instructions</h3>
          <p className={SETTINGS_SECTION_BODY_CLASS_NAME}>
            Anything else Memora should always keep in mind when responding to you.
          </p>
        </div>
        <textarea
          value={customInstructions}
          onChange={(event) => handleCustomInstructionsChange(event.target.value)}
          placeholder="e.g. Always cite the source file when summarizing a document."
          rows={4}
          className="mt-5 w-full rounded-[1rem] border border-[var(--color-memora-border)] bg-[var(--color-memora-surface)] px-3.5 py-2.5 text-sm text-[var(--color-memora-text)] outline-none transition-[border-color,box-shadow,background-color] duration-300 ease-[var(--ease-out-quart)] placeholder:text-[var(--color-memora-text-soft)] focus:border-[var(--color-memora-olive-soft)] focus:ring-1 focus:ring-[var(--color-memora-olive-soft)]"
        />
      </section>

      {!hasStoredMemory && !isMemoryLoading ? (
        <section className={cn(SETTINGS_INSET_PANEL_CLASS_NAME)}>
          <p className={SETTINGS_SECTION_BODY_CLASS_NAME}>No saved memory yet.</p>
        </section>
      ) : null}

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
