import type { LocalModelRuntime } from "./types";

export interface LocalModelWorkerDebugMessage {
  type: "debug";
  payload: {
    kind: "runtime-loaded";
    family: string;
    modelId: string;
    adapter: string;
    runtime: LocalModelRuntime;
  };
}

let debugReporter: ((message: LocalModelWorkerDebugMessage) => void) | null = null;

export const setWorkerDebugReporter = (
  reporter: ((message: LocalModelWorkerDebugMessage) => void) | null,
): void => {
  debugReporter = reporter;
};

export const reportWorkerRuntimeLoaded = (input: {
  family: string;
  modelId: string;
  adapter: string;
  runtime: LocalModelRuntime;
}): void => {
  debugReporter?.({
    type: "debug",
    payload: {
      kind: "runtime-loaded",
      family: input.family,
      modelId: input.modelId,
      adapter: input.adapter,
      runtime: input.runtime,
    },
  } satisfies LocalModelWorkerDebugMessage);
};
