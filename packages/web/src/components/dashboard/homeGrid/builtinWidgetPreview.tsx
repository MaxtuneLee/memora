import type { ReactNode } from "react";

import { CalendarWidget } from "@/components/dashboard/CalendarWidget";
import { RecentWidget } from "@/components/dashboard/RecentWidget";
import type { RecentItem } from "@/components/dashboard/recentItems";
import { TodoPanel } from "@/components/dashboard/TodoPanel";
import type { widgetDefinition } from "@/livestore/widget";
import type { FileMeta } from "@/types/library";

interface TodoPanelStoreLike {
  commit: (...events: unknown[]) => void;
}

// Shared by HomeGrid (rendering a placed Instance) and AddWidgetDrawer (rendering a live preview
// before placement) — builtin widgets read the same app-wide data either way, so there is no
// separate "preview mode" to keep in sync with the real one.
export function renderBuiltinWidget({
  definition,
  store,
  files,
  recentItems,
}: {
  definition: Pick<widgetDefinition, "builtinKey" | "folderId">;
  store: TodoPanelStoreLike;
  files: FileMeta[];
  recentItems: RecentItem[];
}): ReactNode {
  if (definition.builtinKey === "calendar") {
    return <CalendarWidget activityTimestamps={recentItems.map((item) => item.updatedAt)} />;
  }

  if (definition.builtinKey === "todo") {
    return <TodoPanel files={files} store={store} todoFolderId={definition.folderId ?? null} />;
  }

  if (definition.builtinKey === "recent") {
    return <RecentWidget items={recentItems} />;
  }

  return null;
}
