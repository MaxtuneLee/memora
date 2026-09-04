import { Schema } from "@livestore/livestore";
import { describe, expect, test } from "vite-plus/test";
import {
  AI_FEATURES,
  normalizeAiModelRouting,
  parseFeatureModelRoute,
  resolveFeatureModelTarget,
} from "@/lib/models/modelRouting";
import { modelRoutingSchema } from "@/lib/models/modelRoutingSchema";

describe("feature model routing", () => {
  test.each(["personality", "sessionTitle"] as const)(
    "%s follows chat by default without replacing explicit local choices",
    (feature) => {
      const routing = normalizeAiModelRouting(
        {},
        { selectedProviderId: "p", selectedModel: "chat" },
      );
      expect(routing[feature]).toEqual({ source: "inherit", featureId: "assistant" });
      expect(resolveFeatureModelTarget(feature, routing)).toEqual(routing.assistant);
      routing.assistant = { source: "cloud", providerId: "other", modelId: "updated" };
      expect(resolveFeatureModelTarget(feature, routing)).toEqual(routing.assistant);
      const explicit = normalizeAiModelRouting({
        [feature]: { source: "local", modelId: "qwen3.5-0.8b-onnx-opt" },
      });
      expect(explicit[feature]).toEqual({ source: "local", modelId: "qwen3.5-0.8b-onnx-opt" });
    },
  );
  test("a damaged local configuration never inherits a working cloud model", () => {
    const routing = normalizeAiModelRouting({
      assistant: { source: "cloud", providerId: "cloud", modelId: "chat" },
      memoryExtraction: { source: "local", modelId: "missing-local-model" },
    });
    expect(() => resolveFeatureModelTarget("memoryExtraction", routing)).toThrow(
      "Choose a provider and model",
    );
  });
  test("retains legacy chat selection without enabling local chat", () => {
    const routing = normalizeAiModelRouting(
      {},
      { selectedProviderId: "cloud", selectedModel: "model" },
    );
    expect(routing.assistant).toEqual({ source: "cloud", providerId: "cloud", modelId: "model" });
    expect(
      parseFeatureModelRoute("assistant", { source: "local", modelId: "gemma-4-e2b-it-onnx" }),
    ).toBeNull();
    expect(() =>
      Schema.decodeUnknownSync(modelRoutingSchema)({
        assistant: { source: "local", modelId: "gemma-4-e2b-it-onnx" },
      }),
    ).toThrow();
  });

  test("each model feature has a default and explicit cloud support", () => {
    const routing = normalizeAiModelRouting(null);
    for (const feature of AI_FEATURES) {
      expect(routing[feature.id]).toBeDefined();
      expect(
        parseFeatureModelRoute(feature.id, {
          source: "cloud",
          providerId: "cloud",
          modelId: "model",
        }),
      ).toEqual({ source: "cloud", providerId: "cloud", modelId: "model" });
    }
  });

  test("rejects incompatible local models and cross-task inheritance", () => {
    expect(
      parseFeatureModelRoute("transcription", { source: "local", modelId: "gemma-4-e2b-it-onnx" }),
    ).toBeNull();
    expect(
      parseFeatureModelRoute("embedding", { source: "inherit", featureId: "assistant" }),
    ).toBeNull();
    expect(
      parseFeatureModelRoute("embedding", {
        source: "cloud",
        providerId: "p",
        modelId: "e",
        dimensions: 0,
      }),
    ).toBeNull();
  });

  test("resolves explicit routes independently and inherited routes to cloud chat", () => {
    const routing = normalizeAiModelRouting({
      assistant: { source: "cloud", providerId: "p", modelId: "chat" },
      sessionTitle: { source: "local", modelId: "qwen3.5-0.8b-onnx-opt" },
    });
    expect(resolveFeatureModelTarget("memoryExtraction", routing)).toEqual(routing.assistant);
    expect(resolveFeatureModelTarget("sessionTitle", routing)).toEqual(routing.sessionTitle);
    expect(resolveFeatureModelTarget("transcription", routing).source).toBe("local");
  });

  test("unconfigured cloud routes fail explicitly without falling back to local", () => {
    const routing = normalizeAiModelRouting({
      transcription: { source: "cloud", providerId: "", modelId: "" },
    });
    expect(() => resolveFeatureModelTarget("transcription", routing)).toThrow(
      "Choose a provider and model",
    );
    expect(() => resolveFeatureModelTarget("memoryExtraction", routing)).toThrow(
      "Choose a provider and model",
    );
  });
});
