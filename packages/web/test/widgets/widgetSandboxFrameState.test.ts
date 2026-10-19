import { expect, test } from "vite-plus/test";

import {
  INITIAL_FRAME_STATE,
  frameReducer,
  type FrameAction,
  type FrameState,
} from "@/lib/widgets/sandbox/frameState";

const apply = (actions: FrameAction[]): FrameState =>
  actions.reduce(frameReducer, INITIAL_FRAME_STATE);

test("records what the frame reports", () => {
  expect(
    apply([
      { type: "booted" },
      { type: "content", hasContent: true },
      { type: "resize", height: 240 },
      { type: "ready" },
    ]),
  ).toEqual({ ...INITIAL_FRAME_STATE, booted: true, hasContent: true, height: 240, ready: true });
});

test("keeps a failure until the frame is restarted", () => {
  const failed = apply([{ type: "booted" }, { type: "failed", reason: "unresponsive" }]);
  expect(failed.failure).toBe("unresponsive");
});

test("restarting clears everything and gives React a new frame key", () => {
  const restarted = apply([
    { type: "booted" },
    { type: "resize", height: 500 },
    { type: "failed", reason: "flooding" },
    { type: "restart" },
  ]);

  expect(restarted).toEqual({ ...INITIAL_FRAME_STATE, frameKey: 1 });
  expect(frameReducer(restarted, { type: "restart" }).frameKey).toBe(2);
});
