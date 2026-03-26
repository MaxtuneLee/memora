import { expect, test } from "vite-plus/test";

import {
  CALENDAR_MOTION_EASE,
  getCalendarGridMotion,
  getCalendarHeaderMotion,
} from "@/components/dashboard/calendarMotion";

test("animates the calendar month as one panel from the next month direction", () => {
  const gridMotion = getCalendarGridMotion(1, false);

  expect(gridMotion.initial).toEqual({
    opacity: 0,
    x: 24,
    y: 0,
  });
  expect(gridMotion.animate).toEqual({
    opacity: 1,
    x: 0,
    y: 0,
  });
  expect(gridMotion.transition).toMatchObject({
    duration: 0.32,
    ease: CALENDAR_MOTION_EASE,
  });
});

test("reverses calendar month motion for previous month navigation", () => {
  const previousMonthMotion = getCalendarGridMotion(-1, false);
  const nextMonthHeaderMotion = getCalendarHeaderMotion(1, false);

  expect(previousMonthMotion.initial.x).toBe(-24);
  expect(nextMonthHeaderMotion.initial.y).toBe(10);
});

test("disables calendar motion when reduced motion is enabled", () => {
  const headerMotion = getCalendarHeaderMotion(-1, true);
  const gridMotion = getCalendarGridMotion(1, true);

  expect(headerMotion.initial).toEqual({
    opacity: 1,
    y: 0,
  });
  expect(gridMotion.initial).toEqual({
    opacity: 1,
    x: 0,
    y: 0,
  });
  expect(gridMotion.transition).toEqual({
    duration: 0.12,
  });
});
