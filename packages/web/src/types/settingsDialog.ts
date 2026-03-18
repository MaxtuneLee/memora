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
  name?: string;
  contextWindow?: number;
  maxOutputTokens?: number;
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
