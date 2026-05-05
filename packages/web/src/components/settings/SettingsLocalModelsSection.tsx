import LocalModelDownloadCard from "@/components/settings/LocalModelDownloadCard";
import {} from "@/components/settings/settingsClassNames";
import { useLocalModelDownloadSettings } from "@/hooks/settings/useLocalModelDownloadSettings";

interface SettingsLocalModelsSectionProps {
  open: boolean;
}

export default function SettingsLocalModelsSection({ open }: SettingsLocalModelsSectionProps) {
  const { localModelOptions, localModelStates, handleDownloadLocalModel, refreshLocalModelState } =
    useLocalModelDownloadSettings({ open });

  return (
    <div className="space-y-3">
      {localModelOptions.map((model) => {
        const state = localModelStates[model.id];
        const cacheFileCount = state?.cache?.fileCount ?? 0;

        return (
          <LocalModelDownloadCard
            key={model.id}
            model={model}
            state={state}
            title={model.name}
            description={model.manifest.modelId}
            meta={
              <p className="text-xs text-[var(--color-memora-text-soft)]">
                {model.manifest.device.toUpperCase()} · {model.manifest.modalities.input.join(", ")}
                {" -> "}
                {model.manifest.modalities.output.join(", ")}
                {state?.status === "cached" ? ` · ${cacheFileCount} cached files` : ""}
              </p>
            }
            onDownload={handleDownloadLocalModel}
            onRefresh={refreshLocalModelState}
          />
        );
      })}
    </div>
  );
}
