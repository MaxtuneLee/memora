import type { JSX } from "react";

import { useDataSourceValue } from "@/hooks/widgets/useDataSourceValue";
import { resolveWidgetInstanceParams } from "@/lib/widgets/widgetQueries";
import type { widgetDefinition, widgetInstance } from "@/livestore/widget";
import type { ReactiveWidgetStore } from "@/lib/widgets/widgetStore";

import { GeneratedWidgetFrame } from "./GeneratedWidgetFrame";

export function GeneratedWidgetTile({
  store,
  definition,
  instance,
}: {
  store: ReactiveWidgetStore;
  definition: widgetDefinition;
  instance: widgetInstance;
}): JSX.Element {
  const params = resolveWidgetInstanceParams(definition, instance);
  const data = useDataSourceValue(store, definition.dataSourceName, params);

  return (
    <GeneratedWidgetFrame widgetCode={definition.widgetCode} data={data} title={definition.name} />
  );
}
