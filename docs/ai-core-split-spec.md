# AI Core Split Spec

## Summary

Refactor `@memora/ai-core` into a provider-neutral runtime package and extract the current OpenAI-specific and skills-specific logic into dedicated workspace packages.

Target packages:

- `@memora/ai-core`
- `@memora/ai-provider-openai`
- `@memora/ai-extension-skills`

This is an internal clean break. No compatibility shim will be kept inside `@memora/ai-core`.

## Current Problems

- `@memora/ai-core` mixes runtime orchestration, OpenAI transport, OpenAI payload shapes, SSE parsing, and skill extension helpers.
- `AgentConfig` currently embeds provider transport fields such as `endpoint`, `apiKey`, `apiFormat`, and `builtinTools`.
- `MessageTransformer` and `TransformPipeline` are provider-shaped because they return OpenAI message payloads.
- `AgentEvent` currently exposes provider-specific event shapes such as `output-item-added` and `output-item-done`.
- `web` imports skill helpers directly from `@memora/ai-core`.

## Goals

- Make `@memora/ai-core` independent from OpenAI wire formats and transport details.
- Keep `@memora/ai-core` responsible only for runtime orchestration and provider-neutral contracts.
- Move OpenAI request building, stream parsing, and provider configuration into `@memora/ai-provider-openai`.
- Move skill catalog and skill tools into `@memora/ai-extension-skills`.
- Keep current product behavior in `packages/web`.

## Non-Goals

- Do not introduce a generic transport package for SSE in this refactor.
- Do not keep compatibility exports for OpenAI payload types in `@memora/ai-core`.
- Do not redesign the product-level provider settings model in `packages/web`.

## Package Boundaries

### `@memora/ai-core`

This package owns:

- `Agent`, `createAgent`
- `ContextManager`, `PromptComposer`, `ToolRegistry`
- `PersistenceAdapter`, `InMemoryAdapter`
- Provider-neutral message, tool, prompt, loop, and event types
- Runtime hooks and loop lifecycle
- Memory merge behavior for personality and notices

This package must not own:

- OpenAI request or response payload types
- OpenAI-specific transforms
- HTTP request execution
- SSE parsing
- Provider builtin tool definitions
- Skill-specific catalog or tool factories

### `@memora/ai-provider-openai`

This package owns:

- OpenAI provider config
- OpenAI chat-completions payload types
- OpenAI responses payload types
- Internal-message to OpenAI request transforms
- OpenAI SSE parsers
- HTTP request execution
- Mapping OpenAI stream events into provider-neutral events
- OpenAI builtin tool configuration, including responses builtin tools

### `@memora/ai-extension-skills`

This package owns:

- `SkillStore`
- `SkillCatalogEntry`
- `SkillActivationRecord`
- `SkillReadResult`
- `createSkillCatalogPromptSegment`
- `createSkillTools`

## Public API Changes

### Core types

`AgentConfig` becomes runtime-only:

- Keep:
  - `id`
  - `model`
  - `maxToolResultChars`
  - `maxContextChars`
  - `temperature`
  - `maxTokens`
  - `maxIterations`
- Remove:
  - `endpoint`
  - `apiKey`
  - `apiFormat`
  - `builtinTools`

Add a provider adapter contract:

```ts
export interface ProviderRequest {
  model: string;
  systemPrompt: string;
  messages: AgentMessage[];
  tools: ToolDefinition[];
  temperature?: number;
  maxTokens?: number;
}

export type ProviderEvent =
  | { type: "status"; status: string }
  | { type: "text-delta"; delta: string }
  | { type: "reasoning-delta"; delta: string }
  | { type: "reasoning-done"; text: string }
  | { type: "usage"; usage: TokenUsage }
  | { type: "tool-call-start"; toolCall: { id: string; name: string } }
  | { type: "tool-call-args-delta"; toolCallId: string; delta: string }
  | {
      type: "tool-call-complete";
      toolCall: { id: string; name: string; arguments: Record<string, unknown> };
    }
  | {
      type: "web-search";
      status: "in_progress" | "searching" | "completed";
      itemId: string;
      queries?: string[];
      results?: Array<{ title?: string; url?: string }>;
    }
  | { type: "error"; error: Error };

export interface ProviderAdapter {
  stream: (
    request: ProviderRequest,
    options?: { signal?: AbortSignal },
  ) => AsyncGenerator<ProviderEvent>;
}
```

`AgentOptions` changes to:

```ts
export interface AgentOptions {
  config: AgentConfig;
  provider: ProviderAdapter;
  hooks?: AgentHooks;
  persistence?: PersistenceAdapter;
}
```

### Tool registration

`registerTool()` becomes function-tool only.

- Remove support for non-function tools in `@memora/ai-core`.
- Provider builtin tools must be configured on the provider instance, not registered through the runtime tool registry.

### Event model

`AgentEvent` in core becomes the runtime event surface and matches the provider-neutral event model plus runtime-only events:

