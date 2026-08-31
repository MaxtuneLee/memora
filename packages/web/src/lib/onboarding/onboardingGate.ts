import { loadGlobalMemoryData } from "@/lib/settings/personalityStorage";

export const ONBOARDING_GEMMA_MODEL_ID = "gemma-4-e2b-it-onnx";
export const ONBOARDING_WHISPER_MODEL_ID = "whisper-base-timestamped";
export interface OnboardingGateStatus {
  ready: boolean;
}

export const getOnboardingGateStatus = async (completed = false): Promise<OnboardingGateStatus> => {
  // Model availability belongs to the feature that uses it, never the app gate.
  if (completed) return { ready: true };
  const memory = await loadGlobalMemoryData();
  const hasPersonality = !!memory?.personality?.trim();

  return {
    ready: hasPersonality,
  };
};
