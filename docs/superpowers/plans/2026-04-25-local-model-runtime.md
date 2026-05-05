# Local Model Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a shared worker-based local model runtime, migrate Whisper onto it, and add local Qwen/Gemma chat providers that fully match `@memora/ai-core` provider events including reasoning and tool calls.

**Architecture:** Add a provider-neutral `@memora/local-model-runtime` package for manifests, validation, worker protocol, queueing, and adapter contracts. Add `@memora/ai-provider-local` to bridge `ProviderRequest` to the local runtime. Keep browser-only inference in `packages/web/src/workers/localModel.worker.ts`, with `packages/web/src/lib/local-model/client.ts` owning worker pools and request streams.

**Tech Stack:** TypeScript, React 19, Vite worker modules, Transformers.js, ONNX Runtime Web, OPFS through `@memora/fs`, Valibot, Node test runner, Vite+ commands.

---

## Reference Inputs

- Spec: `docs/superpowers/specs/2026-04-25-local-model-runtime-design.md`
- Existing provider contract: `packages/ai-core/src/types.ts`
- Existing agent loop tool handling: `packages/ai-core/src/loop.ts`
- Existing OpenAI provider: `packages/ai-provider/openai/src/index.ts`
- Existing Whisper worker: `packages/web/src/workers/whisper.worker.ts`
- Existing Whisper client: `packages/web/src/lib/transcript/whisper/client.ts`
- Existing transcript hooks: `packages/web/src/hooks/transcript/useTranscript.ts`, `packages/web/src/hooks/transcript/useFileTranscription.ts`, `packages/web/src/hooks/transcript/useTranscript/useSpeechQueue.ts`
- Existing chat provider creation: `packages/web/src/components/chat/chatPage/useChatModelConfig.ts`
- Existing provider persistence: `packages/web/src/livestore/provider.ts`

## File Structure

### New package: `packages/local-model-runtime`

- `packages/local-model-runtime/package.json`: package metadata and scripts.
- `packages/local-model-runtime/tsconfig.json`: package TypeScript config.
- `packages/local-model-runtime/tsdown.config.ts`: package build config.
- `packages/local-model-runtime/vite.config.ts`: Vite+ pack config.
- `packages/local-model-runtime/src/index.ts`: public exports.
- `packages/local-model-runtime/src/types.ts`: task, event, manifest, error, and worker protocol types.
- `packages/local-model-runtime/src/manifests.ts`: built-in Whisper, Qwen, and Gemma manifests.
- `packages/local-model-runtime/src/validation.ts`: manifest lookup, modality validation, tool/reasoning capability validation.
- `packages/local-model-runtime/src/errors.ts`: typed error constructors and normalization helpers.
- `packages/local-model-runtime/src/queue.ts`: pool-aware priority queue helpers.
- `packages/local-model-runtime/src/adapters/types.ts`: shared adapter interfaces for ASR and chat adapters.
- `packages/local-model-runtime/src/adapters/toolSchema.ts`: Valibot-to-JSON-schema helper shared with local provider.
- `packages/local-model-runtime/test/validation.test.mjs`: validation tests.
- `packages/local-model-runtime/test/queue.test.mjs`: priority queue tests.

### New package: `packages/ai-provider/local`

- `packages/ai-provider/local/package.json`: package metadata and scripts.
- `packages/ai-provider/local/tsconfig.json`: package TypeScript config.
- `packages/ai-provider/local/tsdown.config.ts`: package build config.
- `packages/ai-provider/local/vite.config.ts`: Vite+ pack config.
- `packages/ai-provider/local/src/index.ts`: `createLocalProvider()` and exports.
- `packages/ai-provider/local/src/transform.ts`: `ProviderRequest` to `LocalChatRequest` conversion.
- `packages/ai-provider/local/src/events.ts`: `LocalChatEvent` to `ProviderEvent` conversion.
- `packages/ai-provider/local/src/types.ts`: local provider config and client interface.
- `packages/ai-provider/local/test/providerEvents.test.mjs`: event mapping tests.
- `packages/ai-provider/local/test/transform.test.mjs`: request conversion tests.
- `packages/ai-provider/local/test/abort.test.mjs`: abort propagation test with fake client.

### Web worker/runtime integration

- `packages/web/src/lib/local-model/client.ts`: main-thread local model manager and async stream API.
- `packages/web/src/lib/local-model/createWorker.ts`: Vite worker factory.
- `packages/web/src/lib/local-model/index.ts`: web-local exports.
- `packages/web/src/lib/local-model/workerPool.ts`: browser worker pool implementation.
- `packages/web/src/workers/localModel.worker.ts`: unified local model worker entry.
- `packages/web/src/workers/local-model/cache.ts`: Transformers.js OPFS cache helper.
- `packages/web/src/workers/local-model/runtime.ts`: worker-side task dispatcher and model instance registry.
- `packages/web/src/workers/local-model/asr/whisper.ts`: Whisper ASR adapter.
- `packages/web/src/workers/local-model/chat/qwen35.ts`: Qwen3.5 chat adapter.
- `packages/web/src/workers/local-model/chat/gemma4.ts`: Gemma 4 chat adapter.
- `packages/web/src/workers/local-model/chat/toolParsing.ts`: shared defensive tool-call parsing helpers.

### Web app migration

- `packages/web/src/lib/transcript/whisper/client.ts`: either remove or turn into a compatibility wrapper around `localModelClient` during migration.
- `packages/web/src/hooks/transcript/useTranscript.ts`: switch live transcription to local runtime client.
- `packages/web/src/hooks/transcript/useFileTranscription.ts`: switch file transcription to local runtime client with background priority.
- `packages/web/src/hooks/transcript/useTranscript/useSpeechQueue.ts`: replace `generateWhisperTranscript()` dependency with local runtime transcribe call.
- `packages/web/src/components/chat/chatPage/useChatModelConfig.ts`: choose OpenAI or local provider by provider kind.
- `packages/web/src/livestore/provider.ts`: add provider kind and local model fields.
- `packages/web/src/types/settingsDialog.ts`: add provider kind types and local model metadata.
- `packages/web/src/lib/settings/dialogHelpers.ts`: include local models in model options.
- `packages/web/src/components/settings/SettingsProviderForm.tsx`: hide endpoint/API-key fields for local providers and expose local model choices.
- `packages/web/src/lib/chat/noticeExtractor.ts`: keep OpenAI-only unless explicitly configured; do not silently use local provider for background notice extraction.
- `packages/web/src/lib/chat/personalityGenerator.ts`: keep OpenAI-only unless explicitly configured; do not silently use local provider for background personality generation.
- `packages/web/package.json`: add `@memora/local-model-runtime` and `@memora/ai-provider-local` workspace dependencies.
- `packages/web/src/vite-env.d.ts` if needed: ensure worker module imports are typed.

---

## Task 1: Add Runtime Package Skeleton

**Files:**
- Create: `packages/local-model-runtime/package.json`
- Create: `packages/local-model-runtime/tsconfig.json`
- Create: `packages/local-model-runtime/tsdown.config.ts`
- Create: `packages/local-model-runtime/vite.config.ts`
- Create: `packages/local-model-runtime/src/index.ts`
- Create: `packages/local-model-runtime/src/types.ts`
- Create: `packages/local-model-runtime/test/validation.test.mjs`

