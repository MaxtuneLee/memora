import type { provider as ProviderRow } from "@/livestore/provider";
import type {
  ModelInfo,
  ProviderModelGroup,
  ProviderModelOption,
} from "@/types/settingsDialog";

const toModelInfo = (value: unknown): ModelInfo | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id.trim() : "";
  if (!id) {
    return null;
  }

  const name = typeof record.name === "string" ? record.name.trim() : "";
  return {
    id,
    ...(name ? { name } : {}),
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

export const parseProviderModels = (
  provider: Pick<ProviderRow, "models">,
): ModelInfo[] => {
  try {
    const parsed = JSON.parse(provider.models || "[]") as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.flatMap((entry) => {
      const model = toModelInfo(entry);
      return model ? [model] : [];
    });
  } catch {
    return [];
  }
};

export const flattenProviderModels = (
  providers: ProviderRow[],
): ProviderModelOption[] => {
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
        return (
          modelName.includes(query) ||
          modelId.includes(query) ||
          providerName.includes(query)
        );
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
  const {
    providers,
    selectedProviderId,
    selectedModel,
    emptyLabel = "Select a model...",
  } = input;

  if (!selectedModel) {
    return emptyLabel;
  }

  const allModels = flattenProviderModels(providers);
  const entry = allModels.find((modelEntry) => {
    return (
      modelEntry.providerId === selectedProviderId &&
      modelEntry.model.id === selectedModel
    );
  });

  if (!entry) {
    return selectedModel;
  }

  return `${entry.providerName} / ${entry.model.name ?? entry.model.id}`;
};
