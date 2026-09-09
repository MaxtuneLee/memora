import { ArrowsClockwiseIcon, CheckIcon, TrashIcon } from "@phosphor-icons/react";

import LocalModelDownloadCard from "@/components/settings/LocalModelDownloadCard";
import {} from "@/components/settings/settingsClassNames";
import { Button } from "@/components/ui/Button";
import { useLocalModelDownloadSettings } from "@/hooks/settings/useLocalModelDownloadSettings";
import { useNemotronCacheSettings } from "@/hooks/settings/useNemotronCacheSettings";
import { cn } from "@/lib/cn";
import { formatBytes } from "@/lib/format";
import { NEMOTRON_MODEL_ID } from "@/lib/playground/nemotron/cache";

interface SettingsLocalModelsSectionProps {
  open: boolean;
}

export default function SettingsLocalModelsSection({ open }: SettingsLocalModelsSectionProps) {
  const {
    localModelOptions,
    localModelStates,
    handleDownloadLocalModel,
    handleDeleteLocalModel,
    refreshLocalModelState,
  } = useLocalModelDownloadSettings({ open });
  const {
    nemotronCacheState,
    handleDownloadNemotronCache,
    handleDeleteNemotronCache,
    refreshNemotronCacheState,
  } = useNemotronCacheSettings({ open });
  const isNemotronCached = nemotronCacheState.status === "cached";
  const isNemotronDownloading = nemotronCacheState.status === "downloading";
  const isNemotronChecking = nemotronCacheState.status === "checking";

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
            onDelete={handleDeleteLocalModel}
          />
        );
      })}

      <section className="rounded-[1.4rem] border border-[#ded7c9] bg-[#fffdf8] p-6 sm:p-7">
        <div className="flex items-start justify-between gap-5">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-[#24231f]">Nemotron ASR</h3>
            <p className="mt-1 text-sm leading-6 text-[#817b70]">{NEMOTRON_MODEL_ID}</p>
            <p className="mt-2 text-xs text-[var(--color-memora-text-soft)]">
              Used by the evaluation playground for streaming transcription comparisons.
            </p>
          </div>
          {isNemotronCached ? (
            <div className="flex shrink-0 flex-col items-end gap-1">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-[#eef3e2] px-3 py-1 text-sm font-semibold text-[#5c6c3d]">
                <CheckIcon className="size-3.5" weight="bold" />
                <span>Downloaded</span>
              </div>
              <span className="text-xs font-semibold text-[#6f695f]">
                {formatBytes(nemotronCacheState.totalBytes)}
              </span>
            </div>
          ) : null}
        </div>

        {isNemotronDownloading ? (
          <>
            <div className="mt-7 h-2 overflow-hidden rounded-full bg-[#e4e3d9]">
              <div
                className="h-full origin-left rounded-full bg-[#7d8c59] transition-transform duration-300"
                style={{ transform: `scaleX(${nemotronCacheState.progress / 100})` }}
              />
            </div>
            <div className="mt-3 flex items-center justify-between gap-4 text-sm font-semibold text-[#817b70]">
              <span className="tabular-nums">{formatBytes(nemotronCacheState.totalBytes)}</span>
              <span className="tabular-nums">{Math.round(nemotronCacheState.progress)}%</span>
            </div>
          </>
        ) : null}

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Button
            variant="primary"
            type="button"
            onClick={() => void handleDownloadNemotronCache()}
            disabled={isNemotronDownloading || isNemotronCached}
          >
            {isNemotronCached ? "Ready" : isNemotronDownloading ? "Downloading..." : "Download"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => void refreshNemotronCacheState()}
            disabled={isNemotronDownloading}
          >
            <ArrowsClockwiseIcon
              className={cn("size-3.5", isNemotronChecking ? "animate-spin" : "")}
            />
            <span>Refresh</span>
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => void handleDeleteNemotronCache()}
            disabled={isNemotronDownloading || !isNemotronCached}
          >
            <TrashIcon className="size-3.5" />
            <span>Delete</span>
          </Button>
        </div>

        {nemotronCacheState.status === "error" ? (
          <p className="mt-3 text-sm text-[var(--color-memora-warning-text)]">
            {nemotronCacheState.error}
          </p>
        ) : null}
      </section>
    </div>
  );
}