- [ ] **Step 1: Create package metadata**

Create `packages/local-model-runtime/package.json`:

```json
{
  "name": "@memora/local-model-runtime",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "vp pack",
    "dev": "vp pack --watch",
    "test": "node --test test/*.test.mjs"
  },
  "devDependencies": {
    "typescript": "~5.9.3",
    "vite-plus": "catalog:"
  },
  "dependencies": {
    "@memora/ai-core": "workspace:*",
    "@valibot/to-json-schema": "^1.3.0",
    "valibot": "^1.2.0"
  }
}
```

- [ ] **Step 2: Add build configs**

Create `packages/local-model-runtime/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noEmit": true,
    "types": []
  },
  "include": ["src"]
}
```

Create `packages/local-model-runtime/tsdown.config.ts`:

```ts
import { defineConfig } from "vite-plus/pack";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  target: "es2020",
  platform: "browser",
});
```

Create `packages/local-model-runtime/vite.config.ts`:

```ts
import tsdownConfig from "./tsdown.config.js";

import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: tsdownConfig,
});
```

- [ ] **Step 3: Write initial runtime types**

Create `packages/local-model-runtime/src/types.ts` with these exported types:

```ts
import type { AgentMessageContent } from "@memora/ai-core";

export type LocalModelPoolKey = "asr" | "chat" | "embedding";
export type LocalModelPriority = "interactive" | "background";
export type LocalModelTaskStatus =
  | "queued"
  | "assigned"
  | "loading-model"
  | "running"
  | "completed"
  | "failed"
  | "aborted";
export type LocalModelRuntime = "transformers-js";
export type LocalModelDevice = "webgpu" | "wasm";
export type LocalModelModality = "text" | "image" | "audio" | "video";
export type LocalModelOutputModality = "text" | "json" | "tool-call";
export type LocalReasoningMode = "non-thinking" | "thinking";

export type LocalModelErrorCode =
  | "webgpu-unavailable"
  | "model-not-found"
  | "unsupported-modality"
  | "unsupported-tools"
  | "unsupported-reasoning"
  | "model-load-failed"
  | "generation-failed"
  | "tool-call-parse-failed"
  | "worker-crashed"
  | "request-aborted"
  | "capacity-exceeded";

export interface LocalModelError {
  code: LocalModelErrorCode;
  message: string;
  detail?: string;
}

export interface LocalGenerationDefaults {
  temperature?: number;
  topP?: number;
  topK?: number;
  presencePenalty?: number;
  maxTokens?: number;
}

export interface LocalChatCapabilities {
  adapter: "qwen3.5" | "gemma4" | string;
  supportsSystemPrompt: boolean;
  supportsStreaming: boolean;
  supportsReasoning: boolean;
  reasoningModes: LocalReasoningMode[];
  defaultReasoningMode: LocalReasoningMode;
  supportsTools: boolean;
  toolCalling?: {
    mode: "native" | "template-json";
    streamingArgs: boolean;
    requiresToolResultTemplate: boolean;
  };
  generationDefaults?: LocalGenerationDefaults;
}

export interface LocalAsrCapabilities {
  adapter: "whisper" | string;
  supportsWordTimestamps: boolean;
}

export interface LocalModelManifest {
  id: string;
  displayName: string;
  family: "whisper" | "qwen" | "gemma" | string;
  task: "asr" | "chat" | "embedding";
  modelId: string;
  runtime: LocalModelRuntime;
  device: LocalModelDevice;
  pool: LocalModelPoolKey;
  modalities: {
    input: LocalModelModality[];
    output: LocalModelOutputModality[];
  };
  dtype?: unknown;
  chat?: LocalChatCapabilities;
  asr?: LocalAsrCapabilities;
}

export interface LocalToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export type LocalChatContent = AgentMessageContent | { type: "audio"; mimeType: string; data: string };

export interface LocalChatMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: LocalChatContent[];
  reasoning?: string;
}

export interface LocalChatRequest {
  modelId: string;
  systemPrompt: string;
  messages: LocalChatMessage[];
  tools: LocalToolDefinition[];
  reasoningMode?: LocalReasoningMode;
  temperature?: number;
  maxTokens?: number;
}

export interface LocalAsrRequest {
  modelId: string;
  audio: Float32Array;
  language: string;
  returnTimestamps?: "word";
}

export type LocalModelTask =
  | { kind: "asr.transcribe"; input: LocalAsrRequest }
  | { kind: "chat.generate"; input: LocalChatRequest };

export interface LocalModelRequestEnvelope<TTask extends LocalModelTask = LocalModelTask> {
  type: "run";
  requestId: string;
  priority: LocalModelPriority;
  task: TTask;
}

export interface LocalModelCancelMessage {
  type: "cancel";
  requestId: string;
}

export type LocalModelWorkerMessage = LocalModelRequestEnvelope | LocalModelCancelMessage;

export type LocalModelCommonEvent =
  | { type: "status"; status: LocalModelTaskStatus }
  | { type: "model-progress"; file?: string; progress?: number; total?: number }
  | { type: "error"; error: LocalModelError };

export type LocalAsrEvent =
  | LocalModelCommonEvent
  | { type: "transcript-delta"; text: string }
  | {
      type: "transcript-complete";
      text: string;
      chunks?: Array<{ text: string; timestamp: [number, number] }>;
      audioLength?: number;
    };

export type LocalChatEvent =
  | LocalModelCommonEvent
  | { type: "text-delta"; delta: string }
  | { type: "reasoning-delta"; delta: string }
  | { type: "reasoning-done"; text: string }
  | { type: "usage"; inputTokens?: number; outputTokens?: number; totalTokens?: number }
  | { type: "tool-call-start"; toolCall: { id: string; name: string } }
  | { type: "tool-call-args-delta"; toolCallId: string; delta: string }
  | {
      type: "tool-call-complete";
      toolCall: { id: string; name: string; arguments: Record<string, unknown> };
    }
  | { type: "chat-complete" };

export type LocalModelEvent = LocalAsrEvent | LocalChatEvent;

export interface LocalModelEventEnvelope<TEvent extends LocalModelEvent = LocalModelEvent> {
  requestId: string;
  event: TEvent;
}
```

- [ ] **Step 4: Export package surface**

Create `packages/local-model-runtime/src/index.ts`:

```ts
export * from "./types";
```

- [ ] **Step 5: Build the package**

Run: `pnpm --filter @memora/local-model-runtime build`

Expected: package builds and emits `dist`.

- [ ] **Step 6: Commit skeleton**

```bash
git add packages/local-model-runtime
git commit -m "feat(local-model): add runtime package skeleton"
```

## Task 2: Add Manifests and Validation

**Files:**
- Create: `packages/local-model-runtime/src/manifests.ts`
- Create: `packages/local-model-runtime/src/errors.ts`
- Create: `packages/local-model-runtime/src/validation.ts`
- Modify: `packages/local-model-runtime/src/index.ts`
- Test: `packages/local-model-runtime/test/validation.test.mjs`

- [ ] **Step 1: Write validation tests first**

