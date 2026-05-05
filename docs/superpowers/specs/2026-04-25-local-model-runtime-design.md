# Local Model Runtime Design

## Summary

Build a shared local model runtime for Memora so browser-side AI models run through one consistent worker-based path. The runtime should support local ASR and local chat models without tying the system to one model family.

The first implementation target is not just a new Gemma or Qwen provider. It is a reusable local model layer that can run Whisper transcription, Qwen chat, and Gemma chat through the same request lifecycle: capability lookup, worker scheduling, model loading, streaming events, cancellation, progress, and errors.

The local chat provider must align with `@memora/ai-core`'s full provider contract. It must support text streaming, reasoning events, token usage when available, and tool-call events. Tool execution remains in `ai-core`; the local provider only formats tool definitions for the model and parses model tool-call output back into `ProviderEvent`s.

## Goals

- Create a standard local model runtime for browser-side models.
- Move Whisper transcription onto the same runtime path instead of keeping a dedicated Whisper-only worker protocol.
- Add local chat support for Qwen and Gemma through a provider that implements `ProviderAdapter`.
- Support multiple workers through a managed worker pool instead of a single global worker.
- Describe model capabilities with manifests so model-specific modality, reasoning, and tool-call behavior is explicit.
- Keep model-family behavior isolated in adapters rather than spreading conditional logic through UI hooks.
- Preserve local-first behavior by using OPFS-backed model caching.
- Keep the UI responsive by running model loading and inference in workers.

## Non-Goals

- No server-side local model runtime.
- No Node.js inference path.
- No generic OpenAI-compatible HTTP bridge for local models.
- No direct UI access to raw worker instances.
- No silent dropping of unsupported modalities, tools, or reasoning options.
- No attempt to make Qwen and Gemma share one prompt/template implementation.
- No default parallel loading of multiple large chat models unless the worker pool policy allows it.
- No change to `ai-core` tool execution ownership; tools still run in the agent loop.

## Existing Context

Whisper currently has a dedicated worker in `packages/web/src/workers/whisper.worker.ts`. That worker owns several responsibilities at once:

- configuring Transformers.js and OPFS cache
- loading the Whisper model
- maintaining a singleton ASR pipeline
- receiving `load` and `generate` messages
- posting progress and transcription messages back to the main thread

The main thread currently talks to this worker through `packages/web/src/lib/transcript/whisper/client.ts`. Transcript hooks subscribe to Whisper-specific message statuses and directly call `generateWhisperTranscript()`.

`@memora/ai-core` already has a provider-neutral contract. `ProviderAdapter.stream()` accepts a `ProviderRequest` and yields `ProviderEvent`s. The local chat provider should plug into this contract the same way the OpenAI provider does.

## Architecture

### Package and Module Shape

The runtime should be split into focused layers:

1. `@memora/local-model-runtime`
2. `@memora/ai-provider-local`
3. `packages/web/src/workers/localModel.worker.ts`
4. `packages/web/src/lib/local-model/client.ts`
5. thin feature adapters in transcript and chat code

`@memora/local-model-runtime` owns shared types and pure runtime logic:

- model manifests
- task request and event types
- capability checks
- worker pool policies
- error normalization
- model/task adapter interfaces

`@memora/ai-provider-local` owns the `ProviderAdapter` implementation for chat. It should not import React or transcript code. It converts `ProviderRequest` into a local `chat.generate` task and converts local chat events back into `ProviderEvent`s.

`localModel.worker.ts` is the browser worker entrypoint. It imports Transformers.js, configures the OPFS cache, loads models, runs inference, and emits task events.

`local-model/client.ts` is the main-thread worker manager used by the web app. It creates workers, assigns tasks, tracks request IDs, supports abort, and exposes a typed async stream API.

### Worker Pool

The runtime must support multiple workers from the start.

Workers are grouped by pool key:

- `asr`
- `chat`
- `embedding` reserved for future use

Each pool has its own scheduling policy. The default policy should be conservative:

- ASR pool defaults to one worker.
- Chat pool defaults to one worker.
- Large WebGPU chat models should not be loaded concurrently by default.
- Future light CPU/WASM tasks may opt into more workers.

The manager, not the UI, owns worker lifecycle. UI hooks submit tasks to the manager and subscribe to task events. They do not keep direct references to specific worker instances.

### Scheduling

The manager keeps task queues in the main thread. Workers should run assigned tasks and report state, but they should not own global scheduling decisions.

Tasks include priority:

- `interactive`: chat turns and live transcription segments
- `background`: file transcription and future background indexing

Initial priority rules:

- Chat tasks should not wait behind file transcription.
- Live transcription should not wait behind file transcription in the ASR pool.
- File transcription may be paused or queued when live transcription is active.
- A busy chat worker should report queued state instead of spawning another large model worker by default.

