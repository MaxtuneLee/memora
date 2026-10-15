import JSZip from "jszip";
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";

import { exportStorageArchive, importStorageArchive } from "@/lib/settings/storageExport";
import { defaultSettings } from "@/livestore/setting";

const opfs = vi.hoisted(() => new Map<string, Blob>());

vi.mock("@memora/fs", () => ({
  file: (path: string) => ({
    getOriginFile: async () => {
      const blob = opfs.get(path);
      if (!blob) throw new DOMException("missing", "NotFoundError");
      return blob;
    },
  }),
  ls: async (root: string, options?: { recursive?: boolean }) => {
    const paths = [...opfs.keys()].filter((path) => path.startsWith(`${root}/`));
    if (options?.recursive) return paths;
    return [
      ...new Set(paths.map((path) => `${root}/${path.slice(root.length + 1).split("/")[0]}`)),
    ];
  },
  rm: vi.fn(async (target: string) => {
    for (const path of opfs.keys()) {
      if (path === target || path.startsWith(`${target}/`)) opfs.delete(path);
    }
  }),
  writeStream: async (path: string, stream: ReadableStream<Uint8Array>) => {
    opfs.set(path, await new Response(stream).blob());
  },
}));

const now = new Date("2026-10-01T00:00:00Z");
const emptySnapshot = {
  settings: defaultSettings,
  providers: [],
  files: [],
  folders: [],
  collections: [],
  widgetDefinitions: [],
  widgetInstances: [],
};

const captureDownload = (): (() => Blob) => {
  let archive: Blob | undefined;
  vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
    archive = blob as Blob;
    return "blob:test";
  });
  vi.stubGlobal("document", {
    createElement: () => ({ click: vi.fn(), remove: vi.fn() }),
    body: { append: vi.fn() },
  });
  return () => {
    if (!archive) throw new Error("No exported archive");
    return archive;
  };
};

const toFile = async (blob: Blob): Promise<File> =>
  new File([await blob.arrayBuffer()], "backup.zip");

const eventNames = (commit: ReturnType<typeof vi.fn>): string[] =>
  commit.mock.calls.map((call) => (call[0] as { name: string }).name);