Create `packages/local-model-runtime/test/validation.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";

import {
  builtInLocalModelManifests,
  getLocalModelManifest,
  validateLocalChatRequest,
} from "../dist/index.js";

const qwenRequest = {
  modelId: "qwen3.5-0.8b-onnx-opt",
  systemPrompt: "You are Memora.",
  messages: [
    {
      role: "user",
      content: [{ type: "text", text: "hello" }],
    },
  ],
  tools: [],
};

test("exports initial manifests", () => {
  assert.deepEqual(
    builtInLocalModelManifests.map((manifest) => manifest.id),
    ["whisper-base-timestamped", "qwen3.5-0.8b-onnx-opt", "gemma-4-e2b-it-onnx"],
  );
});

test("looks up a manifest by id", () => {
  const manifest = getLocalModelManifest("qwen3.5-0.8b-onnx-opt");
  assert.equal(manifest?.modelId, "onnx-community/Qwen3.5-0.8B-ONNX-OPT");
});

test("validates supported chat content", () => {
  const result = validateLocalChatRequest(qwenRequest);
  assert.equal(result.ok, true);
});

test("rejects unsupported modality before generation", () => {
  const result = validateLocalChatRequest({
    ...qwenRequest,
    messages: [
      {
        role: "user",
        content: [{ type: "audio", mimeType: "audio/wav", data: "abc" }],
      },
    ],
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "unsupported-modality");
});

test("rejects unsupported reasoning mode", () => {
  const result = validateLocalChatRequest({
    ...qwenRequest,
    reasoningMode: "invalid-mode",
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "unsupported-reasoning");
});
```

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
pnpm --filter @memora/local-model-runtime build && pnpm --filter @memora/local-model-runtime test
```

Expected: FAIL because manifest and validation exports do not exist.

- [ ] **Step 3: Implement typed errors**

Create `packages/local-model-runtime/src/errors.ts`:

```ts
import type { LocalModelError, LocalModelErrorCode } from "./types";

export const createLocalModelError = (
  code: LocalModelErrorCode,
  message: string,
  detail?: string,
): LocalModelError => ({
  code,
  message,
  ...(detail ? { detail } : {}),
});

export const normalizeLocalModelError = (error: unknown): LocalModelError => {
  if (error && typeof error === "object" && "code" in error && "message" in error) {
    return error as LocalModelError;
  }

  if (error instanceof Error) {
    return createLocalModelError("generation-failed", "Local model generation failed.", error.message);
  }

  return createLocalModelError("generation-failed", "Local model generation failed.");
};
```

- [ ] **Step 4: Implement built-in manifests**

Create `packages/local-model-runtime/src/manifests.ts` with exact IDs from the spec:

```ts
import type { LocalModelManifest } from "./types";

export const whisperBaseTimestampedManifest: LocalModelManifest = {
  id: "whisper-base-timestamped",
  displayName: "Whisper Base Timestamped",
  family: "whisper",
  task: "asr",
  modelId: "onnx-community/whisper-base_timestamped",
  runtime: "transformers-js",
  device: "webgpu",
  pool: "asr",
  modalities: {
    input: ["audio"],
    output: ["text"],
  },
  asr: {
    adapter: "whisper",
    supportsWordTimestamps: true,
  },
};

export const qwen35OnnxOptManifest: LocalModelManifest = {
  id: "qwen3.5-0.8b-onnx-opt",
  displayName: "Qwen3.5 0.8B ONNX OPT",
  family: "qwen",
  task: "chat",
  modelId: "onnx-community/Qwen3.5-0.8B-ONNX-OPT",
  runtime: "transformers-js",
  device: "webgpu",
  pool: "chat",
  modalities: {
    input: ["text", "image"],
    output: ["text", "tool-call"],
  },
  dtype: {
    embed_tokens: "q4",
    vision_encoder: "fp16",
    decoder_model_merged: "q4",
  },
  chat: {
    adapter: "qwen3.5",
    supportsSystemPrompt: true,
    supportsStreaming: true,
    supportsReasoning: true,
    reasoningModes: ["non-thinking", "thinking"],
    defaultReasoningMode: "non-thinking",
    supportsTools: true,
    toolCalling: {
      mode: "template-json",
      streamingArgs: false,
      requiresToolResultTemplate: true,
    },
  },
};

export const gemma4E2bOnnxManifest: LocalModelManifest = {
  id: "gemma-4-e2b-it-onnx",
  displayName: "Gemma 4 E2B IT ONNX",
  family: "gemma",
  task: "chat",
  modelId: "onnx-community/gemma-4-E2B-it-ONNX",
  runtime: "transformers-js",
  device: "webgpu",
  pool: "chat",
  modalities: {
    input: ["text", "image"],
    output: ["text", "tool-call"],
  },
  dtype: "q4f16",
  chat: {
    adapter: "gemma4",
    supportsSystemPrompt: true,
    supportsStreaming: true,
    supportsReasoning: true,
    reasoningModes: ["non-thinking", "thinking"],
    defaultReasoningMode: "non-thinking",
    supportsTools: true,
    toolCalling: {
      mode: "native",
      streamingArgs: true,
      requiresToolResultTemplate: true,
    },
  },
};

export const builtInLocalModelManifests = [
  whisperBaseTimestampedManifest,
  qwen35OnnxOptManifest,
  gemma4E2bOnnxManifest,
] as const;
```

- [ ] **Step 5: Implement validation helpers**

Create `packages/local-model-runtime/src/validation.ts`:

```ts
import { createLocalModelError } from "./errors";
import { builtInLocalModelManifests } from "./manifests";
import type { LocalChatRequest, LocalModelError, LocalModelManifest } from "./types";

export type LocalModelValidationResult =
  | { ok: true; manifest: LocalModelManifest }
  | { ok: false; error: LocalModelError };

export const getLocalModelManifest = (id: string): LocalModelManifest | undefined => {
  return builtInLocalModelManifests.find((manifest) => manifest.id === id);
};

const contentToModality = (type: string): "text" | "image" | "audio" | undefined => {
  if (type === "text") return "text";
  if (type === "image") return "image";
  if (type === "audio") return "audio";
  if (type === "tool_call" || type === "tool_result") return undefined;
  return undefined;
};

export const validateLocalChatRequest = (request: LocalChatRequest): LocalModelValidationResult => {
  const manifest = getLocalModelManifest(request.modelId);
  if (!manifest || manifest.task !== "chat" || !manifest.chat) {
    return {
      ok: false,
      error: createLocalModelError("model-not-found", `Local chat model not found: ${request.modelId}`),
    };
  }

  for (const message of request.messages) {
    for (const content of message.content) {
      const modality = contentToModality(content.type);
      if (modality && !manifest.modalities.input.includes(modality)) {
        return {
          ok: false,
          error: createLocalModelError(
            "unsupported-modality",
            `${manifest.displayName} does not support ${modality} input.`,
          ),
        };
      }
    }
  }

  if (request.tools.length > 0 && !manifest.chat.supportsTools) {
    return {
      ok: false,
      error: createLocalModelError(
        "unsupported-tools",
        `${manifest.displayName} does not support tool calling.`,
      ),
    };
  }

  if (
    request.reasoningMode !== undefined &&
    !manifest.chat.reasoningModes.includes(request.reasoningMode)
  ) {
    return {
      ok: false,
      error: createLocalModelError(
        "unsupported-reasoning",
        `${manifest.displayName} does not support reasoning mode ${request.reasoningMode}.`,
      ),
    };
  }

  return { ok: true, manifest };
};
```

- [ ] **Step 6: Export new modules**

Modify `packages/local-model-runtime/src/index.ts`:

```ts
export * from "./errors";
export * from "./manifests";
export * from "./types";
export * from "./validation";
```

- [ ] **Step 7: Run tests**

Run:

```bash
pnpm --filter @memora/local-model-runtime build && pnpm --filter @memora/local-model-runtime test
```

Expected: PASS.

- [ ] **Step 8: Commit manifests and validation**

```bash
git add packages/local-model-runtime
git commit -m "feat(local-model): add manifests and capability validation"
```

## Task 3: Add Priority Queue and Worker Pool Core

**Files:**
- Create: `packages/local-model-runtime/src/queue.ts`
- Modify: `packages/local-model-runtime/src/index.ts`
- Test: `packages/local-model-runtime/test/queue.test.mjs`

- [ ] **Step 1: Write queue tests**

Create `packages/local-model-runtime/test/queue.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";