### Task Lifecycle

Every task moves through the same lifecycle:

1. `queued`
2. `assigned`
3. `loading-model`
4. `running`
5. `completed` or `failed` or `aborted`

This lifecycle is surfaced as typed events so transcript pages and chat UI can show accurate progress without knowing worker internals.

## Unified Protocol

### Task Types

The first supported tasks are:

```ts
type LocalModelTaskKind = "asr.transcribe" | "chat.generate";
```

Reserved future task kinds:

```ts
type FutureLocalModelTaskKind = "embedding.generate" | "rerank.score";
```

### Request Envelope

All worker requests use a common envelope:

```ts
interface LocalModelRequestEnvelope<TTask> {
  requestId: string;
  task: TTask;
  priority: "interactive" | "background";
  signal?: never;
}
```

Abort does not send an `AbortSignal` through the worker boundary. The manager sends a separate cancel message:

```ts
interface LocalModelCancelMessage {
  type: "cancel";
  requestId: string;
}
```

### Event Envelope

Worker responses use a common envelope:

```ts
interface LocalModelEventEnvelope<TEvent> {
  requestId: string;
  event: TEvent;
}
```

Common event types:

```ts
type LocalModelCommonEvent =
  | { type: "status"; status: LocalModelTaskStatus }
  | { type: "model-progress"; file?: string; progress?: number; total?: number }
  | { type: "error"; error: LocalModelError };
```

ASR-specific events:

```ts
type LocalAsrEvent =
  | LocalModelCommonEvent
  | { type: "transcript-delta"; text: string }
  | {
      type: "transcript-complete";
      text: string;
      chunks?: Array<{ text: string; timestamp: [number, number] }>;
      audioLength?: number;
    };
```

Chat-specific events should mirror provider events closely:

```ts
type LocalChatEvent =
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
```

`@memora/ai-provider-local` maps `LocalChatEvent` to `ProviderEvent`. This mapping should be mostly one-to-one.

## Model Manifests

Local model support is capability-driven. The runtime must not infer behavior from model IDs alone.

### Manifest Shape

```ts
interface LocalModelManifest {
  id: string;
  displayName: string;
  family: "whisper" | "qwen" | "gemma" | string;
  task: "asr" | "chat" | "embedding";
  modelId: string;
  runtime: "transformers-js";
  device: "webgpu" | "wasm";
  pool: "asr" | "chat" | "embedding";
  modalities: {
    input: Array<"text" | "image" | "audio" | "video">;
    output: Array<"text" | "json" | "tool-call">;
  };
  dtype?: unknown;
  chat?: LocalChatCapabilities;
  asr?: LocalAsrCapabilities;
}
```

### Chat Capabilities

```ts
interface LocalChatCapabilities {
  adapter: "qwen3.5" | "gemma4" | string;
  supportsSystemPrompt: boolean;
  supportsStreaming: boolean;
  supportsReasoning: boolean;
  reasoningModes: Array<"non-thinking" | "thinking">;
  defaultReasoningMode: "non-thinking" | "thinking";
  supportsTools: boolean;
  toolCalling?: {
    mode: "native" | "template-json";
    streamingArgs: boolean;
    requiresToolResultTemplate: boolean;
  };
  generationDefaults?: LocalGenerationDefaults;
}
```

Reasoning should not be reduced to one OpenAI-style field. Qwen and Gemma may need different template flags, prompts, or generation parameters. The shared request can express the user intent, while each adapter maps it to model-specific inputs.

```ts
type LocalReasoningMode = "non-thinking" | "thinking";
```

### Initial Manifests

#### Whisper

```ts
{
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
    output: ["text"]
  }
}
```

#### Qwen

```ts
{
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
    output: ["text", "tool-call"]
  },
  dtype: {
    embed_tokens: "q4",
    vision_encoder: "fp16",
    decoder_model_merged: "q4"
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
      requiresToolResultTemplate: true
    }
  }
}
```

#### Gemma

```ts
{
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
    output: ["text", "tool-call"]
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
      requiresToolResultTemplate: true
    }
  }
}
```

## Chat Request Model

Local chat requests must support mixed content because the initial models have different multimodal capabilities.

```ts
interface LocalChatRequest {
  modelId: string;
  systemPrompt: string;
  messages: LocalChatMessage[];
  tools: LocalToolDefinition[];
  reasoningMode?: LocalReasoningMode;
  temperature?: number;
  maxTokens?: number;
}
```

```ts
interface LocalChatMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: LocalChatContent[];
  reasoning?: string;
}
```

