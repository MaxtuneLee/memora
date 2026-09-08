import { describe, expect, test } from "vite-plus/test";

import { activeEvaluationRuns } from "@/lib/playground/activeEvaluationRuns";

const selection = {
  datasetId: "google/fleurs",
  revision: "abc123",
  configuration: "hi_in",
  split: "test",
};
const otherSplit = { ...selection, split: "train" };

describe("activeEvaluationRuns", () => {
  test("is not active before a run begins", () => {
    expect(activeEvaluationRuns.isActive(selection)).toBe(false);
  });

  test("marks a selection active while its run is in flight", () => {
    const release = activeEvaluationRuns.begin(selection);
    expect(activeEvaluationRuns.isActive(selection)).toBe(true);
    release();
    expect(activeEvaluationRuns.isActive(selection)).toBe(false);
  });

  test("does not treat a different split as active", () => {
    const release = activeEvaluationRuns.begin(selection);
    expect(activeEvaluationRuns.isActive(otherSplit)).toBe(false);
    release();
  });

  test("stays active while any of several overlapping runs is still in flight", () => {
    const releaseFirst = activeEvaluationRuns.begin(selection);
    const releaseSecond = activeEvaluationRuns.begin(selection);
    releaseFirst();
    expect(activeEvaluationRuns.isActive(selection)).toBe(true);
    releaseSecond();
    expect(activeEvaluationRuns.isActive(selection)).toBe(false);
  });

  test("releasing twice does not under-count a still-active run", () => {
    const releaseFirst = activeEvaluationRuns.begin(selection);
    activeEvaluationRuns.begin(selection);
    releaseFirst();
    releaseFirst();
    expect(activeEvaluationRuns.isActive(selection)).toBe(true);
  });
});
