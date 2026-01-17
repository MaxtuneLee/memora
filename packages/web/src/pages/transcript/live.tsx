import { WarningIcon } from "@phosphor-icons/react";
import { Dialog } from "@base-ui/react/dialog";
import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router";
import { Persona } from "../../components/persona";
import { LoadingProgressCard } from "../../components/transcript/LoadingProgressCard";
import { ModelLoadCard } from "../../components/transcript/ModelLoadCard";
import { TranscriptionHeader } from "../../components/transcript/TranscriptionHeader";
import { TranscriptionPanel } from "../../components/transcript/TranscriptionPanel";
import { TranscriptionControls } from "../../components/transcript/TranscriptionControls";
import { useTranscript } from "../../hooks/useTranscript";

export const Component = () => {
  const {
    isWebGpuAvailable,
    status,
    loadingMessage,
    progressItems,
    accumulatedText,
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
    loadModel,
    updateLanguage,
    checkModelCache,
    handleStartRecording,
    handlePauseRecording,
    handleResumeRecording,
    handleFinalizeRecording,
    handleStopRecording,
    handleReset,
  } = useTranscript();

  console.log(
    "ischeckingCache",
    isCheckingCache,
    "isModelCached",
    isModelCached
  );

  const navigate = useNavigate();

  useEffect(() => {
    if (saveStatus === "success" && lastSavedId) {
      navigate(`/transcript/file/${lastSavedId}`);
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
        label: "Model Checking",
        tone: "bg-zinc-400",
      };
    }
    if (isModelCached) {
      return {
        label: "Model Loading",
        tone: "bg-amber-400",
      };
    }
    return {
      label: "Model Not Downloaded",
      tone: "bg-zinc-400",
    };
  }, [isCheckingCache, isModelCached, status]);

  const personaState = useMemo(() => {
    if (status !== "ready") {
      return "asleep";
    }
    if (recording && paused) {
      return "idle";
    }
    if (recording && currentSegment) {
      return "listening";
    }
    if (recording) {
      return "thinking";
    }
    if (accumulatedText) {
      return "speaking";
    }
    return "idle";
  }, [accumulatedText, currentSegment, paused, recording, status]);

  const shouldShowModal =
    !isCheckingCache && !isModelCached && status !== "ready";

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
    <div className="mx-auto max-w-5xl space-y-6">
      <TranscriptionHeader
        status={status}
        stream={stream}
        language={language}
        onLanguageChange={updateLanguage}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <TranscriptionControls
              recording={recording}
              paused={paused}
              saveStatus={saveStatus}
              onReset={handleReset}
              onStart={handleStartRecording}
              onPause={handlePauseRecording}
              onResume={handleResumeRecording}
              onFinalize={handleFinalizeRecording}
              onStop={handleStopRecording}
            />
          </div>
        }
        onCreateNew={() => navigate("/transcript")}
        hideCreateNew
        modelBadge={modelBadge}
      />

      {status === "ready" && (
        <TranscriptionPanel
          accumulatedText={accumulatedText}
          currentSegment={currentSegment}
          tps={tps}
        />
      )}

      <div className="flex justify-center">
        <Persona variant="obsidian" state={personaState} className="size-28 opacity-50" />
      </div>

      <Dialog.Root open={shouldShowModal} modal>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 bg-zinc-950/40" />
          <Dialog.Popup className="fixed left-1/2 top-1/2 w-[min(520px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl">
            {status === null && !isModelCached && !isCheckingCache && (
              <ModelLoadCard disabled={status !== null} onLoad={loadModel} />
            )}
            {status === "loading" && (
              <LoadingProgressCard
                loadingMessage={loadingMessage}
                progressItems={progressItems}
              />
            )}
            {(status === "loading" || (!isCheckingCache && !isModelCached)) && (
              <div className="mt-4 rounded-xl border border-dashed border-zinc-200 bg-zinc-50/60 p-4 text-xs text-zinc-500">
                Tip: keep this tab open while the model loads to maintain
                progress.
              </div>
            )}
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
};
