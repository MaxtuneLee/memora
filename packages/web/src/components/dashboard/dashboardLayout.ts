export interface PrimaryWidgetVisibility {
  calendar: boolean;
  todo: boolean;
}

export type PrimaryWidgetKey = "todo" | "calendar";

export const PRIMARY_WIDGET_GRID_CLASS =
  "grid grid-cols-1 gap-3.5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]";

export const getPrimaryWidgetOrder = ({
  calendar,
  todo,
}: PrimaryWidgetVisibility): PrimaryWidgetKey[] => {
  const orderedWidgets: PrimaryWidgetKey[] = [];

  if (todo) {
    orderedWidgets.push("todo");
  }

  if (calendar) {
    orderedWidgets.push("calendar");
  }

  return orderedWidgets;
};
