import {
  createLocalModelClient as createRuntimeLocalModelClient,
  type LocalModelClient,
} from "@memora/local-model-runtime";

import { modelWorkerFactory, type ModelWorkerFactory } from "../model-worker";

export type { LocalModelClient } from "@memora/local-model-runtime";

export const createLocalModelClient = (
  workerFactory: ModelWorkerFactory = modelWorkerFactory,
): LocalModelClient => createRuntimeLocalModelClient(workerFactory);

export const localModelClient = createLocalModelClient();
