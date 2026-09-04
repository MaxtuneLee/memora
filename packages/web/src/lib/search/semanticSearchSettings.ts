import type { BgeEmbeddingModel } from "@/lib/playground/bgeEmbeddingClient";

export interface SemanticSearchSettings {
  enabled: boolean;
  model: BgeEmbeddingModel;
}

const STORAGE_KEY = "memora.semantic-search.settings.v1";
export const DEFAULT_SEMANTIC_SEARCH_SETTINGS: SemanticSearchSettings = {
  enabled: false,
  model: "bge-m3",
};

export const readSemanticSearchSettings = (): SemanticSearchSettings => {
  if (typeof localStorage === "undefined") return DEFAULT_SEMANTIC_SEARCH_SETTINGS;
  try {
    const value = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? "null",
    ) as Partial<SemanticSearchSettings>;
    return {
      enabled: value.enabled === true,
      model: value.model === "bge-m3" ? "bge-m3" : DEFAULT_SEMANTIC_SEARCH_SETTINGS.model,
    };
  } catch {
    return DEFAULT_SEMANTIC_SEARCH_SETTINGS;
  }
};

export const writeSemanticSearchSettings = (settings: SemanticSearchSettings): void => {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
};