import { createLocalModelTaskQueue } from "../dist/index.js";

const createTask = (requestId, priority) => ({
  requestId,
  priority,
  task: {
    kind: "chat.generate",
    input: {
      modelId: "qwen3.5-0.8b-onnx-opt",
      systemPrompt: "",
      messages: [],
      tools: [],
    },
  },
});

test("dequeues interactive work before background work", () => {
  const queue = createLocalModelTaskQueue();
  queue.enqueue(createTask("background-1", "background"));
  queue.enqueue(createTask("interactive-1", "interactive"));

  assert.equal(queue.dequeue()?.requestId, "interactive-1");
  assert.equal(queue.dequeue()?.requestId, "background-1");
});

test("preserves insertion order within one priority", () => {
  const queue = createLocalModelTaskQueue();
  queue.enqueue(createTask("interactive-1", "interactive"));
  queue.enqueue(createTask("interactive-2", "interactive"));

  assert.equal(queue.dequeue()?.requestId, "interactive-1");
  assert.equal(queue.dequeue()?.requestId, "interactive-2");
});

test("removes queued task by request id", () => {
  const queue = createLocalModelTaskQueue();
  queue.enqueue(createTask("a", "background"));
  queue.enqueue(createTask("b", "background"));

  assert.equal(queue.remove("a"), true);
  assert.equal(queue.dequeue()?.requestId, "b");
  assert.equal(queue.remove("missing"), false);
});
```

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
pnpm --filter @memora/local-model-runtime build && pnpm --filter @memora/local-model-runtime test
```

Expected: FAIL because queue export does not exist.

- [ ] **Step 3: Implement queue**

Create `packages/local-model-runtime/src/queue.ts`:

```ts
import type { LocalModelPriority, LocalModelTask } from "./types";

export interface QueuedLocalModelTask {
  requestId: string;
  priority: LocalModelPriority;
  task: LocalModelTask;
}

export interface LocalModelTaskQueue {
  enqueue: (task: QueuedLocalModelTask) => void;
  dequeue: () => QueuedLocalModelTask | undefined;
  remove: (requestId: string) => boolean;
  size: () => number;
}

export const createLocalModelTaskQueue = (): LocalModelTaskQueue => {
  const interactive: QueuedLocalModelTask[] = [];
  const background: QueuedLocalModelTask[] = [];

  const removeFrom = (queue: QueuedLocalModelTask[], requestId: string): boolean => {
    const index = queue.findIndex((task) => task.requestId === requestId);
    if (index < 0) return false;
    queue.splice(index, 1);
    return true;
  };

  return {
    enqueue(task) {
      if (task.priority === "interactive") {
        interactive.push(task);
      } else {
        background.push(task);
      }
    },
    dequeue() {
      return interactive.shift() ?? background.shift();
    },
    remove(requestId) {
      return removeFrom(interactive, requestId) || removeFrom(background, requestId);
    },
    size() {
      return interactive.length + background.length;
    },
  };
};
```

- [ ] **Step 4: Export queue**

Modify `packages/local-model-runtime/src/index.ts`:

```ts
export * from "./errors";
export * from "./manifests";
export * from "./queue";
export * from "./types";
export * from "./validation";
```

- [ ] **Step 5: Run tests**

Run:

```bash
pnpm --filter @memora/local-model-runtime build && pnpm --filter @memora/local-model-runtime test
```

Expected: PASS.

- [ ] **Step 6: Commit queue**

```bash
git add packages/local-model-runtime
git commit -m "feat(local-model): add priority task queue"
```

## Task 4: Add Local Provider Package

**Files:**
- Create: `packages/ai-provider/local/package.json`
- Create: `packages/ai-provider/local/tsconfig.json`
- Create: `packages/ai-provider/local/tsdown.config.ts`
- Create: `packages/ai-provider/local/vite.config.ts`
- Create: `packages/ai-provider/local/src/types.ts`
- Create: `packages/ai-provider/local/src/events.ts`
- Create: `packages/ai-provider/local/src/transform.ts`
- Create: `packages/ai-provider/local/src/index.ts`
- Test: `packages/ai-provider/local/test/providerEvents.test.mjs`
- Test: `packages/ai-provider/local/test/transform.test.mjs`

- [ ] **Step 1: Create package metadata and configs**

Mirror `packages/ai-provider/openai` package shape. Use package name `@memora/ai-provider-local` and dependencies:

```json
{
  "@memora/ai-core": "workspace:*",
  "@memora/local-model-runtime": "workspace:*",
  "@valibot/to-json-schema": "^1.3.0"
}
```

Use the same `tsconfig.json`, `tsdown.config.ts`, and `vite.config.ts` shape as `packages/ai-provider/openai`.

- [ ] **Step 2: Write event mapping tests**

Create `packages/ai-provider/local/test/providerEvents.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";

import { localChatEventToProviderEvent } from "../dist/index.js";

test("maps local text events to provider events", () => {
  assert.deepEqual(localChatEventToProviderEvent({ type: "text-delta", delta: "hi" }), {
    type: "text-delta",
    delta: "hi",
  });
});

test("maps local tool events to provider events", () => {
  assert.deepEqual(
    localChatEventToProviderEvent({
      type: "tool-call-complete",
      toolCall: { id: "call_1", name: "search", arguments: { query: "memora" } },
    }),
    {
      type: "tool-call-complete",
      toolCall: { id: "call_1", name: "search", arguments: { query: "memora" } },
    },
  );
});

test("maps local errors to provider error events", () => {
  const event = localChatEventToProviderEvent({
    type: "error",
    error: { code: "unsupported-modality", message: "Images are not supported." },
  });

  assert.equal(event.type, "error");
  assert.equal(event.error.message, "Images are not supported.");
});
```

- [ ] **Step 3: Write request transform tests**

Create `packages/ai-provider/local/test/transform.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";

import { providerRequestToLocalChatRequest } from "../dist/index.js";

const providerRequest = {
  model: "qwen3.5-0.8b-onnx-opt",
  systemPrompt: "You are Memora.",
  messages: [
    {
      id: "user-1",
      role: "user",
      content: [{ type: "text", text: "hello" }],
      createdAt: 1,
    },
  ],
  tools: [],
  temperature: 0.7,
  maxTokens: 128,
};

test("converts provider request to local chat request", () => {
  const local = providerRequestToLocalChatRequest(providerRequest);

  assert.equal(local.modelId, "qwen3.5-0.8b-onnx-opt");
  assert.equal(local.systemPrompt, "You are Memora.");
  assert.equal(local.temperature, 0.7);
  assert.equal(local.maxTokens, 128);
  assert.deepEqual(local.messages[0].content, [{ type: "text", text: "hello" }]);
});
```