```ts
type LocalChatContent =
  | { type: "text"; text: string }
  | { type: "image"; mimeType: string; data: string }
  | { type: "audio"; mimeType: string; data: string }
  | { type: "tool_call"; id: string; name: string; arguments: Record<string, unknown> }
  | { type: "tool_result"; id: string; name: string; result: unknown; isError?: boolean };
```

The provider adapter converts from `AgentMessage` to `LocalChatMessage`. Unsupported content must produce a typed error before generation starts.

## Tool Calling

Tool calling is required for local chat models. The local provider must align with `ai-core` behavior instead of implementing a separate tool loop.

### Ownership

`ai-core` owns:

- tool registry
- tool execution
- tool result messages
- multi-iteration agent loop
- final assistant message assembly

`@memora/ai-provider-local` owns:

- converting `ToolDefinition` into local model tool descriptions
- passing tool definitions into the selected model adapter
- parsing model tool-call output
- emitting `tool-call-start`, `tool-call-args-delta`, and `tool-call-complete`
- formatting previous `tool_result` messages back into model-specific chat input

### Tool Definition Conversion

The local provider should convert Valibot schemas into JSON Schema in the same spirit as the OpenAI provider. The strictness rules should be shared where possible, or moved to a small common helper to avoid schema drift.

The output shape should be model-neutral first:

```ts
interface LocalToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}
```

Each chat adapter then maps this into the model-specific prompt/template format.

### Event Requirements

When a model calls a tool, the provider must emit:

1. `tool-call-start`
2. zero or more `tool-call-args-delta`
3. `tool-call-complete`

If the model only emits a complete JSON tool call without streamed argument deltas, the provider may emit a single `tool-call-args-delta` containing the full argument JSON before `tool-call-complete`. This keeps `ai-core` argument accumulation behavior consistent.

### Parser Requirements

Tool-call parsers must be adapter-specific.

- `gemma4` parser handles Gemma native function calling output.
- `qwen3.5` parser handles Qwen template/JSON tool-call output.

Parsers must reject invalid tool calls with a typed provider error instead of emitting partial tool calls with guessed arguments.

### Tool Result Formatting

The next agent iteration sends previous tool results in `ProviderRequest.messages`. Each model adapter must format these tool result messages correctly for its chat template.

The runtime should not hide tool result messages or flatten them into generic text unless the adapter explicitly requires that representation.

## Reasoning

Reasoning support is required when the selected model manifest declares it.

The shared request exposes reasoning intent as `reasoningMode`, not as an OpenAI-specific `reasoning.effort` object.

Adapters decide how to apply this:

- Qwen adapter chooses its thinking or non-thinking template/config behavior.
- Gemma adapter controls thinking according to Gemma's expected prompt/template behavior.

If a model emits separable reasoning text, the provider should emit `reasoning-delta` and `reasoning-done`. If a model supports reasoning mode but does not expose separable reasoning output, the manifest must say so before the provider claims full reasoning event support.

The provider should not duplicate reasoning text into normal assistant output.

## Multimodal Handling

The runtime must validate content against the selected model manifest before generation.

Examples:

- Qwen accepts text and image input.
- Gemma model capability includes audio, but the first implementation exposes text and image until decoded audio chat input is wired.
- Whisper accepts audio input only and is not a chat model.

Unsupported content returns a typed `unsupported-modality` error. It must not be silently dropped.

Multimodal formatting is adapter-specific:

- Qwen adapter uses Qwen's processor and chat template.
- Gemma adapter uses Gemma's processor and respects its expected multimodal ordering.

The provider adapter should preserve `AgentMessage` structure as long as possible. Flattening to text should only happen inside an adapter that explicitly requires it.

## OPFS Cache

The OPFS Transformers.js cache currently embedded in the Whisper worker should move into the local model runtime worker support code.

Requirements:

- Keep using `/transformers-cache` as the cache root.
- Preserve compatibility with storage statistics that count model cache size.
- Share one cache implementation across ASR and chat models.
- Report model download progress through the unified event protocol.
- Treat cache failures as recoverable when network loading can continue.

## Error Handling

Local model errors should be typed and user-safe.

Initial error codes:

```ts
type LocalModelErrorCode =
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
```

Errors should include a developer-facing detail string and a user-facing message. UI code should not parse raw exception text from Transformers.js.

## Cancellation

The manager must support cancellation by request ID.

Abort sources:

- chat turn cancellation from `ai-core`
- transcript page unmount
- user stops recording
- user cancels file transcription
- worker crash or model unload

The local provider must wire `ProviderAdapter.stream(..., { signal })` into manager cancellation. If the signal aborts, the manager sends a cancel message and the async generator terminates cleanly.

If the underlying Transformers.js call cannot be interrupted immediately, the worker should ignore late output for the canceled request and return to idle as soon as possible.

