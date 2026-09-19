import { useCallback, type JSX } from "react";
import * as stylex from "@stylexjs/stylex";

import { useDataSourceValue } from "@/hooks/widgets/useDataSourceValue";
import { useWidgetSourceCode } from "@/hooks/widgets/useWidgetSourceCode";
import { writeWidgetDataFile, type WriteWidgetDataResult } from "@/lib/widgets/widgetDataFile";
import { resolveWidgetInstanceParams } from "@/lib/widgets/widgetQueries";
import type { widgetDefinition, widgetInstance } from "@/livestore/widget";
import type { WritableReactiveWidgetStore } from "@/lib/widgets/widgetStore";

import { GeneratedWidgetFrame } from "./GeneratedWidgetFrame";

const styles = stylex.create({
  status: {
    alignItems: "center",
    color: "#857d72",
    display: "flex",
    fontSize: 13,
    height: "100%",
    justifyContent: "center",
    padding: 16,
    textAlign: "center",
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

  if (source.status === "loading") {
    return <div {...stylex.props(styles.status)}>Loading widget…</div>;
  }

  if (source.status !== "ready" || source.code === null) {
    return <div {...stylex.props(styles.status)}>This widget’s source couldn’t be loaded.</div>;
  }

  return (
    <GeneratedWidgetFrame
      widgetCode={source.code}
      data={dataState?.status === "ready" ? dataState.value : undefined}
      dataReady={dataState?.status === "ready"}
      title={definition.name}
      onSendPrompt={onSendPrompt}
      onOpenLink={onOpenLink}
      onWriteData={handleWriteData}
    />
  );
}
