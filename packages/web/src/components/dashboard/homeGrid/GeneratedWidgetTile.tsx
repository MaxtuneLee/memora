import type { ReactApi } from "@livestore/react";
import type { JSX } from "react";

import { useDataSourceValue } from "@/hooks/widgets/useDataSourceValue";
import { resolveWidgetInstanceParams } from "@/lib/widgets/widgetQueries";
import type { widgetDefinition, widgetInstance } from "@/livestore/widget";
import type { WidgetQueryableStore } from "@/lib/widgets/widgetStore";

import { GeneratedWidgetFrame } from "./GeneratedWidgetFrame";

interface GeneratedWidgetStore extends WidgetQueryableStore, Pick<ReactApi, "useQuery"> {}

export function GeneratedWidgetTile({
  store,
  definition,
  instance,
}: {
  store: GeneratedWidgetStore;
  definition: widgetDefinition;
  instance: widgetInstance;
}): JSX.Element {
  const params = resolveWidgetInstanceParams(definition, instance);
  const data = useDataSourceValue(store, definition.dataSourceName, params);

  return (
    <GeneratedWidgetFrame widgetCode={definition.widgetCode} data={data} title={definition.name} />
  );
}
