import type { DataSourceName } from "@/livestore/widget";
import { createWidgetDefinition, type WidgetDefinitionStoreLike } from "./widgetDefinitions";

export interface SaveChatWidgetDefinitionInput {
  id: string;
  name: string;
  widgetCode: string;
  dataSourceName?: DataSourceName;
  dataSourceParams?: Record<string, unknown>;
}

export type SaveChatWidgetDefinitionResult =
  | { ok: true }
  | { ok: false; reason: "missing-data-source" | "missing-widget-code" };

export const saveChatWidgetDefinition = ({
  store,
  input,
}: {
  store: WidgetDefinitionStoreLike;
  input: SaveChatWidgetDefinitionInput;
}): SaveChatWidgetDefinitionResult => {
  if (!input.dataSourceName) {
    return { ok: false, reason: "missing-data-source" };
  }

  if (!input.widgetCode.trim()) {
    return { ok: false, reason: "missing-widget-code" };
  }

  createWidgetDefinition({
    store,
    input: {
      id: input.id,
      kind: "generated",
      name: input.name,
      widgetCode: input.widgetCode,
      dataSourceName: input.dataSourceName,
      dataSourceParams: input.dataSourceParams,
    },
  });

  return { ok: true };
};
