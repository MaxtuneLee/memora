# @memora/local-model-runtime

English | [中文](./README_zh.md)

`@memora/local-model-runtime` provides Memora's runtime abstraction for local models. It defines models, validates requests, schedules tasks, runs inference inside SharedWorkers, and reports status, download progress, and inference output as asynchronous event streams.

The package does not depend on a specific browser storage implementation. A host application supplies adapters for model assets and task snapshots. Memora Web currently implements both adapters with OPFS.

## Features

- Divides model workloads into `asr`, `chat`, `embedding`, and `formula` pools.
- Runs one SharedWorker per pool and executes tasks serially within each pool.
- Supports `interactive` and `background` priorities, with interactive tasks dequeued first.
- Supports chat generation, audio transcription, embeddings, formula recognition, and model preloading.
- Reports task status, model download progress, streaming output, and final results through `AsyncGenerator`.
- Cancels requests through `AbortSignal`.
- Persists requests and emitted events as snapshots so an interrupted SharedWorker can restore unfinished tasks and replay stored events.
- Accepts a `LocalModelAssetCache` adapter instead of depending on a specific filesystem.
- Includes Transformers.js handlers for Qwen, Gemma, and Whisper.

## Package exports

The main entry exports the client, protocol types, manifests, validation, queue, SharedWorker scheduler, and storage interfaces:

```ts
import {
  createLocalModelClient,
  getLocalModelManifest,
  startSharedModelWorkerRuntime,
  type LocalModelAssetCache,
  type LocalModelTaskStore,
  type LocalModelWorkerRunner,
} from "@memora/local-model-runtime";
```

The worker entry exports model handlers and Transformers.js cache configuration:

```ts
import { runLocalModelTask, setLocalModelAssetCache } from "@memora/local-model-runtime/worker";
```

Keeping model handlers in the separate `./worker` entry prevents a main-thread consumer of the protocol and client from loading the complete model execution code.

## Architecture

```text
UI / feature code
  -> LocalModelClient
  -> host LocalModelWorkerRunner
  -> one SharedWorker per pool
  -> SharedModelWorkerRuntime
  -> model task handler
  -> Transformers.js / WebGPU or WASM

Storage adapters
  -> LocalModelTaskStore: request snapshots and event history
  -> LocalModelAssetCache: downloaded model files
```

`LocalModelClient` uses the model manifest's `pool` to route a preload request. When no manifest exists for an ID, the client returns a `model-not-found` error event immediately and does not fall back to a default worker.

## Host integration

### 1. Implement the model asset cache

The model asset cache reads, writes, and removes files downloaded by Transformers.js:

```ts
import type { LocalModelAssetCache } from "@memora/local-model-runtime";

export const assetCache: LocalModelAssetCache = {
  async match(request) {
    // Return a cached Response, or undefined on a cache miss.
    return undefined;
  },
  async put(request, response) {
    // Persist the response in storage provided by the host.
  },
  async removeModel(manifest) {
    // Remove all files associated with manifest.modelId.
  },
};
```

A browser host can implement this interface with OPFS, Cache Storage, or IndexedDB. The implementation must retain the response body and return it later as a readable `Response`.

### 2. Implement the task snapshot store

Task snapshots contain the task input, current status, and event history:

```ts
import type { LocalModelTaskStore } from "@memora/local-model-runtime";

export const taskStore: LocalModelTaskStore = {
  async readSnapshots(pool) {
    return [];
  },
  async createSnapshot(pool, snapshot) {
    // Persist the initial task input and state.
  },
  async updateSnapshot(pool, snapshot) {
    // Update the state and event history.
  },
  async removeSnapshot(pool, requestId) {
    // Remove the snapshot after the client acknowledges its terminal events.
  },
};
```

An implementation must store the `Float32Array` in an `asr.transcribe` task and the `Blob` in a `formula.recognize` task as binary data, then reconstruct the original task input during restoration.

### 3. Create the SharedWorker entry

Each pool uses a separate SharedWorker instance. Multiple instances can share one entry module and derive their pool from the worker name:

```ts
import { startSharedModelWorkerRuntime, type LocalModelPoolKey } from "@memora/local-model-runtime";
import { runLocalModelTask, setLocalModelAssetCache } from "@memora/local-model-runtime/worker";

import { assetCache } from "./assetCache";
import { taskStore } from "./taskStore";

const poolsByWorkerName = {
  "model-asr": "asr",
  "model-chat": "chat",
  "model-embedding": "embedding",
  "model-formula": "formula",
} as const satisfies Record<string, LocalModelPoolKey>;

const workerName = (self as unknown as { name: string }).name;
const pool = poolsByWorkerName[workerName as keyof typeof poolsByWorkerName];

if (!pool) throw new Error(`Unknown local model worker: ${workerName}`);

setLocalModelAssetCache(assetCache);

startSharedModelWorkerRuntime({
  pool,
  scope: self,
  taskStore,
  runTask: (task, context) => runLocalModelTask(task, context.emit, context.isCanceled),
});
```

The SharedWorker runtime:

