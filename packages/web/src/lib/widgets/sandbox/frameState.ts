import type { WidgetSandboxFailure } from "./runnerChannel";

// What the host knows about one runner frame. `frameKey` changes on restart so React mounts a
// fresh iframe.
export interface FrameState {
  frameKey: number;
  // The runner has loaded and is listening, so render/run/data messages will be delivered.
  booted: boolean;
  // The widget's scripts have finished their first run.
  ready: boolean;
  height: number;
  hasContent: boolean;
  failure: WidgetSandboxFailure | null;
}

export type FrameAction =
  | { type: "booted" }
  | { type: "ready" }
  | { type: "content"; hasContent: boolean }
  | { type: "resize"; height: number }
  | { type: "failed"; reason: WidgetSandboxFailure }
  | { type: "restart" };

export const INITIAL_FRAME_STATE: FrameState = {
  frameKey: 0,
  booted: false,
  ready: false,
  height: 1,
  hasContent: false,
  failure: null,
};

export const frameReducer = (state: FrameState, action: FrameAction): FrameState => {
  switch (action.type) {
    case "booted":
      return { ...state, booted: true };
    case "ready":
      return { ...state, ready: true };
    case "content":
      return { ...state, hasContent: action.hasContent };
    case "resize":
      return { ...state, height: action.height };
    case "failed":
      return { ...state, failure: action.reason };
    case "restart":
      return { ...INITIAL_FRAME_STATE, frameKey: state.frameKey + 1 };
  }
};
