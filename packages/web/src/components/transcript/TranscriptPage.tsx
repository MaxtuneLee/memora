import { Button } from "@base-ui/react/button";
import { Menu } from "@base-ui/react/menu";
import { GearSixIcon, SlidersHorizontalIcon } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { RecordingsGrid } from "@/components/library/FileGrid";
import { LanguageSelector } from "@/components/transcript/LanguageSelector";
import type { SettingsSectionId } from "@/types/settings";
import { useMediaFiles } from "@/hooks/library/useMediaFiles";
import { useSettingsDialog } from "@/hooks/settings/useSettingsDialog";
import { TRANSCRIPT_LANGUAGE_STORAGE_KEY } from "@/lib/transcript/transcriptUtils";

export const Component = () => {
  const { recordings, deleteRecording } = useMediaFiles();
  const { openSettings } = useSettingsDialog();
  const [language, setLanguage] = useState(() => {
    if (typeof window === "undefined") return "en";
    return localStorage.getItem(TRANSCRIPT_LANGUAGE_STORAGE_KEY) ?? "en";
  });

  const navigate = useNavigate();

  const settingsItems: Array<{ label: string; section: SettingsSectionId }> =
    useMemo(
      () => [
        { label: "Model settings", section: "ai-provider" },
        { label: "Language preferences", section: "general" },
      ],
      []
    );

  const handleLanguageChange = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setLanguage(trimmed);
    if (typeof window !== "undefined") {
      localStorage.setItem(TRANSCRIPT_LANGUAGE_STORAGE_KEY, trimmed);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6  p-6 md:p-8">
      <div className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">
              Transcripts
            </h1>
            <p className="mt-2 text-sm text-zinc-500">
              Browse your saved transcript history.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={() => navigate("/transcript/live")}
              className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-zinc-800"
            >
              Create New
            </Button>
            <Menu.Root>
              <Menu.Trigger className="flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50">
                <SlidersHorizontalIcon className="size-4" />
                Settings
              </Menu.Trigger>
              <Menu.Portal>
                <Menu.Positioner className="z-50" sideOffset={8}>
                  <Menu.Popup className="min-w-[220px] rounded-xl border border-zinc-200 bg-white p-2 shadow-lg">
                    <div className="rounded-lg px-3 py-2 text-sm text-zinc-700">
                      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-zinc-400">
                        Transcription
                      </div>
                      <div className="mt-2">
                        <LanguageSelector
                          language={language}
                          setLanguage={handleLanguageChange}
                        />
                      </div>
                    </div>
                    <Menu.Separator className="my-2 h-px bg-zinc-100" />
                    {settingsItems.map((item) => (
                      <Menu.Item
                        key={item.section}
                        onClick={() => openSettings(item.section)}
                        className="flex items-center justify-between rounded-lg px-3 py-2 text-sm text-zinc-700 outline-none transition-colors data-[highlighted]:bg-zinc-100 data-[highlighted]:text-zinc-900"
                      >
                        <span>{item.label}</span>
                        <GearSixIcon className="size-4 text-zinc-400" />
                      </Menu.Item>
                    ))}
                  </Menu.Popup>
                </Menu.Positioner>
              </Menu.Portal>
            </Menu.Root>
          </div>
        </div>
        <div className="text-xs text-zinc-500">
          Start a new live transcript or pick from recent history.
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">
              Transcript history
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              All saved transcripts from this device.
            </p>
          </div>
          <Button
            onClick={() => navigate("/files")}
            className="text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-900"
          >
            View all
          </Button>
        </div>
        <RecordingsGrid recordings={recordings} onDelete={deleteRecording} />
      </div>
    </div>
  );
};
