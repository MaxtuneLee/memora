import { expect, test } from "vite-plus/test";

import {
  HOME_GRID_GAP_PX,
  homeGridCellSize,
  homeGridColumnCount,
  nextWidgetSpans,
} from "@/lib/widgets/homeGridLayout";

test("derives the column count from the container width, capped at four", () => {
  expect(homeGridColumnCount(1480)).toBe(4);
  expect(homeGridColumnCount(1162)).toBe(4);
  expect(homeGridColumnCount(1161)).toBe(3);
  expect(homeGridColumnCount(868)).toBe(3);
  expect(homeGridColumnCount(867)).toBe(2);
  expect(homeGridColumnCount(574)).toBe(2);
  expect(homeGridColumnCount(573)).toBe(1);
  expect(homeGridColumnCount(Number.NaN)).toBe(1);
});

test("splits the container into square cells minus the gaps", () => {
  expect(homeGridCellSize(1480, 4)).toBe((1480 - HOME_GRID_GAP_PX * 3) / 4);
  expect(homeGridCellSize(0, 1)).toBe(0);
});

const gesture = (deltaX: number, deltaY: number, overrides = {}) =>
  nextWidgetSpans({
    storedColumnSpan: 1,
    storedRowSpan: 1,
    visibleColumnSpan: 1,
    maxColumnSpan: 4,
    cellStride: 100,
    deltaX,
    deltaY,
    ...overrides,
  });

test("changes a span only once the pointer crosses the neighbouring cell's midpoint", () => {
  expect(gesture(49, 0)).toEqual({ columnSpan: 1, rowSpan: 1 });
  expect(gesture(50, 0)).toEqual({ columnSpan: 2, rowSpan: 1 });
  expect(gesture(0, 49)).toEqual({ columnSpan: 1, rowSpan: 1 });
  expect(gesture(0, 50)).toEqual({ columnSpan: 1, rowSpan: 2 });
  expect(gesture(0, 150)).toEqual({ columnSpan: 1, rowSpan: 3 });
});

test("clamps spans to 1..4 and to the columns the container can show", () => {
  expect(gesture(900, 900)).toEqual({ columnSpan: 4, rowSpan: 4 });
  expect(gesture(-900, -900)).toEqual({ columnSpan: 1, rowSpan: 1 });
  expect(gesture(900, 0, { maxColumnSpan: 3 })).toEqual({ columnSpan: 3, rowSpan: 1 });
});

test("keeps a clamped stored width when the gesture is purely vertical", () => {
  // Stored 4x2 shown as 3x2 in a three-column container: dragging down must not rewrite the 4.
  expect(
    gesture(0, 100, {
      storedColumnSpan: 4,
      storedRowSpan: 2,
      visibleColumnSpan: 3,
      maxColumnSpan: 3,
    }),
  ).toEqual({ columnSpan: 4, rowSpan: 3 });

  // A horizontal crossing does rewrite it, starting from what the user can actually see.
  expect(
    gesture(-100, 0, {
      storedColumnSpan: 4,
      storedRowSpan: 2,
      visibleColumnSpan: 3,
      maxColumnSpan: 3,
    }),
  ).toEqual({ columnSpan: 2, rowSpan: 2 });
});
