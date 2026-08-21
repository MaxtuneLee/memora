import type { provider as ProviderRow } from "@/livestore/provider";

export type ProviderApiFormat = "chat-completions" | "responses";

export interface ProviderFormState {
  name: string;
  baseUrl: string;
  apiKey: string;
  apiFormat: ProviderApiFormat;
}

export interface ModelInfo {
  id: string;
  name: string;
  reasoning: boolean;
  input: Array<"text" | "image">;
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
  contextWindow: number;
  maxTokens: number;
  thinkingLevelMap?: Partial<
    Record<"off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max", string | null>
  >;
  samplingParams?: Record<string, unknown>;
  headers?: Record<string, string>;
}

export interface ProviderModelOption {
  providerId: string;
  providerName: string;
  model: ModelInfo;
}

export interface ProviderModelGroup {
  provider: ProviderRow;
  models: ModelInfo[];
}
