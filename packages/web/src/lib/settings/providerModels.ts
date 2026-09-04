import { parseProviderModel } from "./dialogHelpers";
import { normalizeProviderEndpoint } from "./providerEndpoint";
import type { ModelInfo } from "@/types/settingsDialog";

// Only in-flight requests are shared. Keys remain in memory and are never persisted.
const pendingRequests = new Map<string, Promise<ModelInfo[]>>();

export const fetchProviderModels = (baseUrl: string, apiKey: string): Promise<ModelInfo[]> => {
  const requestKey = JSON.stringify([baseUrl, apiKey]);
  const pending = pendingRequests.get(requestKey);
  if (pending) return pending;

  const request = (async () => {
    const endpoint = normalizeProviderEndpoint(baseUrl);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(`${endpoint}/models`, {
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
        credentials: "omit",
        redirect: "error",
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(
          `Could not fetch models (HTTP ${response.status}). Check the endpoint and API key.`,
        );
      }
      const json: unknown = await response.json();
      if (!json || typeof json !== "object" || Array.isArray(json)) {
        throw new Error("The provider returned an invalid model list.");
      }
      const record = json as Record<string, unknown>;
      const rawModels = record.data ?? record.models;
      if (!Array.isArray(rawModels)) {
        throw new Error("The provider returned an invalid model list.");
      }
      const models = new Map<string, ModelInfo>();
      for (const raw of rawModels) {
        const model = parseProviderModel(raw);
        if (model) models.set(model.id, model);
      }
      return [...models.values()];
    } finally {
      clearTimeout(timer);
    }
  })().finally(() => pendingRequests.delete(requestKey));

  pendingRequests.set(requestKey, request);
  return request;
};
