import { useCallback, type JSX } from "react";
import * as stylex from "@stylexjs/stylex";

import { useDataSourceValue } from "@/hooks/widgets/useDataSourceValue";
import { useWidgetSourceCode } from "@/hooks/widgets/useWidgetSourceCode";
import { writeWidgetDataFile, type WriteWidgetDataResult } from "@/lib/widgets/widgetDataFile";
import { resolveWidgetInstanceParams } from "@/lib/widgets/widgetQueries";
import type { widgetDefinition, widgetInstance } from "@/livestore/widget";
import type { WritableReactiveWidgetStore } from "@/lib/widgets/widgetStore";

import { GeneratedWidgetFrame } from "./GeneratedWidgetFrame";
import { GeneratedWidgetLoadingState } from "./GeneratedWidgetLoadingState";

const styles = stylex.create({
  card: {
    backgroundColor: "var(--color-memora-surface)",
    border: "1px solid var(--color-memora-border)",
    borderRadius: "inherit",
    display: "flex",
    flexDirection: "column",
    // Fills the tile so the scrolling happens in `body` below, inside this card's border,
    // rather than on the tile wrapper outside it. overflow keeps the widget's square content
    // from spilling past the card's inherited rounded corners.
    height: "100%",
    overflow: "hidden",
    padding: 14,
  },
  body: { flex: 1, minHeight: 0, overflow: "auto" },
  status: {
    alignItems: "center",
    color: "var(--color-memora-text-muted)",
    display: "flex",
    fontSize: 13,
    flex: 1,
    justifyContent: "center",
    lineHeight: 1.5,
    minHeight: 128,
    padding: 16,
    textAlign: "center",
  },
  error: {
    backgroundColor: "var(--color-memora-warning-surface)",
    border: "1px solid var(--color-memora-warning-border)",
    borderRadius: 16,
    color: "var(--color-memora-warning-text)",
  },
});

export function GeneratedWidgetTile({
  store,
  definition,
  instance,
  onSendPrompt,
  onOpenLink,
}: {
  store: WritableReactiveWidgetStore;
  definition: widgetDefinition;
  instance: widgetInstance;
  onSendPrompt?: (text: string) => void;
  onOpenLink?: (url: string) => void;
}): JSX.Element {
  const params = resolveWidgetInstanceParams(definition, instance);
  const dataState = useDataSourceValue(store, definition.dataSourceName, params);
  const source = useWidgetSourceCode(store, definition.sourceFileId);
  const definitionFolderId = definition.folderId;

  const handleWriteData = useCallback(
    (name: string, content: string): Promise<WriteWidgetDataResult> => {
      if (!definitionFolderId) {
        return Promise.resolve({ ok: false, error: "This widget has no folder to write into." });
      }
      return writeWidgetDataFile({ store, definitionFolderId, name, content });
    },
    [store, definitionFolderId],
  );

  let content: JSX.Element;
  if (source.status === "loading" || dataState?.status === "loading") {
    content = <GeneratedWidgetLoadingState />;
  } else if (source.status !== "ready" || source.code === null) {
    content = (
      <div role="alert" {...stylex.props(styles.status, styles.error)}>
        This widget’s source couldn’t be loaded.
      </div>
    );
  } else if (dataState?.status === "error") {
    content = (
      <div role="alert" {...stylex.props(styles.status, styles.error)}>
        This widget’s data couldn’t be loaded.
      </div>
    );
  } else {
    content = (
      <GeneratedWidgetFrame
        widgetCode={source.code}
        data={dataState?.status === "ready" ? dataState.value : undefined}
        dataReady={dataState === null || dataState?.status === "ready"}
        title={definition.name}
        onSendPrompt={onSendPrompt}
        onOpenLink={onOpenLink}
        onWriteData={handleWriteData}
      />
    );
  }

  return (
    <section aria-label={definition.name} {...stylex.props(styles.card)}>
      <div {...stylex.props(styles.body)}>{content}</div>
    </section>
  );
}