beforeEach(() => opfs.clear());

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("storage archive", () => {
  test("round-trips settings, widgets, thumbnails and user files", async () => {
    opfs.set("/files/f1/会议记录.md", new Blob(["# 你好"]));
    opfs.set("/chat/traces/t1.json", new Blob(["{}"]));
    opfs.set("/chat/skills/s.md", new Blob(["excluded"]));
    const getArchive = captureDownload();

    await exportStorageArchive({
      ...emptySnapshot,
      settings: {
        ...defaultSettings,
        customInstructions: "Answer briefly.",
        homeGridSeeded: true,
        permissionGrants: [{ id: "g1", access: "read", target: { kind: "library" }, createdAt: 1 }],
      },
      files: [
        {
          id: "f1",
          name: "会议记录.md",
          type: "document",
          mimeType: "text/markdown",
          sizeBytes: 8,
          storageType: "opfs",
          storagePath: "/files/f1/会议记录.md",
          parentId: null,
          positionX: null,
          positionY: null,
          transcriptPath: null,
          indexedAt: null,
          indexStatus: "pending",
          indexSummary: null,
          collectionId: null,
          durationSec: null,
          thumbnailPath: "/files/f1/thumb.webp",
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
          purgedAt: null,
        },
      ],
      widgetDefinitions: [
        {
          id: "w1",
          kind: "generated",
          builtinKey: null,
          name: "Weather",
          widgetCode: "<div></div>",
          dataSourceName: null,
          dataSourceParams: "{}",
          folderId: null,
          sourceFileId: null,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        },
      ],
      widgetInstances: [
        {
          id: "i1",
          definitionId: "w1",
          sortOrder: 0,
          params: "{}",
          columnSpan: 2,
          rowSpan: 1,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        },
      ],
    });

    const archive = getArchive();
    const zip = await JSZip.loadAsync(await archive.arrayBuffer());
    expect(zip.file("memora-export/opfs/files/f1/会议记录.md")).not.toBeNull();
    expect(zip.file("memora-export/opfs/chat/skills/s.md")).toBeNull();

    opfs.clear();
    opfs.set("/files/stale.txt", new Blob(["old"]));
    opfs.set("/chat/traces/stale.json", new Blob(["old"]));
    const commit = vi.fn();
    const result = await importStorageArchive(await toFile(archive), {
      current: emptySnapshot,
      store: { commit },
    });

    expect(result.importedFiles).toBe(2);
    expect([...opfs.keys()].sort()).toEqual(["/chat/traces/t1.json", "/files/f1/会议记录.md"]);
    expect(await opfs.get("/files/f1/会议记录.md")?.text()).toBe("# 你好");

    const settings = commit.mock.calls[0]?.[0].args.value;
    expect(settings).toMatchObject({
      customInstructions: "Answer briefly.",
      homeGridSeeded: true,
      permissionGrants: [{ id: "g1" }],
    });
    const thumbnailUpdate = commit.mock.calls.find(
      (call) => call[0].name === "v1.FileUpdated" && call[0].args.id === "f1",
    );
    expect(thumbnailUpdate?.[0].args.thumbnailPath).toBe("/files/f1/thumb.webp");
    expect(eventNames(commit)).toEqual(
      expect.arrayContaining([
        "v1.FileCreated",
        "v1.WidgetDefinitionCreated",
        "v1.WidgetInstanceCreated",
      ]),
    );
  });

  test("imports archives that were re-compressed with deflate", async () => {
    const zip = new JSZip();
    zip.file("memora-export/manifest.json", JSON.stringify({ formatVersion: 1 }));
    zip.file("memora-export/livestore/settings.json", "{}");
    for (const name of ["providers", "files", "folders", "collections"]) {
      zip.file(`memora-export/livestore/${name}.json`, "[]");
    }
    zip.file("memora-export/opfs/files/a.txt", "a".repeat(5000));
    const bytes = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });

    await importStorageArchive(new File([Uint8Array.from(bytes)], "deflated.zip"), {
      current: emptySnapshot,
      store: { commit: vi.fn() },
    });

    expect(await opfs.get("/files/a.txt")?.text()).toBe("a".repeat(5000));
  });

  test.each([
    {
      name: "a path outside user data",
      path: "memora-export/opfs/livestore-main/db",
      damage: false,
    },
    { name: "a damaged file", path: "memora-export/opfs/files/a.txt", damage: true },
  ])("rejects $name before deleting anything", async ({ path, damage }) => {
    opfs.set("/files/keep.txt", new Blob(["keep"]));
    const zip = new JSZip();
    zip.file("memora-export/manifest.json", JSON.stringify({ formatVersion: 2 }));
    zip.file("memora-export/livestore/settings.json", "{}");
    for (const name of [
      "providers",
      "files",
      "folders",
      "collections",
      "widget-definitions",
      "widget-instances",
    ]) {
      zip.file(`memora-export/livestore/${name}.json`, "[]");
    }
    zip.file(path, "payload-payload");
    const bytes = await zip.generateAsync({ type: "uint8array", compression: "STORE" });
    if (damage) {
      const index = Buffer.from(bytes).indexOf("payload-payload");
      bytes[index] = "X".charCodeAt(0);
    }

    await expect(
      importStorageArchive(new File([Uint8Array.from(bytes)], "bad.zip"), {
        current: emptySnapshot,
        store: { commit: vi.fn() },
      }),
    ).rejects.toThrow(damage ? /damaged/ : /outside/);
    expect(await opfs.get("/files/keep.txt")?.text()).toBe("keep");
  });

  test("asks for an update when the archive is from a newer format", async () => {
    const zip = new JSZip();
    zip.file("memora-export/manifest.json", JSON.stringify({ formatVersion: 99 }));
    const bytes = await zip.generateAsync({ type: "uint8array" });
    await expect(
      importStorageArchive(new File([Uint8Array.from(bytes)], "new.zip"), {
        current: emptySnapshot,
        store: { commit: vi.fn() },
      }),
    ).rejects.toThrow(/newer version/);
  });
});
