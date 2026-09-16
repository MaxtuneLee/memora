export interface PrimaryWidgetVisibility {
  calendar: boolean;
  todo: boolean;
}

export type PrimaryWidgetKey = "todo" | "calendar";

export const dashboardLayoutStyles = stylex.create({
  primaryWidgetGrid: {
    display: "grid",
    gap: 14,
    gridTemplateColumns: "minmax(0, 1fr)",
    "@media (min-width: 64rem)": { gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 0.8fr)" },
  },
});

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
import * as stylex from "@stylexjs/stylex";