- [ ] **Step 4: Run tests and verify failure**

Run:

```bash
pnpm --filter @memora/ai-provider-local build && pnpm --filter @memora/ai-provider-local test
```

Expected: FAIL because implementation does not exist.

- [ ] **Step 5: Implement provider types**

Create `packages/ai-provider/local/src/types.ts`:

```ts
import type { LocalChatEvent, LocalChatRequest, LocalModelPriority } from "@memora/local-model-runtime";

export interface LocalModelClientLike {
  streamChat: (
    request: LocalChatRequest,
    options?: { priority?: LocalModelPriority; signal?: AbortSignal },
  ) => AsyncGenerator<LocalChatEvent>;
}

export interface LocalProviderConfig {
  client: LocalModelClientLike;
  reasoningMode?: "non-thinking" | "thinking";
  priority?: LocalModelPriority;
}
```

- [ ] **Step 6: Implement event mapping**

Create `packages/ai-provider/local/src/events.ts`:

```ts
import type { ProviderEvent } from "@memora/ai-core";
import type { LocalChatEvent } from "@memora/local-model-runtime";

export const localChatEventToProviderEvent = (event: LocalChatEvent): ProviderEvent => {
  switch (event.type) {
    case "text-delta":
    case "reasoning-delta":
    case "reasoning-done":
    case "tool-call-start":
    case "tool-call-args-delta":
    case "tool-call-complete":
      return event;
    case "usage":
      return { type: "usage", usage: event };
    case "status":
      return { type: "status", status: event.status };
    case "model-progress":
      return { type: "status", status: "loading-model" };
    case "error":
      return { type: "error", error: new Error(event.error.message) };
    case "chat-complete":
      return { type: "status", status: "complete" };
  }
};
```

- [ ] **Step 7: Implement request transform**

Create `packages/ai-provider/local/src/transform.ts`:

```ts
import { toJsonSchema } from "@valibot/to-json-schema";

import type { ProviderRequest, ToolDefinition } from "@memora/ai-core";
import type { LocalChatRequest, LocalToolDefinition } from "@memora/local-model-runtime";

const schemaToJsonSchema = (schema: ToolDefinition["parameters"]): Record<string, unknown> => {
  const jsonSchema = toJsonSchema(schema) as Record<string, unknown>;
  delete jsonSchema["$schema"];
  return jsonSchema;
};

const toLocalTools = (tools: ToolDefinition[]): LocalToolDefinition[] => {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: schemaToJsonSchema(tool.parameters),
  }));
};

export const providerRequestToLocalChatRequest = (
  request: ProviderRequest,
  options: { reasoningMode?: "non-thinking" | "thinking" } = {},
): LocalChatRequest => {
  return {
    modelId: request.model,
    systemPrompt: request.systemPrompt,
    messages: request.messages.map((message) => ({
      role: message.role,
      content: message.content,
      ...(message.reasoning ? { reasoning: message.reasoning } : {}),
    })),
    tools: toLocalTools(request.tools),
    ...(options.reasoningMode ? { reasoningMode: options.reasoningMode } : {}),
    ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
    ...(request.maxTokens !== undefined ? { maxTokens: request.maxTokens } : {}),
  };
};
```

- [ ] **Step 8: Implement createLocalProvider**

Create `packages/ai-provider/local/src/index.ts`:

```ts
import type { ProviderAdapter, ProviderRequest } from "@memora/ai-core";

import { localChatEventToProviderEvent } from "./events";
import { providerRequestToLocalChatRequest } from "./transform";
import type { LocalProviderConfig } from "./types";

export type { LocalProviderConfig, LocalModelClientLike } from "./types";
export { localChatEventToProviderEvent } from "./events";
export { providerRequestToLocalChatRequest } from "./transform";

export const createLocalProvider = (config: LocalProviderConfig): ProviderAdapter => {
  return {
    async *stream(request: ProviderRequest, options?: { signal?: AbortSignal }) {
      const localRequest = providerRequestToLocalChatRequest(request, {
        reasoningMode: config.reasoningMode,
      });

      for await (const event of config.client.streamChat(localRequest, {
        priority: config.priority ?? "interactive",
        signal: options?.signal,
      })) {
        const providerEvent = localChatEventToProviderEvent(event);
        if (providerEvent.type === "status" && providerEvent.status === "complete") {
          continue;
        }
        yield providerEvent;
      }
    },
  };
};
```

- [ ] **Step 9: Run provider tests**

Run:

```bash
pnpm --filter @memora/ai-provider-local build && pnpm --filter @memora/ai-provider-local test
```

Expected: PASS.

- [ ] **Step 10: Commit local provider**

```bash
git add packages/ai-provider/local
git commit -m "feat(ai-provider): add local provider adapter"
```

## Task 5: Add Web Local Model Client and Worker Pool

**Files:**
- Create: `packages/web/src/lib/local-model/createWorker.ts`
- Create: `packages/web/src/lib/local-model/workerPool.ts`
- Create: `packages/web/src/lib/local-model/client.ts`
- Create: `packages/web/src/lib/local-model/index.ts`
- Create: `packages/web/src/workers/localModel.worker.ts`
- Modify: `packages/web/package.json`

- [ ] **Step 1: Add workspace dependencies to web**

Modify `packages/web/package.json` dependencies:

```json
"@memora/local-model-runtime": "workspace:*",
"@memora/ai-provider-local": "workspace:*"
```

Do not add new external inference dependencies; `@huggingface/transformers` and `onnxruntime-web` already exist in web.

- [ ] **Step 2: Create worker factory**

Create `packages/web/src/lib/local-model/createWorker.ts`:

```ts
export const createLocalModelWorker = (): Worker => {
  return new Worker(new URL("../../workers/localModel.worker.ts", import.meta.url), {
    type: "module",
  });
};
```

- [ ] **Step 3: Create initial worker entry stub**

Create `packages/web/src/workers/localModel.worker.ts`:

```ts
import type {
  LocalModelEventEnvelope,
  LocalModelWorkerMessage,
} from "@memora/local-model-runtime";

const postEvent = (message: LocalModelEventEnvelope): void => {
  self.postMessage(message);
};

self.addEventListener("message", (event: MessageEvent<LocalModelWorkerMessage>) => {
  const message = event.data;
  if (message.type === "cancel") {
    postEvent({
      requestId: message.requestId,
      event: { type: "status", status: "aborted" },
    });
    return;
  }

  postEvent({
    requestId: message.requestId,
    event: { type: "error", error: { code: "generation-failed", message: "Worker runtime is not implemented yet." } },
  });
});
```

- [ ] **Step 4: Implement worker pool**

Create `packages/web/src/lib/local-model/workerPool.ts` with a minimal pool that can queue, assign, subscribe, and cancel. Keep it small; do not implement model loading here.

Required exported API:

