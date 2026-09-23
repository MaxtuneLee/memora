import * as stylex from "@stylexjs/stylex";
import { useCallback, useEffect, useId } from "react";

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
import { tokens } from "../../styles/stylex.stylex";

const LOCAL_MODELS = getLocalModelOptions();
const IMPLEMENTED_FEATURES: readonly AiFeatureId[] = [
  "assistant",
  "transcription",
  "sessionTitle",
  "memoryExtraction",
];

const styles = stylex.create({
  row: {
    borderBottomColor: tokens.border,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    minWidth: 0,
    paddingBlock: "1.25rem",
    ":first-child": {
      paddingTop: 0,
    },
    ":last-child": {
      borderBottomWidth: 0,
      paddingBottom: 0,
    },
  },
  legend: {
    color: tokens.textStrong,
    float: "left",
    fontSize: "0.875rem",
    fontWeight: 600,
    lineHeight: "1.25rem",
    marginBottom: "0.25rem",
    width: "100%",
  },
  description: {
    clear: "both",
    color: tokens.textMuted,
    fontSize: "0.875rem",
    lineHeight: "1.5rem",
  },
  grid: {
    display: "grid",
    gap: "0.75rem",
    marginTop: "0.75rem",
    gridTemplateColumns: {
      default: "minmax(0, 1fr)",
      "@media (min-width: 640px)": "repeat(2, minmax(0, 1fr))",
    },
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: "0.375rem",
    minWidth: 0,
  },
  wideField: {
    gridColumn: {
      default: "auto",
      "@media (min-width: 640px)": "span 2 / span 2",
    },
  },
  label: {
    color: tokens.textMuted,
    fontSize: "0.75rem",
    lineHeight: "1rem",
  },
  catalogStatus: {
    alignItems: "center",
    color: tokens.textMuted,
    display: "flex",
    fontSize: "0.75rem",
    gap: "0.75rem",
    justifyContent: "space-between",
    lineHeight: "1rem",
  },
  routeStatus: {
    color: tokens.textMuted,
    fontSize: "0.75rem",
    lineHeight: "1.25rem",
    marginTop: "0.75rem",
  },
});

function FeatureModelRow({
  feature,
  route,
  routing,
  providers,
  getApiKey,
  disabled,
  autoSelectFirstProvider,
  onChange,
}: {
  feature: AiFeatureId;
  route: FeatureModelRoute;
  routing: AiModelRouting;
  providers: readonly provider[];
  getApiKey: (provider: provider) => string;
  disabled: boolean;
  autoSelectFirstProvider: boolean;
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
  useEffect(() => {
    if (!autoSelectFirstProvider) return;
    if (route.source !== "cloud" || route.providerId || providers.length === 0) return;
    onChange(feature, { source: "cloud", providerId: providers[0].id, modelId: "" });
  }, [autoSelectFirstProvider, feature, onChange, providers, route]);
  if (!info) return null;
  return (
    <fieldset disabled={disabled} {...stylex.props(styles.row)}>
      <legend {...stylex.props(styles.legend)}>{info.label}</legend>
      <p {...stylex.props(styles.description)}>{info.description}</p>
      <div {...stylex.props(styles.grid)}>
        {sourceOptions.length > 1 ? (
          <div {...stylex.props(styles.field)}>
            <label htmlFor={`${id}-source`} {...stylex.props(styles.label)}>
              Execution
            </label>
            <Select
              id={`${id}-source`}
              disabled={disabled}
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
        ) : null}
        {route.source === "local" ? (
          <div {...stylex.props(styles.field)}>
            <label htmlFor={`${id}-local`} {...stylex.props(styles.label)}>
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
            <div {...stylex.props(styles.field)}>
              <label htmlFor={`${id}-provider`} {...stylex.props(styles.label)}>
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
            <div {...stylex.props(styles.field, styles.wideField)}>
              <label htmlFor={`${id}-model`} {...stylex.props(styles.label)}>
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
                <div {...stylex.props(styles.catalogStatus)}>
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
      <p {...stylex.props(styles.routeStatus)} role="status">
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
  autoSelectFirstProvider = false,
}: {
  features?: readonly AiFeatureId[];
  disabled?: boolean;
  autoSelectFirstProvider?: boolean;
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
          autoSelectFirstProvider={autoSelectFirstProvider}
          getApiKey={(entry) => readProviderApiKey(entry, credentials)}
          onChange={handleFeatureModelChange}
        />
      ))}
    </div>
  );
}