- Receives `run`, `subscribe`, `cancel`, `acknowledge`, and `disconnect` messages.
- Verifies that each task belongs to the current pool.
- Creates a snapshot before placing a task in the priority queue.
- Assigns an increasing `sequence` to each event, persists it, and sends it to all subscribed ports.
- Restores unfinished tasks and suppresses duplicated output produced while re-running a restored task.
- Removes a task snapshot after the client acknowledges its terminal events.

### 4. Implement the main-thread worker runner

The host creates four named SharedWorkers, manages their `MessagePort` connections, and implements `LocalModelWorkerRunner`:

```ts
import type { LocalModelWorkerRunner } from "@memora/local-model-runtime";

const workerRunner: LocalModelWorkerRunner = {
  async *run(pool, input) {
    // 1. Create a requestId.
    // 2. Send a run message to the MessagePort for the selected pool.
    // 3. Convert incoming sequenced events into an AsyncGenerator.
    // 4. Send cancel when the AbortSignal fires.
    // 5. Send acknowledge after completed, failed, or aborted is consumed.
  },
};
```

The runtime intentionally leaves SharedWorker creation to the host so the host can control worker URLs, lifetime, connection reuse, and development diagnostics.

## Client usage

### Preload a model

```ts
import { createLocalModelClient } from "@memora/local-model-runtime";

const client = createLocalModelClient(workerRunner);

for await (const event of client.preloadModel("whisper-base-timestamped")) {
  if (event.type === "model-progress") {
    console.log(event.file, event.progress, event.total);
  }

  if (event.type === "error") {
    console.error(event.error.code, event.error.message);
  }
}
```

Preload requests use `background` priority by default.

### Transcribe audio

```ts
const controller = new AbortController();

for await (const event of client.transcribeAudio(
  {
    modelId: "whisper-base-timestamped",
    audio: pcmSamples,
    language: "zh",
    returnTimestamps: "word",
  },
  { signal: controller.signal },
)) {
  if (event.type === "transcript-delta") {
    console.log(event.text);
  }

  if (event.type === "transcript-complete") {
    console.log(event.text, event.chunks);
  }
}
```

`audio` is a mono PCM `Float32Array`. The caller is responsible for decoding and sample-rate conversion before submitting the request.

### Stream chat output

```ts
for await (const event of client.streamChat({
  modelId: "qwen3.5-0.8b-onnx-opt",
  systemPrompt: "Answer clearly.",
  messages: [
    {
      role: "user",
      content: [{ type: "text", text: "Hello" }],
    },
  ],
  tools: [],
  reasoningMode: "non-thinking",
})) {
  switch (event.type) {
    case "text-delta":
      console.log(event.delta);
      break;
    case "usage":
      console.log(event.totalTokens);
      break;
    case "error":
      console.error(event.error);
      break;
  }
}
```

Chat requests are validated against the selected manifest's input modalities, reasoning modes, and tool-calling capabilities.

## Submit low-level tasks

`LocalModelClient` currently exposes high-level methods for chat, ASR, and preloading. Submit embedding and formula tasks through the runner directly:

```ts
const events = workerRunner.run("embedding", {
  priority: "interactive",
  task: {
    kind: "embedding.generate",
    input: {
      model: "bge-small-en",
      texts: ["A local-first note"],
    },
  },
});

for await (const event of events) {
  if (event.type === "embedding-complete") {
    console.log(event.dimension, event.values);
  }
}
```

## Built-in models

| Manifest ID                | Pool   | Adapter  | Input       |
| -------------------------- | ------ | -------- | ----------- |
| `whisper-base-timestamped` | `asr`  | Whisper  | audio       |
| `qwen3.5-0.8b-onnx-opt`    | `chat` | Qwen 3.5 | text, image |
| `gemma-4-e2b-it-onnx`      | `chat` | Gemma 4  | text, image |

Use `builtInLocalModelManifests` to enumerate models and `getLocalModelManifest(id)` to retrieve one manifest. Adding a model requires both a manifest and a task handler for its adapter.

## Events and task completion

Every task produces status events:

```text
queued -> assigned -> loading-model -> running -> completed
                                                   failed
                                                   aborted
```

A handler can omit intermediate states that do not apply. `completed`, `failed`, and `aborted` are terminal states. Consumers should continue reading the generator until it ends so the main thread can acknowledge the request and remove its snapshot.

Common events include:

- `model-progress`: model filename, downloaded progress, and total size.
- `text-delta` and `reasoning-delta`: streamed chat output.
- `tool-call-*`: tool-call output.
- `transcript-delta` and `transcript-complete`: transcription output.
- `embedding-complete` and `formula-complete`: final task results.
- `error`: a structured error code, readable message, and optional details.

## Development

Run these commands from the workspace root:

```bash
vp run @memora/local-model-runtime#build
vp run @memora/local-model-runtime#dev
vp run @memora/local-model-runtime#lint
vp run @memora/local-model-runtime#test
```

`dev` watches the source and rebuilds `dist`. The package builds both `.` and `./worker` entries.
