import { expect, test } from "vite-plus/test";

import {
  TAIL_AVOIDANCE_DURATION,
  TAIL_BONE_LENGTH,
  createTailAvoidance,
  getActiveTailAvoidances,
  getTailAvoidanceOffset,
  getTailBezierPoint,
  getTailSkeleton,
  type TailAvoidance,
} from "@/components/onboarding/onboardingTailMotion";

test("locks the avoidance direction to the tail normal captured on pointer down", () => {
  const phase = 3;
  const center = getTailBezierPoint(phase, 0.8);
  const avoidance = createTailAvoidance(phase, [center[0] + 24, center[1]], 1_000, []);
  const earlyOffset = getTailAvoidanceOffset(avoidance.centerT, [avoidance], 1_120);
  const lateOffset = getTailAvoidanceOffset(avoidance.centerT, [avoidance], 1_360);
  const crossProduct = earlyOffset[0] * lateOffset[1] - earlyOffset[1] * lateOffset[0];

  expect(Math.hypot(...avoidance.direction)).toBeCloseTo(1, 6);
  expect(Math.abs(crossProduct)).toBeLessThan(0.000_001);
  expect(earlyOffset[0] * lateOffset[0] + earlyOffset[1] * lateOffset[1]).toBeGreaterThan(0);
});

test("keeps the current deformation when another avoidance starts", () => {
  const phase = 2;
  const firstCenter = getTailBezierPoint(phase, 0.72);
  const first = createTailAvoidance(phase, [firstCenter[0] + 20, firstCenter[1]], 1_000, []);
  const secondStartedAt = 1_180;
  const secondCenter = getTailBezierPoint(phase, 0.48);
  const second = createTailAvoidance(
    phase,
    [secondCenter[0] - 20, secondCenter[1]],
    secondStartedAt,
    [first],
  );
  const before = getTailAvoidanceOffset(first.centerT, [first], secondStartedAt);
  const after = getTailAvoidanceOffset(first.centerT, [first, second], secondStartedAt);

  expect(after[0]).toBeCloseTo(before[0], 8);
  expect(after[1]).toBeCloseTo(before[1], 8);
});

test("keeps avoidance local and leaves the root anchored", () => {
  const avoidance: TailAvoidance = {
    centerT: 0.58,
    direction: [1, 0],
    startedAt: 1_000,
    strength: 96,
  };
  const timestamp = 1_140;
  const rootOffset = getTailAvoidanceOffset(0, [avoidance], timestamp);
  const centerOffset = getTailAvoidanceOffset(0.58, [avoidance], timestamp);
  const distantOffset = getTailAvoidanceOffset(0.98, [avoidance], timestamp);

  expect(rootOffset).toEqual([0, 0]);
  expect(centerOffset[0]).toBeGreaterThan(distantOffset[0] * 4);
  expect(centerOffset[1]).toBe(0);
});

test("preserves the fixed bone length while the tail avoids a pointer", () => {
  const phase = 4;
  const target = getTailBezierPoint(phase, 0.76);
  const avoidance = createTailAvoidance(phase, [target[0] + 20, target[1]], 1_000, []);
  const skeleton = getTailSkeleton(phase, [avoidance], 1_140);

  for (let index = 1; index < skeleton.length; index += 1) {
    const previous = skeleton[index - 1];
    const current = skeleton[index];
    const boneLength = Math.hypot(current[0] - previous[0], current[1] - previous[1]);

    expect(boneLength).toBeLessThanOrEqual(TAIL_BONE_LENGTH + 0.001);
  }
});

test("removes finished avoidance impulses", () => {
  const avoidance: TailAvoidance = {
    centerT: 0.5,
    direction: [1, 0],
    startedAt: 1_000,
    strength: 96,
  };

  expect(getActiveTailAvoidances([avoidance], 1_000 + TAIL_AVOIDANCE_DURATION - 1)).toEqual([
    avoidance,
  ]);
  expect(getActiveTailAvoidances([avoidance], 1_000 + TAIL_AVOIDANCE_DURATION)).toEqual([]);
});
