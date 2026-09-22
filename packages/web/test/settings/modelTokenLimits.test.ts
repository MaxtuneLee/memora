import { describe, expect, test } from "vite-plus/test";

import { loadPiModelLimits } from "@memora/ai-provider-pi";

import { parseProviderModel } from "@/lib/settings/dialogHelpers";

const lookup = (modelId: string) =>
  modelId === "known-model" ? { contextWindow: 200_000, maxTokens: 64_000 } : undefined;

describe("model token limit resolution", () => {
  test("discovery metadata wins over the registry", () => {
    const model = parseProviderModel(
      { id: "known-model", context_length: 8192, max_output_tokens: 1024 },
      lookup,
    );
    expect(model?.contextWindow).toBe(8192);
    expect(model?.maxTokens).toBe(1024);
    expect(
      parseProviderModel({ id: "known-model", top_provider: { context_length: 4096 } }, lookup)
        ?.contextWindow,
    ).toBe(4096);
  });
  test("the registry fills in when discovery says nothing", () => {
    const model = parseProviderModel({ id: "known-model" }, lookup);
    expect(model?.contextWindow).toBe(200_000);
    expect(model?.maxTokens).toBe(64_000);
  });
  test("each field falls back on its own", () => {
    // A provider that advertises only the window must not lose the registry's output limit.
    const model = parseProviderModel({ id: "known-model", context_length: 8192 }, lookup);
    expect(model?.contextWindow).toBe(8192);
    expect(model?.maxTokens).toBe(64_000);
  });
  test("the defaults apply only when neither source knows the model", () => {
    const model = parseProviderModel({ id: "mystery-model" }, lookup);
    expect(model?.contextWindow).toBe(32768);
    expect(model?.maxTokens).toBe(4096);
    expect(parseProviderModel({ id: "mystery-model" })?.contextWindow).toBe(32768);
  });
  test("pi's catalog reports real limits", async () => {
    const piLookup = await loadPiModelLimits();
    expect(piLookup("gpt-4-turbo")).toEqual({ contextWindow: 128_000, maxTokens: 4096 });
    // DeepSeek's own listing carries neither limit, so both have to come from the catalog.
    expect(piLookup("deepseek-flash")).toEqual({ contextWindow: 1_000_000, maxTokens: 384_000 });
    expect(piLookup("not-a-real-model")).toBeUndefined();
  });
});
