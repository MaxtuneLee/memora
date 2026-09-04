import { useCallback, useId } from "react";

import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { useFeatureModels } from "@/hooks/settings/useFeatureModels";
import { useProviderModelCatalog } from "@/hooks/settings/useProviderModelCatalog";
import { useLocalModelSelectionNotice } from "@/hooks/settings/useLocalModelSelectionNotice";
import {
  AI_FEATURES,
  LOCAL_FEATURE_MODELS,
  canInheritChatModel,
  type AiFeatureId,
  type AiModelRouting,
  type FeatureModelRoute,
} from "@/lib/models/modelRouting";
import { getLocalModelOptions } from "@/lib/local-model";
import { readProviderApiKey } from "@/livestore/providerCredential";
import type { provider } from "@/livestore/provider";

const LOCAL_MODELS = getLocalModelOptions();
const IMPLEMENTED_FEATURES: readonly AiFeatureId[] = [
  "assistant",
  "personality",
  "sessionTitle",
  "memoryExtraction",
];

function FeatureModelRow({
  feature,
  route,
  routing,
  providers,
  getApiKey,
  disabled,
  onChange,
}: {
  feature: AiFeatureId;
  route: FeatureModelRoute;
  routing: AiModelRouting;
  providers: readonly provider[];
  getApiKey: (provider: provider) => string;
  disabled: boolean;
  onChange: (feature: AiFeatureId, route: FeatureModelRoute) => void;
}) {
  const id = useId();
  const info = AI_FEATURES.find((entry) => entry.id === feature);
  const target = route.source === "inherit" ? routing.assistant : route;
  const selectedProvider =
    target.source === "cloud"
      ? providers.find((entry) => entry.id === target.providerId)
      : undefined;
  const catalog = useProviderModelCatalog(
    route.source === "cloud" ? selectedProvider : undefined,
    route.source === "cloud" && selectedProvider ? getApiKey(selectedProvider) : "",
  );
  const modelOptions = catalog.models.map((model) => ({ value: model.id, label: model.name }));
  if (
    route.source === "cloud" &&
    route.modelId &&
    !modelOptions.some((model) => model.value === route.modelId)
  ) {
    modelOptions.unshift({ value: route.modelId, label: route.modelId });
  }
  const localOptions = LOCAL_FEATURE_MODELS[feature].map((modelId) => ({
    value: modelId,
    label: LOCAL_MODELS.find((entry) => entry.id === modelId)?.name ?? modelId,
  }));
  const sourceOptions = [
    ...(feature === "assistant" ? [] : [{ value: "local", label: "On this device" }]),
    { value: "cloud", label: "Cloud" },
    ...(canInheritChatModel(feature) ? [{ value: "inherit", label: "Follow chat model" }] : []),
  ];
  if (!info) return null;
  return (
    <fieldset
      disabled={disabled}
      className="min-w-0 space-y-3 border-b border-[var(--color-memora-border)] py-5 first:pt-0 last:border-b-0 last:pb-0"
    >
      <legend className="float-left mb-1 w-full text-sm font-semibold text-[var(--color-memora-text-strong)]">
        {info.label}
      </legend>
      <p className="clear-both text-sm leading-6 text-[var(--color-memora-text-muted)]">
        {info.description}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor={`${id}-source`} className="text-xs text-[var(--color-memora-text-muted)]">
            Execution
          </label>
          <Select
            id={`${id}-source`}
            disabled={disabled || feature === "assistant"}
            value={route.source}
            options={sourceOptions}
            onValueChange={(source) => {
              if (source === "inherit")
                onChange(feature, { source: "inherit", featureId: "assistant" });
              if (source === "local" && localOptions[0])
                onChange(feature, { source: "local", modelId: localOptions[0].value });
              if (source === "cloud")
                onChange(feature, {
                  source: "cloud",
                  providerId: routing.assistant.providerId,
                  modelId: routing.assistant.modelId,
                });
            }}
          />
        </div>
        {route.source === "local" ? (
          <div className="space-y-1.5">
            <label
              htmlFor={`${id}-local`}
              className="text-xs text-[var(--color-memora-text-muted)]"
            >
              Local model
            </label>
            <Select
              id={`${id}-local`}
              disabled={disabled}
              value={route.modelId}
              options={localOptions}
              onValueChange={(modelId) => {
                if (modelId) onChange(feature, { source: "local", modelId });
              }}
            />
          </div>
        ) : null}
        {route.source === "cloud" ? (
          <>
            <div className="space-y-1.5">
              <label
                htmlFor={`${id}-provider`}
                className="text-xs text-[var(--color-memora-text-muted)]"
              >
                Provider
              </label>
              <Select
                id={`${id}-provider`}
                disabled={disabled}
                value={route.providerId || null}
                placeholder="Choose a provider"
                options={providers.map((entry) => ({ value: entry.id, label: entry.name }))}
                onValueChange={(providerId) =>
                  onChange(feature, { source: "cloud", providerId: providerId ?? "", modelId: "" })
                }
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <label
                htmlFor={`${id}-model`}
                className="text-xs text-[var(--color-memora-text-muted)]"
              >
                Model
              </label>
              <Select
                id={`${id}-model`}
                value={route.modelId || null}
                disabled={disabled || !selectedProvider || modelOptions.length === 0}
                options={modelOptions}
                placeholder={catalog.loading ? "Loading models…" : "Choose a model"}
                onValueChange={(modelId) => {
                  if (modelId) onChange(feature, { ...route, modelId });
                }}
              />
              {selectedProvider ? (
                <div className="flex items-center justify-between gap-3 text-xs text-[var(--color-memora-text-muted)]">
                  <span role="status">
                    {catalog.loading
                      ? "Loading models…"
                      : (catalog.error ??
                        (catalog.models.length === 0
                          ? "No models returned by this provider."
                          : ""))}
                  </span>
                  <Button
                    type="button"
                    variant="plain"
                    disabled={disabled || catalog.loading}
                    onClick={catalog.reload}
                  >
                    {catalog.error ? "Retry" : "Refresh models"}
                  </Button>
                </div>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
      <p className="text-xs leading-5 text-[var(--color-memora-text-muted)]" role="status">
        {target.source === "local"
          ? "Processed on this device. Model files must be downloaded before first use. Failures never switch to cloud automatically."
          : !selectedProvider || !target.modelId
            ? "Choose a provider and model before using this feature."
            : `Sends this feature’s input to ${selectedProvider.name} using ${target.modelId}. ${getApiKey(selectedProvider) ? "API key saved on this device." : "No API key on this device. Add one in Providers if required."}`}
      </p>
    </fieldset>
  );
}

export default function FeatureModelSettings({
  features = IMPLEMENTED_FEATURES,
  disabled = false,
}: {
  features?: readonly AiFeatureId[];
  disabled?: boolean;
}) {
  const { routing, providers, credentials, setFeatureModel } = useFeatureModels();
  const notifyLocalModelSelection = useLocalModelSelectionNotice();
  const handleFeatureModelChange = useCallback(
    (feature: AiFeatureId, route: FeatureModelRoute) => {
      setFeatureModel(feature, route);
      notifyLocalModelSelection(feature, route);
    },
    [notifyLocalModelSelection, setFeatureModel],
  );
  return (
    <div>
      {features.map((feature) => (
        <FeatureModelRow
          key={feature}
          feature={feature}
          route={routing[feature]}
          routing={routing}
          providers={providers}
          disabled={disabled}
          getApiKey={(entry) => readProviderApiKey(entry, credentials)}
          onChange={handleFeatureModelChange}
        />
      ))}
    </div>
  );
}
