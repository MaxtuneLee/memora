// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vite-plus/test";

import { useModelRouting } from "@/hooks/settings/useModelRouting";
import { settingsDocumentQuery$ } from "@/lib/settings/queries";
import type { setting } from "@/livestore/setting";

const state = vi.hoisted(() => ({
  settings: {} as Partial<setting>,
  query: vi.fn(),
  useQuery: vi.fn(),
  commit: vi.fn(),
}));
vi.mock("@/livestore/store", () => ({ useAppStore: () => state }));

beforeEach(() => {
  vi.clearAllMocks();
  state.settings = { theme: "dark", selectedProviderId: "old", selectedModel: "chat" };
  state.query.mockImplementation(() => state.settings);
  state.useQuery.mockImplementation(() => state.settings);
  state.commit.mockImplementation((event: { args: { value: Partial<setting> } }) => {
    state.settings = { ...state.settings, ...event.args.value };
  });
});

describe("model routing settings hook", () => {
  test("reads existing chat selection from the single settings subscription", () => {
    const { result } = renderHook(() => useModelRouting());
    expect(state.useQuery).toHaveBeenCalledExactlyOnceWith(settingsDocumentQuery$);
    expect(result.current.routing.assistant).toEqual({
      source: "cloud",
      providerId: "old",
      modelId: "chat",
    });
  });

  test("consecutive updates preserve other feature choices and unrelated settings", () => {
    const { result } = renderHook(() => useModelRouting());
    act(() => {
      result.current.setFeatureModel("transcription", {
        source: "cloud",
        providerId: "asr",
        modelId: "scribe_v2_realtime",
      });
      result.current.setFeatureModel("sessionTitle", {
        source: "local",
        modelId: "gemma-4-e2b-it-onnx",
      });
    });
    expect(state.settings).toMatchObject({
      theme: "dark",
      modelRouting: {
        transcription: { source: "cloud", providerId: "asr", modelId: "scribe_v2_realtime" },
        sessionTitle: { source: "local", modelId: "gemma-4-e2b-it-onnx" },
      },
    });
    expect(state.commit.mock.calls.every(([event]) => event.name === "settingsSet")).toBe(true);
  });

  test("chat selection and its legacy fields are updated in one settings event", () => {
    const { result } = renderHook(() => useModelRouting());
    act(() =>
      result.current.setFeatureModel("assistant", {
        source: "cloud",
        providerId: "new",
        modelId: "new-chat",
      }),
    );
    expect(state.commit).toHaveBeenCalledOnce();
    expect(state.settings).toMatchObject({
      selectedProviderId: "new",
      selectedModel: "new-chat",
      modelRouting: { assistant: { source: "cloud", providerId: "new", modelId: "new-chat" } },
    });
    expect(() =>
      result.current.setFeatureModel("assistant", {
        source: "local",
        modelId: "gemma-4-e2b-it-onnx",
      }),
    ).toThrow();
    expect(state.commit).toHaveBeenCalledOnce();
  });
});
