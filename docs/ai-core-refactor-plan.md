# AI Core Refactor Plan

## Phase 1: Establish new package boundaries

1. Create `packages/ai-provider/openai` with workspace-valid package name `@memora/ai-provider-openai`.
2. Create `packages/ai-extensions/skills` with workspace-valid package name `@memora/ai-extension-skills`.
3. Add package build configs matching the existing `vp pack` pattern.

## Phase 2: Make `@memora/ai-core` provider-neutral

1. Add provider-neutral contracts to core:
   - `ProviderAdapter`
   - `ProviderRequest`
2. Remove OpenAI-specific fields from `AgentConfig`.
3. Change `AgentOptions` and `createAgent()` to require `provider`.
4. Refactor `loop.ts` so `think()` delegates model streaming to `provider.stream()`.
5. Remove provider-specific code from core exports:
   - OpenAI wire types
   - stream parsers
   - responses transform
   - public transform pipeline API

## Phase 3: Move provider-specific implementation

1. Move OpenAI payload/request types into `@memora/ai-provider-openai`.
2. Move `responsesTransform` and any OpenAI message conversion into the provider package.
3. Move SSE parsers into the provider package.
4. Implement `createOpenAIProvider()` that normalizes streamed output into core `AgentEvent`s.

## Phase 4: Move skills extension

1. Move `SkillStore` types and `createSkillCatalogPromptSegment()` / `createSkillTools()` into `@memora/ai-extension-skills`.
2. Remove those exports from `@memora/ai-core`.

## Phase 5: Migrate `packages/web`

1. Update chat config assembly to return runtime config plus provider instance.
2. Update `useAgent` to accept provider injection.
3. Update onboarding/background AI helpers to create the OpenAI provider explicitly.
4. Update built-in skill imports to use `@memora/ai-extension-skills`.
5. Simplify `createAgentEventHandler()` to rely on normalized provider events only.

## Phase 6: Rebuild tests around the new boundaries

1. Add fake-provider runtime tests in `@memora/ai-core`.
2. Move parser/payload tests into `@memora/ai-provider-openai`.
3. Update failing stream expectations to include `tool-call-args-delta` where applicable.
4. Run targeted tests for all three packages plus key `web` flows.
