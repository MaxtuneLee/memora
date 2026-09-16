import * as stylex from "@stylexjs/stylex";

import LocalModelDownloadCard from "@/components/settings/LocalModelDownloadCard";
import { useLocalModelDownloadSettings } from "@/hooks/settings/useLocalModelDownloadSettings";

const styles = stylex.create({
  stack: { display: "flex", flexDirection: "column", gap: 12 },
  overview: {
    backgroundColor: "#fffdf8",
    borderColor: "#ded7c9",
    borderRadius: "1.4rem",
    borderStyle: "solid",
    borderWidth: 1,
    padding: 24,
    "@media (min-width: 640px)": { padding: 28 },
  },
  overviewHeader: {
    alignItems: "flex-start",
    display: "flex",
    gap: 16,
    justifyContent: "space-between",
  },
  title: { color: "#24231f", fontSize: "1.125rem", fontWeight: 600 },
  body: { color: "#817b70", fontSize: "0.875rem", lineHeight: 1.5 },
  titleBody: { marginTop: 4 },
  badge: {
    backgroundColor: "#eef3e2",
    borderRadius: 9999,
    color: "#5c6c3d",
    flexShrink: 0,
    fontSize: "0.875rem",
    fontWeight: 600,
    paddingBlock: 4,
    paddingInline: 12,
  },
  overviewBody: { marginTop: 16 },
  metadata: { color: "var(--color-memora-text-soft)", fontSize: "0.75rem" },
});

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

  return (
    <div {...stylex.props(styles.stack)}>
      <section {...stylex.props(styles.overview)}>
        <div {...stylex.props(styles.overviewHeader)}>
          <div>
            <h3 {...stylex.props(styles.title)}>BGE semantic retrieval</h3>
            <p {...stylex.props(styles.body, styles.titleBody)}>
              BGE runs locally to build the semantic index and improve meaning-based search.
            </p>
          </div>
          <span {...stylex.props(styles.badge)}>Local</span>
        </div>
        <p {...stylex.props(styles.body, styles.overviewBody)}>
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
              <p {...stylex.props(styles.metadata)}>
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
    </div>
  );
}