## Web App Integration

### Transcript Migration

Transcript hooks should stop importing `getOrCreateWhisperWorker`, `subscribeToWhisperWorker`, and `generateWhisperTranscript` directly.

They should instead call a runtime client API such as:

```ts
localModelClient.transcribeAudio({
  modelId: "whisper-base-timestamped",
  audio,
  language,
  priority: "interactive"
});
```

File transcription uses the same API with `priority: "background"`.

The transcript UI should keep its existing behavior and data model. This migration is a runtime refactor first, not a transcript UX redesign.

### Chat Integration

Settings should allow selecting local providers/models without requiring endpoint or API key fields.

`useChatModelConfig` should create either an OpenAI provider or a local provider based on provider kind. The local provider should receive the shared `localModelClient` and selected local model manifest.

The local provider must expose the same behavior expected by `createAgent()`:

- stream assistant text
- stream or finalize reasoning
- emit tool-call events
- return usage when available
- honor abort

## Testing Strategy

### Runtime Tests

Add unit tests for pure runtime pieces:

- manifest lookup
- modality validation
- reasoning capability validation
- tool capability validation
- worker pool task routing
- queue priority behavior
- error normalization

### Provider Tests

Add provider-level tests using fake local chat adapters:

- text delta mapping
- reasoning delta and done mapping
- tool-call start/args/complete mapping
- abort propagation
- unsupported modality error
- unsupported tools error
- tool result message conversion

### Adapter Tests

Add adapter tests with fixture outputs:

- Qwen text generation formatting
- Qwen image input formatting
- Qwen tool-call parsing
- Qwen thinking/non-thinking request config
- Gemma text generation formatting
- Gemma image/audio input formatting
- Gemma tool-call parsing
- Gemma thinking/non-thinking prompt behavior

These tests should not require downloading real models. Real model smoke tests can be manual or gated separately because model downloads are large and WebGPU availability depends on the browser environment.

### Transcript Regression Tests

Existing transcript behavior should remain intact:

- live transcription can load a model
- speech queue still processes chunks sequentially
- file transcription can run as background work
- progress UI receives model download progress
- cleanup cancels outstanding work

## Migration Plan

### Phase 1: Types and Runtime Skeleton

- Add local model runtime package or module.
- Define manifests for Whisper, Qwen, and Gemma.
- Define unified task and event types.
- Add worker manager with pool-aware scheduling.
- Add OPFS cache helper shared by local model workers.

### Phase 2: Whisper Migration

- Move Whisper worker logic into the unified worker path.
- Keep existing transcript UI and storage behavior.
- Replace Whisper-specific client calls with local runtime client calls.
- Verify live and file transcription still work.

### Phase 3: Local Chat Provider

- Add `@memora/ai-provider-local`.
- Implement `ProviderAdapter.stream()` using local runtime chat tasks.
- Add chat provider selection support in web settings.
- Add text/reasoning/tool event mapping tests.

### Phase 4: Qwen Adapter

- Add Qwen3.5 ONNX OPT manifest.
- Implement Qwen chat formatting for text and image input.
- Implement Qwen thinking/non-thinking config mapping.
- Implement Qwen tool-call formatting and parsing.

### Phase 5: Gemma Adapter

- Add Gemma 4 E2B manifest.
- Implement Gemma chat formatting for text, image, and audio input.
- Implement Gemma thinking behavior.
- Implement Gemma native tool-call formatting and parsing.

### Phase 6: UI Hardening

- Add local model loading/progress states in chat settings and composer surfaces.
- Add unsupported modality messaging before a request starts.
- Add WebGPU unavailable messaging for local chat, similar to transcript.
- Add model cache status and cleanup affordances if needed.

## Open Questions

- Should manifests live in `@memora/local-model-runtime` as built-ins, or should web own the initial manifest registry?
- Should Qwen and Gemma adapters live in the runtime package, or in separate adapter modules under the runtime package?
- Should chat pool allow switching between Qwen and Gemma in one worker, or should each loaded chat model get a dedicated worker instance?
- How should model unload be exposed to the user when storage or GPU memory is constrained?
- Should local model settings expose reasoning mode globally per model, per chat session, or per message?

## Success Criteria

- Whisper no longer depends on a Whisper-only worker protocol.
- Local chat provider can be selected without endpoint or API key fields.
- Qwen and Gemma requests run in workers, not on the main thread.
- Local chat streams `ProviderEvent`s compatible with `ai-core`.
- Tool calls from local models execute through the existing `ai-core` loop.
- Unsupported modalities, tools, and reasoning modes fail clearly before generation.
- Multiple worker pools prevent ASR and chat work from blocking each other.
- Model download progress and model cache behavior remain visible and local-first.
