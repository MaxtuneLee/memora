import { settingsDocumentQuery$ } from "@/lib/settings/queries";
import { settingEvents, type setting } from "@/livestore/setting";
import { BUILTIN_WIDGET_KEYS, type BuiltinWidgetKey, type DataSourceName } from "@/livestore/widget";
import { createWidgetDefinition } from "./widgetDefinitions";
import { createWidgetInstance } from "./widgetInstances";
import type { WidgetQueryableStore } from "./widgetStore";

interface SeedHomeGridStore extends WidgetQueryableStore {
  commit: (...events: unknown[]) => void;
}

export interface LegacyWidgetVisibility {
  calendar?: boolean;
  todo?: boolean;
  recent?: boolean;
}

const LEGACY_WIDGET_VISIBILITY_STORAGE_KEY = "memora:dashboard:widgets";

const BUILTIN_WIDGET_NAMES: Record<BuiltinWidgetKey, string> = {
  calendar: "Calendar",
  todo: "Todo",
  recent: "Recent",
};

const BUILTIN_WIDGET_DATA_SOURCES: Record<BuiltinWidgetKey, DataSourceName> = {
  calendar: "recentFiles",
  todo: "todoProgress",
  recent: "recentFiles",
};

export const readLegacyWidgetVisibility = (): LegacyWidgetVisibility => {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(LEGACY_WIDGET_VISIBILITY_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as LegacyWidgetVisibility) : {};
  } catch {
    return {};
  }
};

export const builtinWidgetDefinitionId = (key: BuiltinWidgetKey): string => `builtin:${key}`;

export const seedHomeGrid = ({
  store,
  legacyVisibility = readLegacyWidgetVisibility(),
}: {
  store: SeedHomeGridStore;
  legacyVisibility?: LegacyWidgetVisibility;
}): void => {
  const settings = store.query(settingsDocumentQuery$) as Partial<setting> | undefined;
  if (settings?.homeGridSeeded) {
    return;
  }

  let sortOrder = 0;

  for (const key of BUILTIN_WIDGET_KEYS) {
    const definitionId = builtinWidgetDefinitionId(key);

    createWidgetDefinition({
      store,
      input: {
        id: definitionId,
        kind: "builtin",
        builtinKey: key,
        name: BUILTIN_WIDGET_NAMES[key],
        dataSourceName: BUILTIN_WIDGET_DATA_SOURCES[key],
      },
    });

    if (legacyVisibility[key] === false) {
      continue;
    }

    createWidgetInstance({
      store,
      input: {
        id: crypto.randomUUID(),
        definitionId,
        sortOrder: sortOrder++,
      },
    });
  }

  store.commit(settingEvents.settingsSet({ homeGridSeeded: true }));
};
