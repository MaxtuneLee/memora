import type { LocalModelRuntime } from "@memora/local-model-runtime";

const IS_DEV = import.meta.env.DEV;

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

export const reportWorkerRuntimeLoaded = (input: {
  family: string;
  modelId: string;
  adapter: string;
  runtime: LocalModelRuntime;
}): void => {
  if (!IS_DEV) {
    return;
  }

  self.postMessage({
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
