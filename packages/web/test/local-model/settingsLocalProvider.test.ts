import { readFileSync } from "node:fs";

import { builtInLocalModelManifests } from "@memora/local-model-runtime";
import { describe, expect, test } from "vite-plus/test";

import { parseProviderModel } from "../../src/lib/settings/dialogHelpers";
import {
  applyLocalModelProgressEvent,
  getLocalModelDownloadedBytes,
  getLocalModelDownloadProgress,
  getLocalModelDownloadTotalBytes,
} from "../../src/lib/local-model/downloadState";
import type { LocalModelDownloadState } from "../../src/lib/local-model/downloadState";

const readSource = (path: string): string => {
  return readFileSync(new URL(path, import.meta.url), "utf8");
};

describe("local model settings", () => {
  test("offers only chat-capable local models in settings", () => {
    const chatModels = builtInLocalModelManifests.filter((manifest) => manifest.task === "chat");

    expect(chatModels.map((manifest) => manifest.id)).toEqual([
      "qwen3.5-0.8b-onnx-opt",
      "gemma-4-e2b-it-onnx",
    ]);
  });

  test("keeps local model context windows in model metadata", () => {
    expect(
      builtInLocalModelManifests.find((manifest) => manifest.id === "qwen3.5-0.8b-onnx-opt")
        ?.limits,
    ).toEqual({
      contextWindow: 262144,
    });
    expect(
      builtInLocalModelManifests.find((manifest) => manifest.id === "gemma-4-e2b-it-onnx")?.limits,
    ).toEqual({
      contextWindow: 131072,
    });
    expect(
      parseProviderModel({
        id: "local",
        contextWindow: 3,
      }),
    ).toMatchObject({
      contextWindow: 3,
    });
  });

  test("keeps provider management remote-only while preserving local model settings", () => {
    const formSource = readSource("../../src/components/settings/SettingsProviderForm.tsx");
    const hookSource = readSource("../../src/hooks/settings/useAiProviderSettings.ts");
    const settingsSource = readSource("../../src/types/settings.ts");

    expect(formSource).not.toContain('kind: "local"');
    expect(formSource).not.toContain("Reasoning mode");
    expect(formSource).not.toContain("Local models run in browser workers");
    expect(hookSource).not.toContain("getLocalProviderModels");
    expect(hookSource).not.toContain('baseUrl: isLocalProvider ? ""');
    expect(hookSource).not.toContain('apiKey: isLocalProvider ? ""');
    expect(settingsSource).toContain('id: "local-models"');
  });

  test("keeps every local model download file visible while progress events rotate", () => {
    const initialState: LocalModelDownloadState = { status: "downloading", progress: 0 };
    const state = [
      { file: "config.json", progress: 100 },
      { file: "onnx/embed_tokens_q4f16.onnx_data", progress: 34 },
      { file: "onnx/decoder_model_merged_q4f16.onnx_data", progress: 33 },
      { file: "onnx/audio_encoder.onnx_data", progress: 64 },
    ].reduce((current, event) => applyLocalModelProgressEvent(current, event), initialState);

    expect(state.files?.map((file) => file.file)).toEqual([
      "config.json",
      "onnx/embed_tokens_q4f16.onnx_data",
      "onnx/decoder_model_merged_q4f16.onnx_data",
      "onnx/audio_encoder.onnx_data",
    ]);
    expect(state.files?.find((file) => file.file === "config.json")?.progress).toBe(100);
    expect(state.progress).toBe(64);
  });

  test("derives stable aggregate bytes and progress from rotating file events", () => {
    const manifestTotalBytes = 1_000;
    const initialState: LocalModelDownloadState = { status: "downloading", progress: 0 };
    const state = [
      { file: "config.json", total: 100, progress: 100 },
      { file: "weights.bin", total: 300, progress: 40 },
      { file: "decoder.bin", total: 600, progress: 25 },
    ].reduce((current, event) => applyLocalModelProgressEvent(current, event), initialState);

    expect(getLocalModelDownloadTotalBytes(state, manifestTotalBytes)).toBe(1_000);
    expect(getLocalModelDownloadedBytes(state, manifestTotalBytes)).toBe(370);
    expect(getLocalModelDownloadProgress(state, manifestTotalBytes)).toBe(37);
  });

  test("uses the remote chat prompt path only", () => {
    const chatPageSource = readSource("../../src/components/chat/ChatPage.tsx");
    const chatConfigSource = readSource("../../src/components/chat/chatPage/useChatModelConfig.ts");

    expect(chatPageSource).toContain("activePromptSegments");
    expect(chatPageSource).toContain("activeTools");
    expect(chatPageSource).not.toContain("localPromptSegments");
    expect(chatPageSource).not.toContain("LOCAL_CHAT_PROMPT");
    expect(chatPageSource).toContain("const activeTools = remoteTools");
    expect(chatConfigSource).not.toContain("createLocalProvider");
    expect(chatConfigSource).not.toContain('selectedProviderKind === "local"');
  });

  test("filters local providers out of chat and settings queries and cleans legacy records", () => {
    const providerStoreSource = readSource("../../src/livestore/provider.ts");
    const settingsQueriesSource = readSource("../../src/lib/settings/queries.ts");
    const chatQueriesSource = readSource("../../src/lib/chat/queries.ts");
    const appLayoutSource = readSource("../../src/app/layouts/AppLayout.tsx");

    expect(providerStoreSource).not.toContain("ProviderKind");
    expect(providerStoreSource).not.toContain("localReasoningMode");
    expect(providerStoreSource).not.toContain("kind:");
    expect(settingsQueriesSource).not.toContain("legacyLocalProvidersQuery$");
    expect(settingsQueriesSource).not.toContain('kind: "openai-compatible"');
    expect(chatQueriesSource).not.toContain('kind: "openai-compatible"');
    expect(appLayoutSource).not.toContain("legacyLocalProvidersQuery$");
    expect(appLayoutSource).not.toContain("providerEvents.providerDeleted");
  });
});
