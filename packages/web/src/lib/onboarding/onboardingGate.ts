import { loadGlobalMemoryData } from "@/lib/settings/personalityStorage";
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
