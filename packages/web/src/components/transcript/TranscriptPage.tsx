import { Button } from "@base-ui/react/button";
import {
  CaretDownIcon,
  CaretRightIcon,
  GearSixIcon,
  PlusIcon,
  SlidersHorizontalIcon,
} from "@phosphor-icons/react";
import { motion, useReducedMotion } from "motion/react";
import { type ReactElement, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { AppMenu, AppMenuContent, AppMenuItem, AppMenuTrigger } from "@/components/menu/AppMenu";
import { LanguageSelector } from "@/components/transcript/LanguageSelector";
import { TranscriptWorkbench } from "@/components/transcript/transcriptLanding/TranscriptWorkbench";
import { getTranscriptHistoryRowState } from "@/components/transcript/transcriptLanding/transcriptLandingState";
import type { SettingsSectionId } from "@/types/settings";
import { useMediaFiles } from "@/hooks/library/useMediaFiles";
import { useSettingsDialog } from "@/hooks/settings/useSettingsDialog";
import { TRANSCRIPT_LANGUAGE_STORAGE_KEY } from "@/lib/transcript/transcriptUtils";

const SECTION_EASE = [0.22, 1, 0.36, 1] as const;

export const Component = (): ReactElement => {
  const { recordings, deleteRecording } = useMediaFiles();
  const { openSettings } = useSettingsDialog();
  const reducedMotion = useReducedMotion() ?? false;
  const [language, setLanguage] = useState(() => {
    if (typeof window === "undefined") return "en";
    return localStorage.getItem(TRANSCRIPT_LANGUAGE_STORAGE_KEY) ?? "en";
  });

  const navigate = useNavigate();

  const settingsItems: Array<{
    description: string;
    label: string;
    section: SettingsSectionId;
  }> = useMemo(
    () => [
      {
        description: "Manage provider defaults and model behavior.",
        label: "Model settings",
        section: "ai-provider",
      },
      {
        description: "Open broader language and transcription preferences.",
        label: "Language preferences",
        section: "general",
      },
    ],
    [],
  );

  const handleLanguageChange = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setLanguage(trimmed);
    if (typeof window !== "undefined") {
      localStorage.setItem(TRANSCRIPT_LANGUAGE_STORAGE_KEY, trimmed);
    }
  };

  const workbenchItems = useMemo(
    () =>
      recordings.map((recording) => ({
        recording,
        state: getTranscriptHistoryRowState(recording),
      })),
    [recordings],
  );

  return (
    <div className="mx-auto w-full max-w-[1080px] px-6 py-8 md:px-10 md:py-10">
      <motion.header
        initial={reducedMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          duration: reducedMotion ? 0.12 : 0.24,
          ease: SECTION_EASE,
        }}
        className="flex flex-col gap-4 border-b border-[#e9e5dc] pb-4 md:flex-row md:items-end md:justify-between"
      >
        <div>
          <h1
            className="text-[clamp(1.9rem,4vw,2.45rem)] leading-[0.98] font-semibold tracking-[-0.045em] text-[#22211d]"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Transcripts
          </h1>
          <p className="mt-2 max-w-[34rem] text-sm leading-6 text-[#716c64] md:text-[15px]">
            Start a live capture or return to saved transcript work.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => navigate("/transcript/live")}
            className="memora-interactive inline-flex min-h-11 items-center rounded-full border border-[#2b2925] bg-[#22211d] px-4 text-sm font-semibold text-[#fffdfa] shadow-[0_1px_0_rgba(255,255,255,0.05)_inset,0_10px_24px_-22px_rgba(34,33,29,0.55)] transition-[background-color,border-color,box-shadow,transform] duration-300 ease-[var(--ease-out-quart)] hover:-translate-y-0.5 hover:border-[#4a463e] hover:bg-[#34312b] hover:shadow-[0_1px_0_rgba(255,255,255,0.12)_inset,0_0_0_1px_rgba(255,251,242,0.08),0_10px_24px_-22px_rgba(34,33,29,0.55)] active:translate-y-0 active:border-[#1f1e1a] active:bg-[#1d1c18] active:shadow-[0_1px_0_rgba(255,255,255,0.03)_inset,0_6px_14px_-14px_rgba(34,33,29,0.42)]"
          >
            <PlusIcon className="size-4 mr-2" />
            New live transcript
          </Button>
          <AppMenu>
            <AppMenuTrigger className="memora-interactive group gap-2.5 rounded-full border-[#e7e1d8] bg-[#fffdfa] px-2.5 py-1.5 shadow-none hover:bg-[#fffcf6] hover:shadow-none data-[open=true]:border-[#ddd7cb] data-[open=true]:bg-[#fffcf6] data-[open=true]:shadow-none">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#f6f3ec] text-[#7c7265] transition-[background-color,color] duration-300 ease-[var(--ease-out-quart)] group-hover:bg-[#efe8db] group-hover:text-[#6f695f]">
                <SlidersHorizontalIcon className="size-[18px]" />
              </span>
              <span className="text-sm font-semibold text-[#22211d]">Settings</span>
              <CaretDownIcon
                data-dashboard-menu-caret=""
                className="size-3.5 shrink-0 text-[#9a948a]"
                weight="bold"
              />
            </AppMenuTrigger>
            <AppMenuContent className="w-[292px]">
              <div className="rounded-[1rem] bg-[#fcfaf5] px-3 py-3 text-sm text-[#6f695f]">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#f1ece2] text-[#7c7265]">
                    <SlidersHorizontalIcon className="size-4" />
                  </span>
                  <div>
                    <div className="text-[11px] font-semibold tracking-[0.18em] text-[#90897d] uppercase">
                      Transcription
                    </div>
                    <div className="mt-0.5 text-sm font-semibold text-[#2b2925]">
                      Quick defaults
                    </div>
                  </div>
                </div>
                <p className="mt-3 text-[13px] leading-5 text-[#7b7469]">
                  Choose the language used when new transcript sessions start.
                </p>
                <div className="mt-3">
                  <LanguageSelector language={language} setLanguage={handleLanguageChange} />
                </div>
              </div>
              <div className="my-2 h-px bg-[#ede7dc]" />
              {settingsItems.map((item) => (
                <AppMenuItem
                  key={item.section}
                  onClick={() => openSettings(item.section)}
                  className="group flex w-full items-center justify-between gap-3 rounded-[1rem] px-3 py-3 text-left text-sm text-[#544f48] transition-[background-color] duration-300 ease-[var(--ease-out-quart)] hover:bg-[#f8f4ec]"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-semibold text-[#2b2925]">
                      {item.label}
                    </span>
                    <span className="mt-1 block text-[13px] leading-5 text-[#7b7469]">
                      {item.description}
                    </span>
                  </span>
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#f6f1e8] text-[#90897d] transition-[background-color,color] duration-300 ease-[var(--ease-out-quart)] group-hover:bg-[#efe8db] group-hover:text-[#7d7569]">
                    {item.section === "ai-provider" ? (
                      <GearSixIcon className="size-[18px]" />
                    ) : (
                      <CaretRightIcon className="size-4" weight="bold" />
                    )}
                  </span>
                </AppMenuItem>
              ))}
            </AppMenuContent>
          </AppMenu>
        </div>
      </motion.header>
      <div className="mt-6">
        <TranscriptWorkbench
          items={workbenchItems}
          onDelete={deleteRecording}
          emptyAction={
            <Button
              onClick={() => navigate("/transcript/live")}
              className="memora-interactive inline-flex min-h-11 items-center rounded-full border border-[#2b2925] bg-[#22211d] px-4 text-sm font-semibold text-[#fffdfa] shadow-[0_1px_0_rgba(255,255,255,0.05)_inset,0_10px_24px_-22px_rgba(34,33,29,0.55)] transition-[background-color,border-color,box-shadow,transform] duration-300 ease-[var(--ease-out-quart)] hover:-translate-y-0.5 hover:border-[#4a463e] hover:bg-[#34312b] hover:shadow-[0_1px_0_rgba(255,255,255,0.12)_inset,0_0_0_1px_rgba(255,251,242,0.08),0_10px_24px_-22px_rgba(34,33,29,0.55)] active:translate-y-0 active:border-[#1f1e1a] active:bg-[#1d1c18] active:shadow-[0_1px_0_rgba(255,255,255,0.03)_inset,0_6px_14px_-14px_rgba(34,33,29,0.42)]"
            >
              New live transcript
            </Button>
          }
        />
      </div>
    </div>
  );
};
