import { getLocalModelCacheStatus } from "@/lib/local-model";
import { loadGlobalMemoryData } from "@/lib/settings/personalityStorage";

export const ONBOARDING_GEMMA_MODEL_ID = "gemma-4-e2b-it-onnx";
export const ONBOARDING_WHISPER_MODEL_ID = "whisper-base-timestamped";
export const REQUIRED_ONBOARDING_MODEL_IDS = [
  ONBOARDING_GEMMA_MODEL_ID,
  ONBOARDING_WHISPER_MODEL_ID,
] as const;

export interface OnboardingGateStatus {
  ready: boolean;
  hasPersonality: boolean;
  hasRequiredModels: boolean;
  missingModelIds: string[];
}

export const getOnboardingGateStatus = async (): Promise<OnboardingGateStatus> => {
  const [memory, ...modelStatuses] = await Promise.all([
    loadGlobalMemoryData(),
    ...REQUIRED_ONBOARDING_MODEL_IDS.map((modelId) => getLocalModelCacheStatus(modelId)),
  ]);
  const hasPersonality = !!memory?.personality?.trim();
  const missingModelIds = REQUIRED_ONBOARDING_MODEL_IDS.filter((_modelId, index) => {
    return !modelStatuses[index]?.cached;
  });
  const hasRequiredModels = missingModelIds.length === 0;

  return {
    ready: hasPersonality && hasRequiredModels,
    hasPersonality,
    hasRequiredModels,
    missingModelIds,
  };
};
