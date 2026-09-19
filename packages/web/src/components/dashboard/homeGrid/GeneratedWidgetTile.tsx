import type { JSX } from "react";
import * as stylex from "@stylexjs/stylex";

import { useDataSourceValue } from "@/hooks/widgets/useDataSourceValue";
import { useWidgetSourceCode } from "@/hooks/widgets/useWidgetSourceCode";
import { resolveWidgetInstanceParams } from "@/lib/widgets/widgetQueries";
import type { widgetDefinition, widgetInstance } from "@/livestore/widget";
import type { ReactiveWidgetStore } from "@/lib/widgets/widgetStore";

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
  store: ReactiveWidgetStore;
  definition: widgetDefinition;
  instance: widgetInstance;
  onSendPrompt?: (text: string) => void;
  onOpenLink?: (url: string) => void;
}): JSX.Element {
  const params = resolveWidgetInstanceParams(definition, instance);
  const dataState = useDataSourceValue(store, definition.dataSourceName, params);
  const source = useWidgetSourceCode(store, definition.sourceFileId);

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
    />
  );
}
