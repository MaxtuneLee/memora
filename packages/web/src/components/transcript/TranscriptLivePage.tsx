import { GearSixIcon, SlidersHorizontalIcon, WarningIcon } from "@phosphor-icons/react";
import { isNemotronAsrModel } from "@memora/local-model-runtime";
import * as stylex from "@stylexjs/stylex";
import { motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
// import { Persona } from "@/components/assistant/Persona";
import { AppMenu, AppMenuContent, AppMenuItem, AppMenuTrigger } from "@/components/menu/AppMenu";
import { AudioVisualizer } from "@/components/transcript/AudioVisualizer";
import { BackButton } from "@/components/transcript/BackButton";
import { LanguageSelector } from "@/components/transcript/LanguageSelector";
import { Progress } from "@/components/ui/Progress";
import { TranscriptDiagnosticsCard } from "@/components/transcript/TranscriptDiagnosticsCard";
import { TranscriptionPanel } from "@/components/transcript/TranscriptionPanel";
import { TranscriptionControls } from "@/components/transcript/TranscriptionControls";
import {
  FINALIZE_WAVEFORM_EXIT_MS,
  SAVE_SECONDARY_HANDOFF_MS,
  SAVE_SUCCESS_SETTLE_MS,
  SAVE_SUCCESS_REDIRECT_DELAY_MS,
  START_WAVEFORM_REVEAL_DELAY_MS,
  getTranscriptionRailState,
  type TranscriptionRailPhase,
} from "@/components/transcript/transcriptionControlMotion";
import type { SettingsSectionId } from "@/types/settings";
import { useModelRouting } from "@/hooks/settings/useModelRouting";
import { useSettingsDialog } from "@/hooks/settings/useSettingsDialog";
import { useTranscript } from "@/hooks/transcript/useTranscript";

const styles = stylex.create({
  unsupported: { alignItems: "center", display: "flex", height: "100%", justifyContent: "center" },
  unsupportedContent: {
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
    textAlign: "center",
  },
  warningIcon: { color: "#f59e0b", height: "4rem", width: "4rem" },
  unsupportedTitle: { color: "#18181b", fontSize: "1.5rem", fontWeight: 600, lineHeight: "2rem" },
  unsupportedText: { color: "#71717a", marginTop: "0.5rem" },
  page: {
    display: "flex",
    flexDirection: "column",
    gap: "1.5rem",
    marginInline: "auto",
    maxWidth: "64rem",
    minHeight: "calc(100dvh - 4rem)",
    padding: { default: "1.5rem", "@media (min-width: 768px)": "2rem" },
    paddingBottom: { default: "8rem", "@media (min-width: 768px)": "9rem" },
  },
  header: { alignItems: "center", display: "flex", justifyContent: "space-between" },
  dock: { bottom: "1rem", marginTop: "auto", position: "sticky", zIndex: 20 },
  dockSurface: {
    backdropFilter: "blur(12px)",
    backgroundColor: "rgba(250,248,243,0.92)",
    borderColor: "rgba(228,228,231,0.8)",
    borderRadius: "28px",
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: "0 18px 50px rgba(24,24,27,0.08)",
    padding: { default: "0.75rem", "@media (min-width: 768px)": "1rem" },
  },
  readyRail: { alignItems: "center", display: "flex", minHeight: "3.75rem", position: "relative" },
  railLeading: {
    alignItems: "center",
    display: "flex",
    flex: 1,
    gap: "0.75rem",
    minWidth: 0,
    paddingRight: { default: "11.5rem", "@media (min-width: 768px)": "18rem" },
  },
  settingsTrigger: {
    alignItems: "center",
    backgroundColor: { default: "#ffffff", ":hover": "#fafafa" },
    borderColor: "#e4e4e7",
    borderRadius: "9999px",
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
    color: "#3f3f46",
    display: "flex",
    fontSize: "0.875rem",
    fontWeight: 500,
    gap: "0.5rem",
    lineHeight: "1.25rem",
    paddingBlock: "0.5rem",
    paddingInline: "0.75rem",
    transition: "background-color 150ms",
  },
  icon: { height: "1rem", width: "1rem" },
  menu: {
    backgroundColor: "#ffffff",
    borderRadius: "0.75rem",
    boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1)",
    minWidth: "13.75rem",
  },
  language: {
    borderRadius: "0.5rem",
    color: "#3f3f46",
    fontSize: "0.875rem",
    lineHeight: "1.25rem",
    paddingBlock: "0.5rem",
    paddingInline: "0.75rem",
  },
  languageInner: { marginTop: "0.5rem" },
  divider: { backgroundColor: "#f4f4f5", height: 1, marginBlock: "0.5rem" },
  menuItem: {
    alignItems: "center",
    borderRadius: "0.5rem",
    color: "#3f3f46",
    display: "flex",
    fontSize: "0.875rem",
    gap: "0.75rem",
    justifyContent: "space-between",
    lineHeight: "1.25rem",
    outline: "none",
    paddingBlock: "0.5rem",
    paddingInline: "0.75rem",
    transition: "background-color 150ms, color 150ms",
    "[data-highlighted]": { backgroundColor: "#f4f4f5", color: "#18181b" },
  },
  menuIcon: { alignSelf: "center", color: "#a1a1aa", flexShrink: 0, height: "1rem", width: "1rem" },
  visualizer: { flex: 1, minWidth: 0 },
  visualizerCanvas: { height: "1.5rem", minWidth: 0, width: "100%" },
  controls: {
    alignItems: "center",
    display: "flex",
    insetBlock: 0,
    insetInline: 0,
    pointerEvents: "none",
    position: "absolute",
  },
  loading: { display: "flex", flexDirection: "column", gap: "1rem" },
  loadingHeader: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: "0.75rem",
    justifyContent: "space-between",
  },
  loadingCopy: { minWidth: 0 },
  badge: {
    alignItems: "center",
    color: "#27272a",
    display: "flex",
    fontSize: "0.875rem",
    fontWeight: 500,
    gap: "0.5rem",
    lineHeight: "1.25rem",
  },
  badgeDot: { borderRadius: "9999px", height: "0.625rem", width: "0.625rem" },
  badgeWarning: { backgroundColor: "#fbbf24" },
  badgeReady: { backgroundColor: "#34d399" },
  badgeNeutral: { backgroundColor: "#a1a1aa" },
  loadingText: {
    color: "#71717a",
    fontSize: "0.875rem",
    lineHeight: "1.25rem",
    marginTop: "0.25rem",
  },
  loadButton: {
    backgroundColor: { default: "#18181b", ":hover": "#27272a" },
    borderRadius: "9999px",
    boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
    color: "#ffffff",
    fontSize: "0.875rem",
    fontWeight: 500,
    lineHeight: "1.25rem",
    paddingBlock: "0.5rem",
    paddingInline: "1rem",
    transition: "background-color 150ms",
  },
  progressList: {
    backgroundColor: "rgba(255,255,255,0.6)",
    borderColor: "rgba(228,228,231,0.8)",
    borderRadius: "1rem",
    borderStyle: "solid",
    borderWidth: 1,
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
    padding: "0.75rem",
  },
});

