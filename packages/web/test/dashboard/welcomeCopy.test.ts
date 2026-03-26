import { expect, test } from "vite-plus/test";

import { getDayPeriod, getWelcomeCopy, getWelcomeState } from "@/components/dashboard/welcomeCopy";

test("classifies an empty workspace and morning period", () => {
  expect(
    getWelcomeState({
      fileCount: 0,
      chatCount: 0,
      recentCount: 0,
    }),
  ).toBe("empty");

  expect(getDayPeriod(new Date("2026-03-25T08:30:00"))).toBe("morning");
});

test("classifies a partial workspace as returning", () => {
  expect(
    getWelcomeState({
      fileCount: 2,
      chatCount: 0,
      recentCount: 2,
    }),
  ).toBe("returning");
});

test("classifies a busy workspace as active", () => {
  expect(
    getWelcomeState({
      fileCount: 2,
      chatCount: 1,
      recentCount: 4,
    }),
  ).toBe("active");
});

test("selects deterministic copy with day-based variation", () => {
  const first = getWelcomeCopy({
    fileCount: 2,
    chatCount: 1,
    recentCount: 4,
    now: new Date("2026-03-25T09:00:00"),
  });
  const second = getWelcomeCopy({
    fileCount: 2,
    chatCount: 1,
    recentCount: 4,
    now: new Date("2026-03-25T09:00:00"),
  });
  const nextDay = getWelcomeCopy({
    fileCount: 2,
    chatCount: 1,
    recentCount: 4,
    now: new Date("2026-03-26T09:00:00"),
  });

  expect(first).toEqual(second);
  expect(first.state).toBe("active");
  expect(first.period).toBe("morning");
  expect(first.title.length).toBeGreaterThan(0);
  expect(first.description.length).toBeGreaterThan(0);
  expect(first).not.toEqual(nextDay);
});
