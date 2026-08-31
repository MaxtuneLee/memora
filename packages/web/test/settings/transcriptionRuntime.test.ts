import { describe, expect, test, vi } from "vite-plus/test";

import {
  createTranscriptionRuntime,
  readTranscriptionRuntime,
} from "@/lib/models/transcriptionRuntime";
import { settingsDocumentQuery$ } from "@/lib/settings/queries";
import { normalizeAiModelRouting } from "@/lib/models/modelRouting";
import { createScribeTranscriptionProvider } from "@/lib/transcript/providers/realtime";

describe("transcription feature routing", () => {
  test("reads cloud selection from the settings document at execution time", () => {
    const query = vi.fn().mockReturnValue({
      modelRouting: {
        transcription: { source: "cloud", providerId: "asr", modelId: "scribe_v2_realtime" },
      },
    });
    expect(() => readTranscriptionRuntime({ query })).toThrow(
      "authenticated connection is not configured",
    );
    expect(query).toHaveBeenCalledExactlyOnceWith(settingsDocumentQuery$);
    query.mockReturnValue({ theme: "dark" });
    expect(readTranscriptionRuntime({ query }).provider.adapterId).toBe("whisper-local");
  });
  test("an unset feature uses local Whisper without resolving cloud credentials", () => {
    const resolveCloud = vi.fn();
    const runtime = createTranscriptionRuntime(normalizeAiModelRouting({}), resolveCloud);
    expect(runtime).toMatchObject({
      provider: { adapterId: "whisper-local" },
      modelId: "whisper-base-timestamped",
      timestamps: "word",
    });
    expect(resolveCloud).not.toHaveBeenCalled();
  });
  test("an explicitly selected cloud provider never falls back to Whisper", () => {
    const routing = normalizeAiModelRouting({
      transcription: { source: "cloud", providerId: "asr-account", modelId: "scribe_v2_realtime" },
    });
    expect(() => createTranscriptionRuntime(routing)).toThrow(
      "authenticated connection is not configured",
    );
  });
  test("invalid local routing does not silently fall back to the default model", () => {
    const resolveCloud = vi.fn();
    expect(() =>
      createTranscriptionRuntime(
        normalizeAiModelRouting({ transcription: { source: "local", modelId: "not-whisper" } }),
        resolveCloud,
      ),
    ).toThrow("Choose a provider and model");
    expect(resolveCloud).not.toHaveBeenCalled();
  });
  test.each([["scribe_v2_realtime", "word", createScribeTranscriptionProvider]] as const)(
    "uses the selected account and %s capabilities without opening a connection",
    (modelId, timestamps, createProvider) => {
      const connect = vi.fn();
      const provider = createProvider({ connect });
      const resolveCloud = vi.fn(() => provider);
      const runtime = createTranscriptionRuntime(
        normalizeAiModelRouting({
          transcription: { source: "cloud", providerId: "selected-account", modelId },
        }),
        resolveCloud,
      );
      expect(resolveCloud).toHaveBeenCalledExactlyOnceWith({
        source: "cloud",
        providerId: "selected-account",
        modelId,
      });
      expect(runtime).toEqual({ provider, modelId, timestamps });
      expect(connect).not.toHaveBeenCalled();
    },
  );
  test("a removed or unavailable account fails without trying another account", () => {
    const resolveCloud = vi.fn(() => {
      throw new Error("Account unavailable");
    });
    expect(() =>
      createTranscriptionRuntime(
        normalizeAiModelRouting({
          transcription: { source: "cloud", providerId: "missing", modelId: "scribe_v2_realtime" },
        }),
        resolveCloud,
      ),
    ).toThrow("Account unavailable");
    expect(resolveCloud).toHaveBeenCalledOnce();
  });
});