export const Component = () => {
  const { routing } = useModelRouting();
  const isNemotronSelected =
    routing.transcription.source === "local" && isNemotronAsrModel(routing.transcription.modelId);
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
  } = useTranscript();

  const navigate = useNavigate();
  const { openSettings } = useSettingsDialog();
  const isReady = status === "ready";
  const [railPhase, setRailPhase] = useState<TranscriptionRailPhase>("idle");
  const startRevealTimerRef = useRef<number | null>(null);
  const finalizeTimerRef = useRef<number | null>(null);
  const recenteringTimerRef = useRef<number | null>(null);
  const savedTimerRef = useRef<number | null>(null);
  const redirectTimerRef = useRef<number | null>(null);

  const clearTimer = (timerRef: { current: number | null }) => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const clearRailTimers = () => {
    clearTimer(startRevealTimerRef);
    clearTimer(finalizeTimerRef);
    clearTimer(recenteringTimerRef);
    clearTimer(savedTimerRef);
    clearTimer(redirectTimerRef);
  };

  useEffect(() => {
    if (saveStatus !== "success" || !lastSavedId) return;

    clearTimer(finalizeTimerRef);
    clearTimer(recenteringTimerRef);
    setRailPhase("saving");
    clearTimer(savedTimerRef);
    savedTimerRef.current = window.setTimeout(() => {
      setRailPhase("saved");
      savedTimerRef.current = null;
      clearTimer(redirectTimerRef);
      redirectTimerRef.current = window.setTimeout(() => {
        void navigate(`/transcript/file/${lastSavedId}`);
      }, SAVE_SUCCESS_REDIRECT_DELAY_MS);
    }, SAVE_SUCCESS_SETTLE_MS);
    clearTimer(redirectTimerRef);
  }, [lastSavedId, navigate, saveStatus]);

  useEffect(() => {
    return () => {
      clearRailTimers();
    };
  }, []);

  useEffect(() => {
    if (!isReady) {
      clearRailTimers();
      setRailPhase("idle");
    }
  }, [isReady]);

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
    if (status === "error") {
      return { label: "Transcription unavailable", tone: "warning" as const };
    }
    if (status === "ready") {
      return {
        label: "Model Ready",
        tone: "ready" as const,
      };
    }
    if (status === "loading") {
      return {
        label: "Model Loading",
        tone: "warning" as const,
      };
    }
    if (isCheckingCache) {
      return {
        label: "Checking Model Cache",
        tone: "neutral" as const,
      };
    }
    if (isModelCached) {
      return {
        label: "Preparing Model",
        tone: "warning" as const,
      };
    }
    return {
      label: "Model Not Downloaded",
      tone: "neutral" as const,
    };
  }, [isCheckingCache, isModelCached, status]);

  const settingsItems: Array<{ label: string; section: SettingsSectionId }> = useMemo(
    () => [{ label: "Model settings", section: "model-routing" }],
    [],
  );

  const shouldShowDiagnostics = import.meta.env.DEV;
  const layoutState = getTranscriptionRailState(railPhase);

  const handleStartControl = async () => {
    clearRailTimers();
    setRailPhase("starting");
    startRevealTimerRef.current = window.setTimeout(() => {
      setRailPhase("recording");
      startRevealTimerRef.current = null;
    }, START_WAVEFORM_REVEAL_DELAY_MS);
    try {
      await handleStartRecording();
    } catch {
      clearTimer(startRevealTimerRef);
      setRailPhase("idle");
    }
  };

  const handleFinalizeControl = () => {
    clearTimer(startRevealTimerRef);
    clearTimer(redirectTimerRef);
    setRailPhase("finalizing");
    handleFinalizeRecording();
    finalizeTimerRef.current = window.setTimeout(() => {
      setRailPhase("recentering");
      finalizeTimerRef.current = null;
      recenteringTimerRef.current = window.setTimeout(() => {
        setRailPhase("saving");
        recenteringTimerRef.current = null;
      }, SAVE_SECONDARY_HANDOFF_MS);
    }, FINALIZE_WAVEFORM_EXIT_MS);
  };

  if (!isWebGpuAvailable) {
    return (
      <div {...stylex.props(styles.unsupported)}>
        <div {...stylex.props(styles.unsupportedContent)}>
          <WarningIcon className={stylex.props(styles.warningIcon).className} weight="fill" />
          <div>
            <h2 {...stylex.props(styles.unsupportedTitle)}>WebGPU is not supported</h2>
            <p {...stylex.props(styles.unsupportedText)}>
              Your browser doesn't support WebGPU, which is required for real-time transcription.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div {...stylex.props(styles.page)}>
      <div {...stylex.props(styles.header)}>
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

      <div {...stylex.props(styles.dock)}>
        <div {...stylex.props(styles.dockSurface)}>
          {isReady ? (
            <div {...stylex.props(styles.readyRail)}>
              <div {...stylex.props(styles.railLeading)}>
                <AppMenu>
                  <AppMenuTrigger className={stylex.props(styles.settingsTrigger).className}>
                    <SlidersHorizontalIcon className={stylex.props(styles.icon).className} />
                    Settings
                  </AppMenuTrigger>
                  <AppMenuContent className={stylex.props(styles.menu).className}>
                    <div {...stylex.props(styles.language)}>
                      <div {...stylex.props(styles.languageInner)}>
                        <LanguageSelector
                          language={language}
                          setLanguage={updateLanguage}
                          includeAutoDetect={isNemotronSelected}
                        />
                      </div>
                    </div>
                    <div {...stylex.props(styles.divider)} />
                    {settingsItems.map((item) => (
                      <AppMenuItem
                        key={item.section}
                        onClick={() => openSettings(item.section)}
                        className={stylex.props(styles.menuItem).className}
                      >
                        <span>{item.label}</span>
                        <GearSixIcon className={stylex.props(styles.menuIcon).className} />
                      </AppMenuItem>
                    ))}
                  </AppMenuContent>
                </AppMenu>
                <motion.div
                  initial={false}
                  animate={{
                    opacity: layoutState.showVisualizer ? 1 : 0,
                    scaleX: layoutState.showVisualizer ? 1 : 0.78,
                  }}
                  transition={{
                    duration: layoutState.showVisualizer ? 0.24 : 0.18,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  className={stylex.props(styles.visualizer).className}
                  style={{ transformOrigin: "center right" }}
                >
                  <AudioVisualizer
                    stream={stream}
                    className={stylex.props(styles.visualizerCanvas).className}
                  />
                </motion.div>
              </div>

              <div {...stylex.props(styles.controls)}>
                <TranscriptionControls
                  controlMode={layoutState.controlMode}
                  dockedRight={layoutState.dockedRight}
                  showSecondaryControl={layoutState.showSecondaryControl}
                  paused={paused}
                  onStart={handleStartControl}
                  onPause={handlePauseRecording}
                  onResume={handleResumeRecording}
                  onFinalize={handleFinalizeControl}
                  isReady={isReady}
                />
              </div>
            </div>
          ) : (
            <div {...stylex.props(styles.loading)}>
              <div {...stylex.props(styles.loadingHeader)}>
                <div {...stylex.props(styles.loadingCopy)}>
                  <div {...stylex.props(styles.badge)}>
                    <span
                      {...stylex.props(
                        styles.badgeDot,
                        modelBadge.tone === "warning"
                          ? styles.badgeWarning
                          : modelBadge.tone === "ready"
                            ? styles.badgeReady
                            : styles.badgeNeutral,
                      )}
                    />
                    {modelBadge.label}
                  </div>
                  <p
                    className={stylex.props(styles.loadingText).className}
                    role={status === "error" ? "alert" : undefined}
                  >
                    {status === "error"
                      ? loadingMessage || "Check the transcription model settings and retry."
                      : status === "loading"
                        ? loadingMessage || "Downloading transcription model..."
                        : isCheckingCache
                          ? "Checking local model availability."
                          : isModelCached
                            ? "Finishing model preparation before recording."
                            : "Download the transcription model to start recording."}
                  </p>
                </div>

                {!isCheckingCache &&
                  (status === "error" || (!isModelCached && status === null)) && (
                    <button
                      type="button"
                      onClick={loadModel}
                      className={stylex.props(styles.loadButton).className}
                    >
                      {status === "error" ? "Retry" : "Load model"}
                    </button>
                  )}
              </div>

              {progressItems.length > 0 && (
                <div {...stylex.props(styles.progressList)}>
                  {progressItems.map(({ file, progress }, index) => (
                    <Progress key={`${file}-${index}`} label={file} value={progress} />
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
