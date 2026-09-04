import type { provider as ProviderRow } from "@/livestore/provider";
import type { ModelInfo, ProviderModelGroup, ProviderModelOption } from "@/types/settingsDialog";

const DEFAULT_MODEL_CONTEXT_WINDOW = 32768;
const DEFAULT_MODEL_MAX_TOKENS = 4096;
const ZERO_MODEL_COST: ModelInfo["cost"] = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
};

const normalizePositiveInteger = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.floor(parsed);
    }
  }

  return undefined;
};

const pickTopProviderValue = (record: Record<string, unknown>, field: string): unknown => {
  const topProvider = record.top_provider;
  if (!topProvider || typeof topProvider !== "object" || Array.isArray(topProvider)) {
    return undefined;
  }

  return (topProvider as Record<string, unknown>)[field];
};

const normalizeBoolean = (value: unknown): boolean | undefined => {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
};

const normalizeModelInputs = (value: unknown): Array<"text" | "image"> => {
  if (!Array.isArray(value)) return ["text"];

  const inputs = value.flatMap((item) => {
    if (item === "text" || item === "image") return [item];
    return [];
  });
  return inputs.length > 0 ? Array.from(new Set(inputs)) : ["text"];
};

const getNestedInput = (value: unknown): unknown => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  return (value as Record<string, unknown>).input;
};

const normalizeUnknownRecord = (value: unknown): Record<string, unknown> | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  // Only numeric sampling controls belong in synced model metadata. Never copy
  // arbitrary response fields or request headers, which may contain credentials.
  const allowed = new Set([
    "temperature",
    "top_p",
    "top_k",
    "min_p",
    "presence_penalty",
    "frequency_penalty",
    "repetition_penalty",
    "seed",
  ]);
  const entries = Object.entries(value).filter(
    ([key, entry]) => allowed.has(key) && typeof entry === "number" && Number.isFinite(entry),
  );
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
};

const normalizeThinkingLevelMap = (value: unknown): ModelInfo["thinkingLevelMap"] => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const supportedLevels = new Set(["off", "minimal", "low", "medium", "high", "xhigh", "max"]);
  const entries = Object.entries(value as Record<string, unknown>).flatMap(([level, mapped]) => {
    if (!supportedLevels.has(level) || (typeof mapped !== "string" && mapped !== null)) {
      return [];
    }
    return [[level, mapped] as const];
  });
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
};

const normalizeModelCost = (value: unknown): ModelInfo["cost"] => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...ZERO_MODEL_COST };
  }

  const record = value as Record<string, unknown>;
  return {
    input: normalizePositiveNumber(record.input) ?? 0,
    output: normalizePositiveNumber(record.output) ?? 0,
    cacheRead: normalizePositiveNumber(record.cacheRead ?? record.cache_read) ?? 0,
    cacheWrite: normalizePositiveNumber(record.cacheWrite ?? record.cache_write) ?? 0,
  };
};

const normalizePositiveNumber = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
  }
  return undefined;
};

export const parseProviderModel = (value: unknown): ModelInfo | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id.trim() : "";
  if (!id) {
    return null;
  }

  const name = typeof record.name === "string" ? record.name.trim() : "";
  const contextWindow = normalizePositiveInteger(
    record.contextWindow ??
      record.context_window ??
      record.contextLength ??
      record.context_length ??
      record.maxContextWindow ??
      record.max_context_window ??
      record.maxContextLength ??
      record.max_context_length ??
      record.maxInputTokens ??
      record.max_input_tokens ??
      record.inputTokenLimit ??
      record.input_token_limit ??
      pickTopProviderValue(record, "contextWindow") ??
      pickTopProviderValue(record, "context_window") ??
      pickTopProviderValue(record, "context_length"),
  );
  const maxTokens = normalizePositiveInteger(
    record.maxTokens ??
      record.maxOutputTokens ??
      record.max_output_tokens ??
      record.maxCompletionTokens ??
      record.max_completion_tokens ??
      record.completionTokenLimit ??
      record.completion_token_limit ??
      record.outputTokenLimit ??
      record.output_token_limit ??
      pickTopProviderValue(record, "maxOutputTokens") ??
      pickTopProviderValue(record, "max_output_tokens") ??
      pickTopProviderValue(record, "max_completion_tokens"),
  );

  return {
    id,
    name: name || id,
    reasoning:
      normalizeBoolean(record.reasoning ?? record.supportsReasoning ?? record.supports_reasoning) ??
      false,
    input: normalizeModelInputs(record.input ?? record.inputs ?? getNestedInput(record.modalities)),
    cost: normalizeModelCost(record.cost ?? record.pricing),
    contextWindow: contextWindow ?? DEFAULT_MODEL_CONTEXT_WINDOW,
    maxTokens: maxTokens ?? DEFAULT_MODEL_MAX_TOKENS,
    ...(normalizeThinkingLevelMap(record.thinkingLevelMap ?? record.thinking_level_map)
      ? {
          thinkingLevelMap: normalizeThinkingLevelMap(
            record.thinkingLevelMap ?? record.thinking_level_map,
          ),
        }
      : {}),
    ...(normalizeUnknownRecord(record.samplingParams ?? record.sampling_params)
      ? { samplingParams: normalizeUnknownRecord(record.samplingParams ?? record.sampling_params) }
      : {}),
  };
};

export const formatMemoryTimestamp = (timestamp: number): string => {
  return new Date(timestamp).toLocaleString();
};

export const toastIconColor = (type?: string): string => {
  switch (type) {
    case "success":
      return "bg-emerald-500";
    case "error":
      return "bg-rose-500";
    default:
      return "bg-zinc-400";
  }
};

export const parseProviderModels = (provider: Pick<ProviderRow, "models">): ModelInfo[] => {
  try {
    const parsed = JSON.parse(provider.models || "[]") as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.flatMap((entry) => {
      const model = parseProviderModel(entry);
      return model ? [model] : [];
    });
  } catch {
    return [];
  }
};

export const flattenProviderModels = (providers: ProviderRow[]): ProviderModelOption[] => {
  return providers.flatMap((provider) => {
    return parseProviderModels(provider).map((model) => ({
      providerId: provider.id,
      providerName: provider.name,
      model,
    }));
  });
};

export const filterProviderModelGroups = (
  providers: ProviderRow[],
  searchQuery: string,
): ProviderModelGroup[] => {
  const query = searchQuery.trim().toLowerCase();

  return providers
    .map((provider) => {
      const models = parseProviderModels(provider);
      if (!query) {
        return { provider, models };
      }

      const filteredModels = models.filter((model) => {
        const modelName = (model.name ?? "").toLowerCase();
        const modelId = model.id.toLowerCase();
        const providerName = provider.name.toLowerCase();
        return modelName.includes(query) || modelId.includes(query) || providerName.includes(query);
      });

      return {
        provider,
        models: filteredModels,
      };
    })
    .filter((entry) => entry.models.length > 0);
};

export const getSelectedModelLabel = (input: {
  providers: ProviderRow[];
  selectedProviderId: string;
  selectedModel: string;
  emptyLabel?: string;
}): string => {
  const { providers, selectedProviderId, selectedModel, emptyLabel = "Select a model..." } = input;

  if (!selectedModel) {
    return emptyLabel;
  }

  const allModels = flattenProviderModels(providers);
  const entry = allModels.find((modelEntry) => {
    return modelEntry.providerId === selectedProviderId && modelEntry.model.id === selectedModel;
  });

  if (!entry) {
    return selectedModel;
  }

  return `${entry.providerName} / ${entry.model.name ?? entry.model.id}`;
};
