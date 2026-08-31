import { beforeEach, describe, expect, test, vi } from "vite-plus/test";

import { createFeatureChatRuntime } from "@/lib/models/chatRuntime";
import { normalizeAiModelRouting } from "@/lib/models/modelRouting";
import type { LocalModelClient } from "@/lib/local-model/client";

const factories = vi.hoisted(() => ({
  local: vi.fn((_options: { client: LocalModelClient }) => ({ kind: "local" })),
  remote: vi.fn(() => ({ kind: "cloud" })),
}));
vi.mock("@memora/ai-provider-pi", () => ({
  createLocalPiRuntime: factories.local,
  createRemotePiRuntime: factories.remote,
}));
const localClient = vi.hoisted(() => ({ streamChat: vi.fn<LocalModelClient["streamChat"]>() }));
vi.mock("@/lib/local-model", () => ({ localModelClient: localClient }));

const provider = {
  id: "p",
  name: "Cloud",
  baseUrl: "https://example.test/v1",
  apiFormat: "responses" as const,
  models: "[]",
  createdAt: new Date(0),
  updatedAt: new Date(0),
  deletedAt: null,
};
const context = () => ({
  routing: normalizeAiModelRouting({
    assistant: { source: "cloud", providerId: "p", modelId: "chat" },
  }),
  providers: [provider],
  credentials: [{ providerId: "p", baseUrl: provider.baseUrl, apiKey: "device-key" }],
});

beforeEach(() => vi.clearAllMocks());
describe("feature runtime selection", () => {
  test("records actual usage through the local runtime client only", async () => {
    localClient.streamChat.mockImplementation(async function* () {
      yield { type: "usage", inputTokens: 12, outputTokens: 3 };
      yield { type: "status", status: "completed" };
    });
    const input = context();
    input.routing.personality = { source: "local", modelId: "qwen3.5-0.8b-onnx-opt" };
    const record = vi.fn();
    createFeatureChatRuntime("personality", { ...input, onLocalUsage: record });
    const client = factories.local.mock.calls[0]?.[0].client;
    if (!client) throw new Error("Missing local runtime client");
    for await (const _event of client.streamChat({
      modelId: "qwen3.5-0.8b-onnx-opt",
      systemPrompt: "",
      messages: [],
      tools: [],
    })) {
      /* consume */
    }
    expect(record).toHaveBeenCalledExactlyOnceWith({ inputTokens: 12, outputTokens: 3 });
    record.mockClear();
    createFeatureChatRuntime("assistant", { ...input, onLocalUsage: record });
    expect(record).not.toHaveBeenCalled();
  });
  test("chat always creates a cloud runtime with the device-local credential", () => {
    const record = vi.fn();
    createFeatureChatRuntime("assistant", { ...context(), onCloudUsage: record });
    expect(factories.local).not.toHaveBeenCalled();
    expect(factories.remote).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "device-key",
        selectedModelId: "chat",
        onUsage: record,
      }),
    );
  });
  test("title and personality create independent local runtimes", () => {
    const input = context();
    input.routing.sessionTitle = { source: "local", modelId: "gemma-4-e2b-it-onnx" };
    input.routing.personality = { source: "local", modelId: "qwen3.5-0.8b-onnx-opt" };
    createFeatureChatRuntime("sessionTitle", input, "background");
    createFeatureChatRuntime("personality", input);
    expect(factories.local).toHaveBeenCalledTimes(2);
    expect(factories.remote).not.toHaveBeenCalled();
  });
  test("local memory extraction requires no cloud provider or API key", () => {
    const input = context();
    input.routing.memoryExtraction = { source: "local", modelId: "qwen3.5-0.8b-onnx-opt" };
    createFeatureChatRuntime("memoryExtraction", { ...input, providers: [], credentials: [] });
    expect(factories.local).toHaveBeenCalledOnce();
    expect(factories.remote).not.toHaveBeenCalled();
  });
  test("a changed endpoint cannot reuse the previous endpoint's key", () => {
    const input = context();
    createFeatureChatRuntime("assistant", {
      ...input,
      providers: [{ ...provider, baseUrl: "https://other.test/v1" }],
    });
    expect(factories.remote).toHaveBeenCalledWith(expect.objectContaining({ apiKey: undefined }));
  });
  test("a deleted cloud provider fails without constructing a local fallback", () => {
    const input = context();
    expect(() =>
      createFeatureChatRuntime("assistant", {
        ...input,
        providers: [{ ...provider, deletedAt: new Date() }],
      }),
    ).toThrow("unavailable");
    expect(factories.local).not.toHaveBeenCalled();
    expect(factories.remote).not.toHaveBeenCalled();
  });
});
