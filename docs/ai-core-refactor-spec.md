# AI Core Refactor Spec

## Goal

Split the current `@memora/ai-core` package into clear layers so that:

- `@memora/ai-core` is provider-neutral runtime code only.
- OpenAI-specific transport and wire formats move into a dedicated provider package.
- Skills-related prompt/tool helpers move into a dedicated extension package.
- `packages/web` keeps current product behavior with minimal UI churn.

This refactor is intentionally breaking at the package API level inside the workspace. We do not keep a compatibility shim in `@memora/ai-core`.

## Current Problems

The current package mixes three unrelated concerns:

1. Runtime orchestration
   - `Agent`, loop phases, tool execution, prompt composition, history persistence
2. OpenAI protocol integration
   - `chat-completions` and `responses` request payloads
   - SSE parsing
   - OpenAI-specific event shapes and builtin tool semantics
3. Skills extension helpers
   - `SkillStore`
   - `createSkillCatalogPromptSegment`
   - `createSkillTools`

This creates three concrete problems:

- `AgentConfig` is polluted with provider-specific fields like `endpoint`, `apiKey`, `apiFormat`, and `builtinTools`.
- `MessageTransformer` and `TransformPipeline` currently target OpenAI message shapes, so provider wire format has become the de facto internal standard.
- `packages/web` cannot depend on runtime abstractions without also depending on provider and extension details.

## Target Packages

### `@memora/ai-core`

Responsibility:

- Provider-neutral runtime
- Neutral message and event model
- Context/history management
- Prompt composition
- Tool registration and execution
- Persistence abstraction

Public API:

- `Agent`, `createAgent`
- `ContextManager`, `createContextManager`
- `PromptComposer`, `createPromptComposer`
- `ToolRegistry`, `createToolRegistry`
- `InMemoryAdapter`, `createInMemoryAdapter`
- neutral types such as `AgentMessage`, `AgentEvent`, `ToolDefinition`, `PromptSegment`, `TokenUsage`
- new provider-neutral contracts:
  - `ProviderAdapter`
  - `ProviderRequest`
  - `ProviderOptions`

Not included:

- OpenAI request/response payload types
- `parseSSEStream`
- `parseResponsesStream`
- `responsesTransform`
- `ApiFormat`
- skill helper types and factories

### `@memora/ai-provider-openai`

Responsibility:

- OpenAI-compatible provider adapter
- `chat-completions` payload building
- `responses` payload building
- wire-format transforms
- SSE parsing
- HTTP request execution
- OpenAI builtin tool configuration

Public API:

- `createOpenAIProvider`
- `OpenAIProviderConfig`
- `OpenAIApiFormat`
- OpenAI-specific helper types only if needed by current workspace consumers

Internal implementation:

- `readSSELines`
- chat-completions stream parser
- responses stream parser
- request builders
- message transform utilities

### `@memora/ai-extension-skills`

Responsibility:

- skill catalog abstractions
- skill prompt segment helper
- skill tool helper

Public API:

- `SkillStore`
- `SkillCatalogEntry`
- `SkillActivationRecord`
- `SkillReadResult`
- `createSkillCatalogPromptSegment`
- `createSkillTools`

## Core Model Changes

### Agent configuration

`AgentConfig` becomes runtime-only:

- `id`
- `model`
- `maxToolResultChars`
- `maxContextChars`
- `temperature`
- `maxTokens`
- `maxIterations`

Removed from `AgentConfig`:

- `endpoint`
- `apiKey`
- `apiFormat`
- `builtinTools`

### Provider injection

`createAgent` changes from:

```ts
createAgent({
  config,
  hooks,
  persistence,
});
```

to:

```ts
createAgent({
  config,
  provider,
  hooks,
  persistence,
});
```

`provider` is required and implements a provider-neutral streaming contract.

### Provider-neutral request contract

`@memora/ai-core` will define:

```ts
interface ProviderRequest {
  model: string;
  systemPrompt: string;
  messages: AgentMessage[];
  tools: ToolDefinition[];
  temperature?: number;
  maxTokens?: number;
}

interface ProviderAdapter {
  stream(
    request: ProviderRequest,
    options?: { signal?: AbortSignal },
  ): AsyncGenerator<AgentEvent>;
}
```

The provider contract uses internal message types, not OpenAI wire types.

## Event Model

`AgentEvent` remains the runtime event contract consumed by `packages/web`, but it must be normalized and provider-neutral.

Keep:

- `text-delta`
- `reasoning-delta`
- `reasoning-done`
- `usage`
- `tool-call-start`
- `tool-call-args-delta`
- `tool-call-complete`
- `tool-result`
- `status`
- `error`
- `done`

Provider-neutral builtin capability events:

- keep `web-search`, but it should carry normalized data only

Remove OpenAI transport-specific events:

- `output-item-added`
- `output-item-done`

If a provider needs internal transport events for its own parser, those stay inside the provider package and do not escape through `@memora/ai-core`.

## Tool Model

`ToolDefinition` becomes strictly function-tool oriented.

Current behavior allows `registerTool()` to accept non-function tool definitions and stores them in `builtinTools`. That path is removed from core.

New rule:

- `Agent.registerTool()` only accepts function tools
- provider-level builtin tools are configured when creating the provider

## Transform Layer

The current `TransformPipeline` and `MessageTransformer` are OpenAI-shaped because they return `LLMMessage[]`.

Decision:

- remove `TransformPipeline` from the public core API
- remove `MessageTransformer` and `ResponseTransformer` from the public API
- keep only internal aggregation logic inside core if needed to assemble `ThinkResult`

Reason:

- there is no meaningful current workspace consumer of OpenAI-shaped transformers
- keeping them would reintroduce wire-format leakage into core

## Runtime Responsibilities That Stay In Core

The following logic remains inside `Agent`:

- append user input to history
- call hooks at the current lifecycle points
- merge personality and notices memory into the system prompt
- context trimming
- call provider stream
- emit provider-normalized events
- execute tools
- append tool observations
- persist conversation history

## OpenAI Provider Responsibilities

The new provider package owns:

- mapping `AgentMessage[]` to chat-completions payloads
- mapping `AgentMessage[]` to responses payloads
- formatting tool definitions for OpenAI
- formatting function tool results for responses
- choosing request endpoint behavior based on provider config
- setting auth headers
- parsing streamed responses into normalized `AgentEvent`s
- mapping provider-specific builtin tool events such as web search into normalized `web-search`

SSE stays inside the provider package. It is not split into another package in this refactor.

## Skills Extension Responsibilities

The new extension package owns:

- skill storage interfaces
- skill activation/resource read result types
- prompt segment generation for skill catalogs
- tool generation for activating and reading skills

`packages/web` should import these directly from `@memora/ai-extension-skills`.

## Web Migration

### Chat runtime

`useChatModelConfig` currently returns a single `agentConfig` that embeds provider details. After the split it will return:

- `agentConfig` for runtime-only settings
- `provider` created by `createOpenAIProvider`
- selected provider metadata for UI/debug logging

`useAgent` will accept:

- `config: Partial<AgentConfig>`
- `provider: ProviderAdapter`

Agent reuse signatures in `useAgent` will include the provider identity/config instead of `endpoint` and `apiFormat` fields taken from `AgentConfig`.

### Background AI helpers

`personalityGenerator.ts` and `noticeExtractor.ts` currently construct `createAgent()` with OpenAI config embedded in `AgentConfig`. They will switch to:

- build runtime config
- build OpenAI provider
- pass both into `createAgent`

### Skills

`builtInSkills.ts`, `widgetTools.ts`, and the built-in skill store types will switch to `@memora/ai-extension-skills`.

### UI event handling

`createAgentEventHandler.ts` must stop depending on `output-item-added` and `output-item-done`.

Normalized provider behavior:

- providers may emit `web-search` with status transitions
- completion events for search should carry enough normalized metadata for the UI to render search queries/results without reading provider-specific payloads

## Testing Changes

### Move tests out of core

Current tests in `packages/ai-core/test` are mostly OpenAI-specific and should move:

- SSE parser tests move to `@memora/ai-provider-openai`
- request payload tests move to `@memora/ai-provider-openai`

### Add core runtime tests

`@memora/ai-core` should gain provider-neutral tests using a fake provider:

- text-only completion
- tool-call loop
- abort behavior
- max-iteration error
- memory-augmented system prompt behavior

### Expected behavior change

The current parser test failure around `tool-call-args-delta` is a test expectation issue, not a runtime blocker. The migrated provider tests should assert the actual normalized event stream, including argument deltas when present.

## Non-Goals

Not included in this refactor:

- redesigning provider settings UI
- changing persisted provider settings schema
- supporting multiple new provider packages in the same change
- introducing a separate shared SSE or transport package
- changing chat product prompts or tool semantics unrelated to the package split
