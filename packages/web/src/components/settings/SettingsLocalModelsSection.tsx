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
      <section className="rounded-[1.4rem] border border-[#ded7c9] bg-[#fffdf8] p-6 sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-[#24231f]">BGE semantic retrieval</h3>
            <p className="mt-1 text-sm leading-6 text-[#817b70]">
              BGE runs locally to build the semantic index and improve meaning-based search.
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-[#eef3e2] px-3 py-1 text-sm font-semibold text-[#5c6c3d]">
            Local
          </span>
        </div>
        <p className="mt-4 text-sm leading-6 text-[#817b70]">
          Select BM25, BGE, or hybrid retrieval in Indexing settings. The model is loaded when a
          semantic index is built.
        </p>
      </section>
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