- Keep:
  - `status`
  - `text-delta`
  - `reasoning-delta`
  - `reasoning-done`
  - `usage`
  - `tool-call-start`
  - `tool-call-args-delta`
  - `tool-call-complete`
  - `tool-result`
  - `web-search`
  - `error`
  - `done`
- Remove:
  - `output-item-added`
  - `output-item-done`
  - `thinking`

### Transformer API

Remove the current provider-shaped public transformer API from core:

- remove `MessageTransformer`
- remove `ResponseTransformer`
- remove `TransformPipeline`
- remove `createTransformPipeline`
- remove `responsesTransform`

Reason: the current shapes are tied to OpenAI wire messages and do not belong in a provider-neutral core.

If runtime-level message preprocessing is still needed, reintroduce a new neutral middleware API in a separate follow-up change.

## File Ownership After Split

### Stay in `@memora/ai-core`

- `src/context.ts`
- `src/persistence.ts`
- `src/prompt.ts`
- `src/tools.ts`
- `src/utils.ts`
- `src/loop.ts`
- `src/types.ts`
- `src/index.ts`

These files must be updated to remove provider-specific and skills-specific types or exports.

### Move to `@memora/ai-provider-openai`

- OpenAI payload types from `src/types.ts`
- OpenAI-specific transforms from `src/transform.ts`
- OpenAI stream parsing from `src/stream.ts`
- HTTP request and payload branching currently embedded in `src/loop.ts`

`src/transform.ts` should not survive as-is in core. Split it into:

- provider-local transform code in `@memora/ai-provider-openai`
- a small internal result collector in core if needed

### Move to `@memora/ai-extension-skills`

- `src/skills.ts`
- skill-related exports from `src/index.ts`

## Web Migration

### Chat runtime assembly

`packages/web/src/components/chat/chatPage/useChatModelConfig.ts` must stop encoding provider transport fields into `AgentConfig`.

It should return:

- `agentConfig`
- `provider`
- existing selected provider metadata for UI and helper flows

The OpenAI provider instance should be created there using:

```ts
createOpenAIProvider({
  endpoint,
  apiKey,
  apiFormat,
})
```

### Agent creation

`packages/web/src/hooks/chat/useAgent.ts` must pass the provider into `createAgent()`.

Its instance signature cache must include provider config instead of reading provider fields from `AgentConfig`.

### Utility flows

These files currently build temporary one-off agents with OpenAI transport fields embedded in `AgentConfig` and must migrate to provider injection:

- `packages/web/src/lib/chat/personalityGenerator.ts`
- `packages/web/src/lib/chat/noticeExtractor.ts`

### Skills imports

These files must switch from `@memora/ai-core` to `@memora/ai-extension-skills`:

- `packages/web/src/lib/skills/builtInSkills.ts`
- `packages/web/src/lib/skills/builtInSkillStore/store.ts`
- `packages/web/src/lib/skills/builtInSkillStore/manifest.ts`
- `packages/web/src/lib/chat/showWidget.ts`
- `packages/web/src/lib/chat/tools/widgetTools.ts`

### Event handling

`packages/web/src/hooks/chat/useAgent/createAgentEventHandler.ts` must stop depending on `output-item-added` and `output-item-done`.

OpenAI web search events must be normalized inside the provider so the UI only consumes:

- `web-search` with status progression
- optional `queries`
- optional `results`

## Testing Changes

### Move or rewrite tests

Current parser tests under `packages/ai-core/test` belong to the provider package after the split.

Expected destination:

- `packages/ai-provider/openai/test/parseSSEStream.test.mjs`
- additional provider tests for responses stream parsing and request payload generation

### Core tests

Core tests should cover:

- text-only turn completion with a fake provider
- tool-call loop with a fake provider
- abort behavior
- max-iteration behavior
- personality and notices memory merge

### Provider tests

Provider tests should cover:

- chat-completions stream parsing
- responses stream parsing
- reasoning propagation
- tool-call delta and completion propagation
- usage propagation
- request payload generation for both formats
- builtin tool injection for responses format

### Existing known failure

Current `pnpm --filter @memora/ai-core test` fails in the stream parser suite because the implementation emits `tool-call-args-delta` and the old expectation omits it. This test must move to the provider package and be updated to match the intended event contract.

## Implementation Order

1. Create the spec-driven provider-neutral contracts in `@memora/ai-core`.
2. Refactor core `Agent` to depend on `ProviderAdapter`.
3. Create `@memora/ai-provider-openai` and move OpenAI transforms, stream parsers, and HTTP request logic there.
4. Migrate `packages/web` to provider injection.
5. Create `@memora/ai-extension-skills` and move skill helpers plus web imports.
6. Run focused package tests and fix regressions.

## Acceptance Criteria

- `@memora/ai-core` contains no OpenAI request/response payload types.
- `@memora/ai-core` does not import or export any SSE parser.
- `AgentConfig` in core has no transport fields.
- `packages/web` chat still works for both `chat-completions` and `responses`.
- skills functionality still works through the new extension package.
- tests for parser logic live under the provider package, not under core.
