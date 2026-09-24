import { builtInLocalModelManifests } from "@memora/local-model-runtime";
import { describe, expect, test } from "vite-plus/test";

import { parseProviderModel } from "../../src/lib/settings/dialogHelpers";
import {
  applyLocalModelProgressEvent,
  getLocalModelDownloadedBytes,
  getLocalModelDownloadProgress,
  getLocalModelDownloadTotalBytes,
  LOCAL_MODEL_PROGRESS_PUBLISH_INTERVAL_MS,
  shouldPublishLocalModelProgress,
} from "../../src/lib/local-model/downloadState";
import type { LocalModelDownloadState } from "../../src/lib/local-model/downloadState";

describe("local model settings", () => {
  test("offers only chat-capable local models in settings", () => {
    const chatModels = builtInLocalModelManifests.filter((manifest) => manifest.task === "chat");

    expect(chatModels.map((manifest) => manifest.id)).toEqual([
      "qwen3.5-0.8b-onnx-opt",
      "gemma-4-e2b-it-onnx",
    ]);
  });

  test("provides an estimated download size for every local model", () => {
    for (const manifest of builtInLocalModelManifests) {
      expect(manifest.downloadSizeGB).toBeGreaterThan(0);
    }

    expect(
      builtInLocalModelManifests.find((manifest) => manifest.id === "qwen3.5-0.8b-onnx-opt")
        ?.downloadSizeGB,
    ).toBe(0.812);
  });

  test("keeps local model context windows in model metadata", () => {
    expect(
      builtInLocalModelManifests.find((manifest) => manifest.id === "qwen3.5-0.8b-onnx-opt")
        ?.limits,
    ).toEqual({
      contextWindow: 262144,
      maxOutputTokens: 3072,
    });
    expect(
      builtInLocalModelManifests.find((manifest) => manifest.id === "gemma-4-e2b-it-onnx")?.limits,
    ).toEqual({
      contextWindow: 131072,
      maxOutputTokens: 512,
    });
    expect(
      parseProviderModel({
        id: "local",
        contextWindow: 3,
      }),
    ).toMatchObject({
      name: "local",
      reasoning: false,
      input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 3,
      maxTokens: 4096,
    });
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

  test("limits progress publications while always publishing file completion", () => {
    expect(LOCAL_MODEL_PROGRESS_PUBLISH_INTERVAL_MS).toBe(100);
    expect(shouldPublishLocalModelProgress(1_000, 1_099, 42)).toBe(false);
    expect(shouldPublishLocalModelProgress(1_000, 1_100, 42)).toBe(true);
    expect(shouldPublishLocalModelProgress(1_000, 1_001, 100)).toBe(true);
  });
});
