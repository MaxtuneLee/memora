import {
  GearSixIcon,
  SlidersHorizontalIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router";
// import { Persona } from "@/components/assistant/Persona";
import {
  AppMenu,
  AppMenuContent,
  AppMenuItem,
  AppMenuTrigger,
} from "@/components/menu/AppMenu";
import { AudioVisualizer } from "@/components/transcript/AudioVisualizer";
import { BackButton } from "@/components/transcript/BackButton";
import { LanguageSelector } from "@/components/transcript/LanguageSelector";
import { Progress } from "@/components/Progress";
import { TranscriptDiagnosticsCard } from "@/components/transcript/TranscriptDiagnosticsCard";
import { TranscriptionPanel } from "@/components/transcript/TranscriptionPanel";
import { TranscriptionControls } from "@/components/transcript/TranscriptionControls";
import type { SettingsSectionId } from "@/types/settings";
import { useSettingsDialog } from "@/hooks/settings/useSettingsDialog";
import { useTranscript } from "@/hooks/transcript/useTranscript";

export const Component = () => {
  const {
    isWebGpuAvailable,
    status,
    loadingMessage,
    progressItems,
    accumulatedText,
    currentSegmentPrefix,
    currentSegment,
    tps,
    stream,
    recording,
    paused,
    saveStatus,
    lastSavedId,
    language,
    isModelCached,
    isCheckingCache,
    lastSegmentDiagnostics,
    loadModel,
    updateLanguage,
    checkModelCache,
    handleStartRecording,
    handlePauseRecording,
    handleResumeRecording,
    handleFinalizeRecording,
    handleReset,
  } = useTranscript();

  const navigate = useNavigate();
  const { openSettings } = useSettingsDialog();

  useEffect(() => {
    if (saveStatus === "success" && lastSavedId) {
      void navigate(`/transcript/file/${lastSavedId}`);
    }
  }, [saveStatus, lastSavedId, navigate]);

  useEffect(() => {
    if (status !== null) return;
    if (isCheckingCache) return;
    if (!isModelCached) return;
    loadModel();
  }, [isCheckingCache, isModelCached, loadModel, status]);

  useEffect(() => {
    void checkModelCache();
  }, [checkModelCache]);

  const modelBadge = useMemo(() => {
    if (status === "ready") {
      return {
        label: "Model Ready",
        tone: "bg-emerald-400",
      };
    }
    if (status === "loading") {
      return {
        label: "Model Loading",
        tone: "bg-amber-400",
      };
    }
    if (isCheckingCache) {
      return {
        label: "Checking Model Cache",
        tone: "bg-zinc-400",
      };
    }
    if (isModelCached) {
      return {
        label: "Preparing Model",
        tone: "bg-amber-400",
      };
    }
    return {
      label: "Model Not Downloaded",
      tone: "bg-zinc-400",
    };
  }, [isCheckingCache, isModelCached, status]);

  const settingsItems: Array<{ label: string; section: SettingsSectionId }> =
    useMemo(
      () => [
        { label: "Model settings", section: "ai-provider" },
        { label: "Language preferences", section: "general" },
      ],
      [],
    );

  const isReady = status === "ready";
  const shouldShowDiagnostics = import.meta.env.DEV;

  if (!isWebGpuAvailable) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-center">
          <WarningIcon className="size-16 text-amber-500" weight="fill" />
          <div>
            <h2 className="text-2xl font-semibold text-zinc-900">
              WebGPU is not supported
            </h2>
            <p className="mt-2 text-zinc-500">
              Your browser doesn't support WebGPU, which is required for
              real-time transcription.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-5xl flex-col gap-6 p-6 pb-32 md:p-8 md:pb-36">
      <div className="flex items-center justify-between">
        <BackButton />
      </div>

      {isReady && (
        <>
          <TranscriptionPanel
            accumulatedText={accumulatedText}
            currentSegmentPrefix={currentSegmentPrefix}
            currentSegment={currentSegment}
            tps={tps}
          />
          {shouldShowDiagnostics && (
            <TranscriptDiagnosticsCard
              diagnostics={lastSegmentDiagnostics}
              title="Latest Segment Diagnostics"
            />
          )}
        </>
      )}

      <div className="sticky bottom-4 z-20 mt-auto">
        <div className="rounded-[28px] border border-zinc-200/80 bg-[rgba(250,248,243,0.92)] p-3 shadow-[0_18px_50px_rgba(24,24,27,0.08)] backdrop-blur-md md:p-4">
          {isReady ? (
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <AppMenu>
                  <AppMenuTrigger className="flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50">
                    <SlidersHorizontalIcon className="size-4" />
                    Settings
                  </AppMenuTrigger>
                  <AppMenuContent className="min-w-55 rounded-xl bg-white shadow-lg">
                    <div className="rounded-lg px-3 py-2 text-sm text-zinc-700">
                      <div className="mt-2">
                        <LanguageSelector
                          language={language}
                          setLanguage={updateLanguage}
                        />
                      </div>
                    </div>
                    <div className="my-2 h-px bg-zinc-100" />
                    {settingsItems.map((item) => (
                      <AppMenuItem
                        key={item.section}
                        onClick={() => openSettings(item.section)}
                        className="flex items-center justify-between rounded-lg px-3 py-2 text-sm text-zinc-700 outline-none transition-colors data-highlighted:bg-zinc-100 data-highlighted:text-zinc-900"
                      >
                        <span>{item.label}</span>
                        <GearSixIcon className="size-4 text-zinc-400" />
                      </AppMenuItem>
                    ))}
                  </AppMenuContent>
                </AppMenu>
                <AudioVisualizer stream={stream} className="h-6 min-w-0 flex-1" />
              </div>

              <div className="flex justify-end md:justify-end">
                <TranscriptionControls
                  recording={recording}
                  paused={paused}
                  saveStatus={saveStatus}
                  onReset={handleReset}
                  onStart={handleStartRecording}
                  onPause={handlePauseRecording}
                  onResume={handleResumeRecording}
                  onFinalize={handleFinalizeRecording}
                  isReady={isReady}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-medium text-zinc-800">
                    <span className={`h-2.5 w-2.5 rounded-full ${modelBadge.tone}`} />
                    {modelBadge.label}
                  </div>
                  <p className="mt-1 text-sm text-zinc-500">
                    {status === "loading"
                      ? loadingMessage || "Downloading transcription model..."
                      : isCheckingCache
                        ? "Checking local model availability."
                        : isModelCached
                          ? "Finishing model preparation before recording."
                          : "Download the transcription model to start recording."}
                  </p>
                </div>

                {!isCheckingCache && !isModelCached && status === null && (
                  <button
                    type="button"
                    onClick={loadModel}
                    className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-zinc-800"
                  >
                    Load Model
                  </button>
                )}
              </div>

              {progressItems.length > 0 && (
                <div className="space-y-2 rounded-2xl border border-zinc-200/80 bg-white/60 p-3">
                  {progressItems.map(({ file, progress, total }, index) => (
                    <Progress
                      key={`${file}-${index}`}
                      text={file}
                      percentage={progress}
                      total={total}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
