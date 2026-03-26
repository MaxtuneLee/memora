import {
  GearSixIcon,
  PlusIcon,
  SlidersHorizontalIcon,
} from "@phosphor-icons/react";
import { Button } from "@base-ui/react/button";
import { useMemo, type ReactNode } from "react";
import {
  AppMenu,
  AppMenuContent,
  AppMenuItem,
  AppMenuTrigger,
} from "@/components/menu/AppMenu";
import { AudioVisualizer } from "@/components/transcript/AudioVisualizer";
import { LanguageSelector } from "@/components/transcript/LanguageSelector";
import type { SettingsSectionId } from "@/types/settings";
import { useSettingsDialog } from "@/hooks/settings/useSettingsDialog";
import { BackButton } from "@/components/transcript/BackButton";

interface TranscriptionHeaderProps {
  stream: MediaStream | null;
  language: string;
  onLanguageChange: (language: string) => void;
  actions: ReactNode;
  onCreateNew: () => void;
  hideCreateNew?: boolean;
  modelBadge: {
    label: string;
    tone: string;
  };
}

export const TranscriptionHeader = ({
  stream,
  language,
  onLanguageChange,
  actions,
  onCreateNew,
  hideCreateNew = false,
  modelBadge,
}: TranscriptionHeaderProps) => {
  const { openSettings } = useSettingsDialog();

  const settingsItems: Array<{ label: string; section: SettingsSectionId }> =
    useMemo(
      () => [
        { label: "Model settings", section: "ai-provider" },
        { label: "Language preferences", section: "general" },
      ],
      [],
    );

  return (
    <div className="space-y-4 pb-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <BackButton />

        {actions}
      </div>
      <div className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {!hideCreateNew && (
              <Button
                onClick={onCreateNew}
                className="flex items-center gap-2 rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-zinc-800"
              >
                <PlusIcon className="size-4" weight="bold" />
                Create New
              </Button>
            )}
            <AppMenu>
              <AppMenuTrigger className="flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50">
                <SlidersHorizontalIcon className="size-4" />
                Settings
              </AppMenuTrigger>
              <AppMenuContent className="min-w-[220px] rounded-xl bg-white shadow-lg">
                <div className="rounded-lg px-3 py-2 text-sm text-zinc-700">
                  <div className="mt-2">
                    <LanguageSelector
                      language={language}
                      setLanguage={onLanguageChange}
                    />
                  </div>
                </div>
                <div className="my-2 h-px bg-zinc-100" />
                {settingsItems.map((item) => (
                  <AppMenuItem
                    key={item.section}
                    onClick={() => openSettings(item.section)}
                    className="flex items-center justify-between rounded-lg px-3 py-2 text-sm text-zinc-700 outline-none transition-colors data-[highlighted]:bg-zinc-100 data-[highlighted]:text-zinc-900"
                  >
                    <span>{item.label}</span>
                    <GearSixIcon className="size-4 text-zinc-400" />
                  </AppMenuItem>
                ))}
              </AppMenuContent>
            </AppMenu>
          </div>
          <AudioVisualizer stream={stream} className="h-6 max-w-full flex-1" />
          <span className={`px-3 py-1 text-xs flex items-center gap-2`}>
            <div className={`h-2 w-2 ${modelBadge.tone} rounded-full`}></div>
            {modelBadge.label}
          </span>
        </div>
      </div>
    </div>
  );
};
