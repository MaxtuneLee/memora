import type { ModelInfo } from "../../types/settingsDialog";

export interface ModelMetadata {
  name?: string;
  contextWindow?: number;
  maxTokens?: number;
  reasoning?: boolean;
  input?: ModelInfo["input"];
  cost?: ModelInfo["cost"];
  thinkingLevelMap?: ModelInfo["thinkingLevelMap"];
}

interface CatalogModel extends ModelMetadata {
  canonicalId?: string;
}

export interface ModelsDevProvider {
  id: string;
  api?: string;
  models: Record<string, CatalogModel>;
}

export type ModelsDevCatalog = ModelsDevProvider[];

const recordOf = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

const positiveInteger = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : undefined;

const costOf = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;

const thinkingMapOf = (value: unknown): ModelInfo["thinkingLevelMap"] => {
  if (!Array.isArray(value)) return undefined;
  const effort = value.map(recordOf).find((option) => option?.type === "effort");
  if (!Array.isArray(effort?.values)) return undefined;
  const values = effort.values;
  const levels = ["minimal", "low", "medium", "high", "xhigh", "max"] as const;
  return {
    off: values.includes("none") ? "none" : null,
    ...Object.fromEntries(levels.map((level) => [level, values.includes(level) ? level : null])),
  };
};

const inputsOf = (value: unknown): ModelInfo["input"] | undefined => {
  const input = recordOf(value)?.input;
  if (!Array.isArray(input)) return undefined;
  const supported = input.filter(
    (entry): entry is "text" | "image" => entry === "text" || entry === "image",
  );
  return supported.length ? [...new Set(supported)] : undefined;
};

const modelCostOf = (value: unknown): ModelInfo["cost"] | undefined => {
  const cost = recordOf(value);
  if (!cost) return undefined;
  return {
    input: costOf(cost.input),
    output: costOf(cost.output),
    cacheRead: costOf(cost.cache_read),
    cacheWrite: costOf(cost.cache_write),
  };
};

const modelMetadataOf = (value: unknown): CatalogModel | undefined => {
  const model = recordOf(value);
  if (!model) return undefined;
  const limit = recordOf(model.limit);
  const contextWindow = positiveInteger(limit?.context);
  const maxTokens = positiveInteger(limit?.output);
  if (contextWindow === undefined && maxTokens === undefined) return undefined;
  return {
    name: typeof model.name === "string" ? model.name : undefined,
    canonicalId:
      typeof model.canonical_model_id === "string" ? model.canonical_model_id : undefined,
    contextWindow,
    maxTokens,
    reasoning: typeof model.reasoning === "boolean" ? model.reasoning : undefined,
    input: inputsOf(model.modalities),
    cost: modelCostOf(model.cost),
    thinkingLevelMap: thinkingMapOf(model.reasoning_options),
  };
};

/** Keep only the public metadata Memora uses; ignore request bodies, headers, and URLs on models. */
export const parseModelsDevCatalog = (value: unknown): ModelsDevCatalog => {
  const source = recordOf(value);
  if (!source) throw new Error("Invalid models.dev catalog.");
  const providers: ModelsDevCatalog = [];
  for (const [providerId, rawProvider] of Object.entries(source)) {
    const provider = recordOf(rawProvider);
    const rawModels = recordOf(provider?.models);
    if (!rawModels) continue;
    const models: Array<[string, CatalogModel]> = [];
    for (const [modelId, rawModel] of Object.entries(rawModels)) {
      const model = modelMetadataOf(rawModel);
      if (model) models.push([modelId, model]);
    }
    if (models.length)
      providers.push({
        id: providerId,
        api: typeof provider?.api === "string" ? provider.api : undefined,
        models: Object.fromEntries(models),
      });
  }
  if (!providers.length) throw new Error("Empty models.dev catalog.");
  return providers;
};

// These providers omit their standard endpoint from api.json.
const STANDARD_ENDPOINTS: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com/v1",
  google: "https://generativelanguage.googleapis.com/v1beta",
};

const endpointOf = (value: string): string =>
  value
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/v1(?:beta)?$/, "");
const ownModel = (provider: ModelsDevProvider, id: string): CatalogModel | undefined =>
  Object.hasOwn(provider.models, id) ? provider.models[id] : undefined;

export const findModelsDevMetadata = (
  catalog: ModelsDevCatalog,
  baseUrl: string,
  modelId: string,
): ModelMetadata | undefined => {
  const endpoint = endpointOf(baseUrl);
  const provider = catalog.find((entry) => {
    const api =
      entry.api ??
      (Object.hasOwn(STANDARD_ENDPOINTS, entry.id) ? STANDARD_ENDPOINTS[entry.id] : undefined);
    return api && endpointOf(api) === endpoint;
  });
  if (provider) return ownModel(provider, modelId);

  // Custom gateways may expose the original model ID. Prefer its owner, never the
  // smallest limit across unrelated providers. An ambiguous reseller-only ID stays unknown.
  const candidates = catalog.flatMap((entry) => {
    const model = ownModel(entry, modelId);
    return model ? [{ providerId: entry.id, model }] : [];
  });
  const owner = candidates.find(({ providerId, model }) =>
    model.canonicalId?.startsWith(`${providerId}/`),
  );
  return owner?.model ?? (candidates.length === 1 ? candidates[0].model : undefined);
};