```ts
export interface LocalModelWorkerPool {
  run: (input: {
    requestId: string;
    priority: "interactive" | "background";
    task: LocalModelTask;
    signal?: AbortSignal;
  }) => AsyncGenerator<LocalModelEvent>;
  terminate: () => void;
}

export const createLocalModelWorkerPool = (options: {
  pool: LocalModelPoolKey;
  createWorker: () => Worker;
  maxWorkers?: number;
}): LocalModelWorkerPool => { ... };
```

Implementation rule: for this task, one worker per pool is acceptable, but the API and internal shape must support `maxWorkers` later.

- [ ] **Step 5: Implement local model client**

Create `packages/web/src/lib/local-model/client.ts`:

```ts
import type {
  LocalAsrEvent,
  LocalAsrRequest,
  LocalChatEvent,
  LocalChatRequest,
  LocalModelPriority,
} from "@memora/local-model-runtime";

import { createLocalModelWorker } from "./createWorker";
import { createLocalModelWorkerPool } from "./workerPool";

const createRequestId = (): string => crypto.randomUUID();

export interface LocalModelClient {
  transcribeAudio: (
    request: LocalAsrRequest,
    options?: { priority?: LocalModelPriority; signal?: AbortSignal },
  ) => AsyncGenerator<LocalAsrEvent>;
  streamChat: (
    request: LocalChatRequest,
    options?: { priority?: LocalModelPriority; signal?: AbortSignal },
  ) => AsyncGenerator<LocalChatEvent>;
  terminate: () => void;
}

export const createLocalModelClient = (): LocalModelClient => {
  const asrPool = createLocalModelWorkerPool({ pool: "asr", createWorker: createLocalModelWorker });
  const chatPool = createLocalModelWorkerPool({ pool: "chat", createWorker: createLocalModelWorker });

  return {
    transcribeAudio(request, options = {}) {
      return asrPool.run({
        requestId: createRequestId(),
        priority: options.priority ?? "interactive",
        task: { kind: "asr.transcribe", input: request },
        signal: options.signal,
      }) as AsyncGenerator<LocalAsrEvent>;
    },
    streamChat(request, options = {}) {
      return chatPool.run({
        requestId: createRequestId(),
        priority: options.priority ?? "interactive",
        task: { kind: "chat.generate", input: request },
        signal: options.signal,
      }) as AsyncGenerator<LocalChatEvent>;
    },
    terminate() {
      asrPool.terminate();
      chatPool.terminate();
    },
  };
};

export const localModelClient = createLocalModelClient();
```

- [ ] **Step 6: Export web local model API**

Create `packages/web/src/lib/local-model/index.ts`:

```ts
export { createLocalModelClient, localModelClient } from "./client";
export type { LocalModelClient } from "./client";
```

- [ ] **Step 7: Build web to catch worker import issues**

Run:

```bash
pnpm --filter @memora/local-model-runtime build
pnpm --filter @memora/ai-provider-local build
pnpm --filter @memora/web build
```

Expected: build reaches existing project state or passes. If unrelated pre-existing `packages/web/package.json` / lockfile changes cause dependency errors, run `pnpm install` only if needed and call it out.

- [ ] **Step 8: Commit client and worker pool**

```bash
git add packages/web/package.json packages/web/src/lib/local-model packages/web/src/workers/localModel.worker.ts pnpm-lock.yaml
git commit -m "feat(web): add local model worker client"
```

## Task 6: Move OPFS Cache and Whisper Into Unified Worker

**Files:**
- Create: `packages/web/src/workers/local-model/cache.ts`
- Create: `packages/web/src/workers/local-model/asr/whisper.ts`
- Create: `packages/web/src/workers/local-model/runtime.ts`
- Modify: `packages/web/src/workers/localModel.worker.ts`
- Modify: `packages/web/src/lib/transcript/whisper/client.ts`

- [ ] **Step 1: Extract OPFS cache helper**

Create `packages/web/src/workers/local-model/cache.ts` by moving the current OPFS cache logic from `packages/web/src/workers/whisper.worker.ts`. Keep `/transformers-cache` paths unchanged.

Export:

```ts
export const configureTransformersCache = (env: { useCustomCache: boolean; customCache: unknown }): void => {
  env.useCustomCache = true;
  env.customCache = OPFSCache;
};
```

- [ ] **Step 2: Implement Whisper adapter**

Create `packages/web/src/workers/local-model/asr/whisper.ts` by moving Whisper loading/generation from the old worker.

Export:

```ts
export const runWhisperTranscription = async (
  request: LocalAsrRequest,
  emit: (event: LocalAsrEvent) => void,
): Promise<void> => { ... };
```

Behavior must match old worker:

- model ID: `onnx-community/whisper-base_timestamped`
- device: `webgpu`
- dtype encoder/decoder `fp32`
- `return_timestamps: "word"`
- same `getMaxNewTokens()` behavior
- emits `model-progress`, `status`, and `transcript-complete`

- [ ] **Step 3: Implement worker runtime dispatcher**

Create `packages/web/src/workers/local-model/runtime.ts`:

```ts
export const runLocalModelTask = async (
  task: LocalModelTask,
  emit: (event: LocalModelEvent) => void,
): Promise<void> => {
  switch (task.kind) {
    case "asr.transcribe":
      await runWhisperTranscription(task.input, emit);
      return;
    case "chat.generate":
      emit({ type: "error", error: { code: "generation-failed", message: "Local chat is not implemented yet." } });
      return;
  }
};
```

- [ ] **Step 4: Wire worker entry to dispatcher**

Modify `packages/web/src/workers/localModel.worker.ts`:

- configure Transformers.js cache once
- handle `run`
- emit `status: assigned`, `loading-model`, `running`, `completed`
- handle thrown errors through `normalizeLocalModelError`
- keep cancel support basic for now: mark canceled request IDs and suppress late events

- [ ] **Step 5: Add compatibility wrapper for old Whisper client**

Modify `packages/web/src/lib/transcript/whisper/client.ts` so its existing exported functions call `localModelClient.transcribeAudio()` internally, or mark it as temporary and adapt old message statuses from new events.

Do this to keep transcript hook migration smaller in the next task.

- [ ] **Step 6: Manual smoke check transcript load path**

Run:

```bash
pnpm --filter @memora/web build
```

Expected: build succeeds. Browser smoke test can be done later because WebGPU/model download is environment-sensitive.

- [ ] **Step 7: Commit Whisper runtime migration foundation**

```bash
git add packages/web/src/workers/local-model packages/web/src/workers/localModel.worker.ts packages/web/src/lib/transcript/whisper/client.ts
git commit -m "feat(local-model): run whisper through unified worker"
```

## Task 7: Migrate Transcript Hooks to Local Runtime API

**Files:**
- Modify: `packages/web/src/hooks/transcript/useTranscript.ts`
- Modify: `packages/web/src/hooks/transcript/useFileTranscription.ts`
- Modify: `packages/web/src/hooks/transcript/useTranscript/useSpeechQueue.ts`
- Optional Modify: `packages/web/src/lib/transcript/whisper/client.ts`

- [ ] **Step 1: Replace direct worker refs in live transcript**

Modify `useTranscript.ts`:

- remove direct worker creation for Whisper where possible
- call `localModelClient.transcribeAudio()` for each speech segment
- map `model-progress` to existing loading progress state
- map `transcript-complete` to existing segment handling
- abort outstanding request on cleanup

