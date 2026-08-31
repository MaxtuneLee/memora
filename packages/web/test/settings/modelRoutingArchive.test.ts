import JSZip from "jszip";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";

import { exportStorageArchive, importStorageArchive } from "@/lib/settings/storageExport";
import { defaultSettings } from "@/livestore/setting";

vi.mock("@memora/fs", () => ({
  file: vi.fn(),
  ls: vi.fn(async () => []),
  rm: vi.fn(async () => {}),
  write: vi.fn(async () => {}),
}));

const current = {
  settings: defaultSettings,
  providers: [],
  files: [],
  folders: [],
  collections: [],
};
const cloud = { source: "cloud", providerId: "scribe", modelId: "scribe_v2_realtime" } as const;
const root = "memora-export/";
const makeArchive = async (settings: unknown, legacy?: unknown): Promise<File> => {
  const zip = new JSZip();
  zip.file(root + "manifest.json", JSON.stringify({ formatVersion: 1 }));
  zip.file(root + "livestore/settings.json", JSON.stringify(settings));
  for (const name of ["providers", "files", "folders", "collections"]) {
    zip.file(root + "livestore/" + name + ".json", "[]");
  }
  if (legacy !== undefined) zip.file(root + "livestore/model-routing.json", JSON.stringify(legacy));
  const bytes = await zip.generateAsync({ type: "uint8array", compression: "STORE" });
  return new File([Uint8Array.from(bytes).buffer], "settings.zip");
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("model routing archive compatibility", () => {
  test("restores actual local token totals without estimating missing historical usage", async () => {
    const commit = vi.fn();
    await importStorageArchive(
      await makeArchive({
        localModelTokenUsage: { inputTokens: 120, outputTokens: 30, totalCommands: 7 },
      }),
      { current, store: { commit } },
    );
    expect(commit.mock.calls[0]?.[0].args.value.localModelTokenUsage).toEqual({
      inputTokens: 120,
      outputTokens: 30,
      allInputTokens: 120,
      allOutputTokens: 30,
      totalCommands: 7,
    });
    commit.mockClear();
    await importStorageArchive(await makeArchive({}), { current, store: { commit } });
    expect(commit.mock.calls[0]?.[0].args.value.localModelTokenUsage).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      allInputTokens: 0,
      allOutputTokens: 0,
      totalCommands: 0,
    });
  });
  test.each([
    { settings: { theme: "dark", modelRouting: { transcription: cloud } }, legacy: undefined },
    { settings: { theme: "dark" }, legacy: { transcription: cloud } },
  ])("imports nested and legacy routes into settings", async ({ settings, legacy }) => {
    const commit = vi.fn();
    await importStorageArchive(await makeArchive(settings, legacy), { current, store: { commit } });
    expect(commit).toHaveBeenCalledOnce();
    expect(commit.mock.calls[0]?.[0]).toMatchObject({
      name: "settingsSet",
      args: { value: { theme: "dark", modelRouting: { transcription: cloud } } },
    });
  });

  test("nested routes take precedence and missing assistant routing uses legacy chat settings", async () => {
    const commit = vi.fn();
    await importStorageArchive(
      await makeArchive(
        {
          selectedProviderId: "chat-provider",
          selectedModel: "chat-model",
          modelRouting: { transcription: cloud },
        },
        { transcription: { source: "local", modelId: "whisper-base-timestamped" } },
      ),
      { current, store: { commit } },
    );
    expect(commit.mock.calls[0]?.[0].args.value.modelRouting).toMatchObject({
      transcription: cloud,
      assistant: { source: "cloud", providerId: "chat-provider", modelId: "chat-model" },
    });
  });

  test("archives without routing preserve the original chat selection", async () => {
    const commit = vi.fn();
    await importStorageArchive(await makeArchive({ selectedProviderId: "p", selectedModel: "m" }), {
      current,
      store: { commit },
    });
    expect(commit.mock.calls[0]?.[0].args.value.modelRouting.assistant).toEqual({
      source: "cloud",
      providerId: "p",
      modelId: "m",
    });
  });

  test("exports routes inside settings.json without a separate document", async () => {
    let archive: Blob | undefined;
    vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
      archive = blob as Blob;
      return "blob:test";
    });
    vi.stubGlobal("document", {
      createElement: () => ({ click: vi.fn(), remove: vi.fn() }),
      body: { append: vi.fn() },
    });
    await exportStorageArchive({
      ...current,
      settings: { ...defaultSettings, modelRouting: { transcription: cloud } },
    });
    if (!archive) throw new Error("No exported archive");
    const zip = await JSZip.loadAsync(await archive.arrayBuffer());
    expect(zip.file(root + "livestore/model-routing.json")).toBeNull();
    const text = await zip.file(root + "livestore/settings.json")?.async("string");
    expect(JSON.parse(text ?? "{}").modelRouting.transcription).toEqual(cloud);
  });
});