- [ ] **Step 2: Replace speech queue generation dependency**

Modify `useSpeechQueue.ts`:

- remove `generateWhisperTranscript` import
- make queue processing accept a `transcribeSegment` callback
- keep sequential chunk behavior unchanged

- [ ] **Step 3: Replace file transcription path**

Modify `useFileTranscription.ts`:

- call `localModelClient.transcribeAudio()` with `priority: "background"`
- keep existing decode, save, and transcript record behavior
- keep existing progress UI semantics where possible

- [ ] **Step 4: Remove or reduce compatibility wrapper**

If no imports remain, delete `packages/web/src/lib/transcript/whisper/client.ts`. If removing it is too broad, leave a short compatibility wrapper and add a TODO in the plan follow-up, not in code.

- [ ] **Step 5: Search for old Whisper API usage**

Run:

```bash
rg -n "getOrCreateWhisperWorker|subscribeToWhisperWorker|generateWhisperTranscript|loadWhisperModel" packages/web/src
```

Expected: no usage remains, or only compatibility exports remain if intentionally kept.

- [ ] **Step 6: Build web**

Run:

```bash
pnpm --filter @memora/web build
```

Expected: build passes.

- [ ] **Step 7: Commit transcript migration**

```bash
git add packages/web/src/hooks/transcript packages/web/src/lib/transcript/whisper packages/web/src/lib/local-model
git commit -m "refactor(transcript): use local model runtime for whisper"
```

## Task 8: Add Chat Adapter Test Harness and Tool Parsing Helpers

**Files:**
- Create: `packages/web/src/workers/local-model/chat/types.ts`
- Create: `packages/web/src/workers/local-model/chat/toolParsing.ts`
- Test: `packages/web/test/local-model/toolParsing.test.ts`

- [ ] **Step 1: Define worker-side chat adapter interface**

Create `packages/web/src/workers/local-model/chat/types.ts`:

```ts
import type { LocalChatEvent, LocalChatRequest, LocalModelManifest } from "@memora/local-model-runtime";

export interface LocalChatAdapter {
  run: (
    input: {
      manifest: LocalModelManifest;
      request: LocalChatRequest;
      canceled: () => boolean;
    },
    emit: (event: LocalChatEvent) => void,
  ) => Promise<void>;
}
```

- [ ] **Step 2: Write tool parsing tests**

Create `packages/web/test/local-model/toolParsing.test.ts`:

```ts
import { describe, expect, test } from "vite-plus/test";

import { parseJsonToolCall } from "../../src/workers/local-model/chat/toolParsing";

describe("parseJsonToolCall", () => {
  test("parses a complete JSON tool call", () => {
    expect(parseJsonToolCall('{"name":"search","arguments":{"query":"memora"}}')).toEqual({
      name: "search",
      arguments: { query: "memora" },
    });
  });

  test("returns an error for invalid arguments", () => {
    const result = parseJsonToolCall('{"name":"search","arguments":"bad"}');
    expect(result).toEqual(null);
  });
});
```

- [ ] **Step 3: Implement parser helper**

Create `packages/web/src/workers/local-model/chat/toolParsing.ts`:

```ts
export interface ParsedToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export const parseJsonToolCall = (text: string): ParsedToolCall | null => {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    if (typeof record.name !== "string") return null;
    if (!record.arguments || typeof record.arguments !== "object" || Array.isArray(record.arguments)) {
      return null;
    }
    return {
      name: record.name,
      arguments: record.arguments as Record<string, unknown>,
    };
  } catch {
    return null;
  }
};
```

- [ ] **Step 4: Run targeted test**

Run:

```bash
pnpm --filter @memora/web test -- test/local-model/toolParsing.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit parser helpers**

```bash
git add packages/web/src/workers/local-model/chat packages/web/test/local-model/toolParsing.test.ts
git commit -m "feat(local-model): add chat tool parsing helpers"
```

## Task 9: Implement Qwen Chat Adapter

**Files:**
- Create: `packages/web/src/workers/local-model/chat/qwen35.ts`
- Modify: `packages/web/src/workers/local-model/runtime.ts`
- Test: `packages/web/test/local-model/qwen35Adapter.test.ts`

- [ ] **Step 1: Write formatting tests with fixtures**

Create `packages/web/test/local-model/qwen35Adapter.test.ts` for pure helpers exported from `qwen35.ts`:

- verifies text messages preserve roles
- verifies image content is kept as image content for processor input
- verifies `reasoningMode: "thinking"` changes adapter config
- verifies tool definitions are included in the template context

Keep tests pure; do not load the actual model.

- [ ] **Step 2: Implement Qwen adapter helpers**

In `qwen35.ts`, export pure helpers first:

```ts
export const buildQwenMessages = (...) => { ... };
export const buildQwenGenerationConfig = (...) => { ... };
export const parseQwenToolCall = (...) => { ... };
```

- [ ] **Step 3: Implement runtime adapter**

Add `runQwen35Chat()`:

- imports `AutoProcessor`, `Qwen3_5ForConditionalGeneration`, and `TextStreamer` from `@huggingface/transformers`
- loads model singleton with manifest `modelId`, `dtype`, and `device: "webgpu"`
- validates WebGPU availability before load
- formats messages via processor/chat template
- streams text deltas through `TextStreamer`
- detects tool-call output and emits tool-call events
- emits `reasoning-delta` / `reasoning-done` only when separable reasoning is available; otherwise keep output as text and document limitation in comments only if necessary

- [ ] **Step 4: Wire Qwen into dispatcher**

Modify `runtime.ts`:

- lookup manifest from request model ID
- if manifest chat adapter is `qwen3.5`, call `runQwen35Chat()`
- validate chat request before running

- [ ] **Step 5: Run tests and build**

Run:

```bash
pnpm --filter @memora/web test -- test/local-model/qwen35Adapter.test.ts
pnpm --filter @memora/web build
```

Expected: tests pass and build succeeds.

- [ ] **Step 6: Commit Qwen adapter**

```bash
git add packages/web/src/workers/local-model/chat/qwen35.ts packages/web/src/workers/local-model/runtime.ts packages/web/test/local-model/qwen35Adapter.test.ts
git commit -m "feat(local-model): add qwen chat adapter"
```

## Task 10: Implement Gemma Chat Adapter

**Files:**
- Create: `packages/web/src/workers/local-model/chat/gemma4.ts`
- Modify: `packages/web/src/workers/local-model/runtime.ts`
- Test: `packages/web/test/local-model/gemma4Adapter.test.ts`

- [ ] **Step 1: Write formatting tests with fixtures**

Create `packages/web/test/local-model/gemma4Adapter.test.ts` for pure helpers exported from `gemma4.ts`:

- verifies text/image/audio content is accepted
- verifies multimodal ordering follows Gemma adapter rules
- verifies thinking/non-thinking prompt behavior
- verifies native tool-call fixture parses into `{ name, arguments }`

Do not load the actual model in tests.

- [ ] **Step 2: Implement Gemma adapter helpers**

In `gemma4.ts`, export pure helpers first:

```ts
export const buildGemmaMessages = (...) => { ... };
export const buildGemmaGenerationConfig = (...) => { ... };
export const parseGemmaToolCall = (...) => { ... };
```

- [ ] **Step 3: Implement runtime adapter**

Add `runGemma4Chat()`:

- imports `AutoProcessor`, `Gemma4ForConditionalGeneration`, and `TextStreamer` from `@huggingface/transformers`
- loads model singleton with manifest `modelId`, `dtype: "q4f16"`, and `device: "webgpu"`
- validates WebGPU availability before load
- formats text/image/audio input according to Gemma adapter rules
- streams text deltas
- parses native function calls and emits `tool-call-*` events
- maps thinking output into reasoning events only when separable from final text

- [ ] **Step 4: Wire Gemma into dispatcher**

Modify `runtime.ts`:

- if manifest chat adapter is `gemma4`, call `runGemma4Chat()`
- keep Qwen dispatch unchanged

- [ ] **Step 5: Run tests and build**

Run:

```bash
pnpm --filter @memora/web test -- test/local-model/gemma4Adapter.test.ts
pnpm --filter @memora/web build
```

Expected: tests pass and build succeeds.

- [ ] **Step 6: Commit Gemma adapter**

```bash
git add packages/web/src/workers/local-model/chat/gemma4.ts packages/web/src/workers/local-model/runtime.ts packages/web/test/local-model/gemma4Adapter.test.ts
git commit -m "feat(local-model): add gemma chat adapter"
```

## Task 11: Integrate Local Provider Into Chat Settings

**Files:**
- Modify: `packages/web/src/livestore/provider.ts`
- Modify: `packages/web/src/types/settingsDialog.ts`
- Modify: `packages/web/src/lib/settings/dialogHelpers.ts`
- Modify: `packages/web/src/components/settings/SettingsProviderForm.tsx`
- Modify: `packages/web/src/components/chat/chatPage/useChatModelConfig.ts`
- Modify: `packages/web/package.json`

- [ ] **Step 1: Extend provider persistence safely**

Modify `provider.ts`:

- add `kind` column with default `"openai-compatible"`
- allowed values: `"openai-compatible" | "local"`
- add optional `localModelId` if needed, or keep model selection in existing `models` field
- update create/update event schemas and materializers

Keep existing providers backward compatible by defaulting to `openai-compatible`.

- [ ] **Step 2: Extend settings types**

Modify `settingsDialog.ts`:

```ts
export type ProviderKind = "openai-compatible" | "local";
export type ProviderApiFormat = "chat-completions" | "responses";
```

Add `kind` to `ProviderFormState`.

- [ ] **Step 3: Add local model options**

Modify `dialogHelpers.ts`:

- include built-in local chat manifests as model options for local provider rows
- keep OpenAI provider model parsing unchanged
- display local model names from manifest `displayName`

- [ ] **Step 4: Update provider form UI**

Modify `SettingsProviderForm.tsx`:

- add provider kind toggle
- hide `baseUrl`, `apiKey`, and `apiFormat` when kind is `local`
- show local model list for local provider
- keep existing OpenAI-compatible form behavior unchanged

- [ ] **Step 5: Create local provider in chat config**

Modify `useChatModelConfig.ts`:

- import `createLocalProvider` from `@memora/ai-provider-local`
- import `localModelClient` from `@/lib/local-model`
- if selected provider kind is `local`, create local provider with `client: localModelClient`
- set `isConfigured` for local provider when selected model has a known local chat manifest
- keep OpenAI endpoint logic unchanged for OpenAI-compatible provider rows

- [ ] **Step 6: Run settings/chat tests or build**

Run:

```bash
pnpm --filter @memora/web test -- test/settings/settingsDialogLayout.test.tsx
pnpm --filter @memora/web build
```

Expected: targeted test and build pass.

- [ ] **Step 7: Commit chat settings integration**

```bash
git add packages/web/src/livestore/provider.ts packages/web/src/types/settingsDialog.ts packages/web/src/lib/settings/dialogHelpers.ts packages/web/src/components/settings/SettingsProviderForm.tsx packages/web/src/components/chat/chatPage/useChatModelConfig.ts packages/web/package.json pnpm-lock.yaml
git commit -m "feat(chat): add local model provider selection"
```

## Task 12: Add Abort and Error Handling Coverage

**Files:**
- Test: `packages/ai-provider/local/test/abort.test.mjs`
- Test: `packages/web/test/local-model/workerPool.test.ts`
- Modify: `packages/web/src/lib/local-model/workerPool.ts`
- Modify: `packages/web/src/workers/local-model/runtime.ts`

- [ ] **Step 1: Test provider abort propagation**

Create `packages/ai-provider/local/test/abort.test.mjs` with fake client:

- create an `AbortController`
- start provider stream
- abort signal
- assert fake client receives aborted signal or generator terminates

- [ ] **Step 2: Test worker pool cancel behavior**

Create `packages/web/test/local-model/workerPool.test.ts` using a fake worker object if practical. If browser Worker mocking is too heavy, extract a small request registry helper and test that instead.

Required behaviors:

- cancel queued task removes it
- cancel running task posts `{ type: "cancel", requestId }`
- late events from canceled request are ignored

- [ ] **Step 3: Implement missing cancel logic**

Modify worker pool and runtime until tests pass.

- [ ] **Step 4: Run tests**

Run:

```bash
pnpm --filter @memora/ai-provider-local build && pnpm --filter @memora/ai-provider-local test
pnpm --filter @memora/web test -- test/local-model/workerPool.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit abort/error hardening**

```bash
git add packages/ai-provider/local/test packages/web/src/lib/local-model packages/web/src/workers/local-model packages/web/test/local-model
git commit -m "fix(local-model): handle aborts and late worker events"
```

## Task 13: Final Validation and Manual Smoke Checklist

**Files:**
- Modify only if validation exposes bugs.

- [ ] **Step 1: Run package builds**

Run:

```bash
pnpm --filter @memora/ai-core build
pnpm --filter @memora/local-model-runtime build
pnpm --filter @memora/ai-provider-local build
pnpm --filter @memora/web build
```

Expected: all builds pass.

- [ ] **Step 2: Run package tests**

Run:

```bash
pnpm --filter @memora/local-model-runtime test
pnpm --filter @memora/ai-provider-local test
pnpm --filter @memora/web test -- test/local-model
```

Expected: all targeted tests pass.

- [ ] **Step 3: Run lint/check if available**

Run:

```bash
pnpm --filter @memora/web lint
```

Expected: no new lint errors. If existing unrelated lint errors appear, document them exactly.

- [ ] **Step 4: Manual smoke local transcript**

Run dev server:

```bash
pnpm --filter @memora/web dev
```

Manual checks:

- open `/transcript/live`
- verify model loading progress appears
- record a short phrase
- verify transcript text appears
- stop recording and verify save flow still works

- [ ] **Step 5: Manual smoke local chat**

Manual checks in browser with WebGPU support:

- create/select local provider
- select Qwen local model
- send text prompt
- attach image and send prompt
- ask for an action that triggers an existing tool
- cancel a running generation
- switch to Gemma and repeat text prompt

Expected:

- UI remains responsive
- model downloads use local cache after first load
- text streams into chat bubble
- tool call appears in thinking/tool UI and executes through existing agent loop
- unsupported modality errors are clear

- [ ] **Step 6: Final status**

Run:

```bash
git status --short
```

Expected: only intentional files changed. Do not commit unrelated pre-existing changes unless they are required by this implementation.
