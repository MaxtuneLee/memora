import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { JSDOM } from "jsdom";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";

import { useWidgetSourceCode } from "@/hooks/widgets/useWidgetSourceCode";
import { activeFilesQuery$ } from "@/lib/library/queries";
import type { file as LiveStoreFile } from "@/livestore/file";
import type { ReactiveWidgetStore } from "@/lib/widgets/widgetStore";

const testState = vi.hoisted(() => {
  const textByPath = new Map<string, string>();
  const file = vi.fn((path: string) => ({
    path,
    text: vi.fn(async () => {
      const text = textByPath.get(path);
      if (text === undefined) {
        throw new Error(`Missing file content for ${path}`);
      }
      return text;
    }),
  }));

  return { file, textByPath };
});

vi.mock("@memora/fs", () => ({
  file: testState.file,
}));

const setupDom = () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/",
  });

  vi.stubGlobal("window", dom.window);
  vi.stubGlobal("document", dom.window.document);
  vi.stubGlobal("navigator", dom.window.navigator);
};

beforeEach(() => {
  // This file has no environmentMatchGlobs entry (unlike test/editor/**), so it runs under the
  // default "node" test environment with no ambient `document` — set up jsdom before cleanup()
  // touches it.
  setupDom();
  cleanup();
  testState.textByPath.clear();
  testState.file.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const buildFile = (overrides: Partial<LiveStoreFile> & { id: string }): LiveStoreFile =>
  ({
    name: "widget.html",
    type: "document",
    mimeType: "text/html",
    sizeBytes: 10,
    storageType: "opfs",
    storagePath: `/files/${overrides.id}/${overrides.id}`,
    parentId: "folder-1",
    positionX: null,
    positionY: null,
    transcriptPath: null,
    indexedAt: null,
    indexStatus: "pending",
    indexSummary: null,
    collectionId: null,
    durationSec: null,
    thumbnailPath: null,
    createdAt: new Date(1_000),
    updatedAt: new Date(1_000),
    deletedAt: null,
    purgedAt: null,
    ...overrides,
  }) as LiveStoreFile;

const makeStore = (filesRef: { current: readonly LiveStoreFile[] }): ReactiveWidgetStore => {
  const resolve = (query: unknown) => (query === activeFilesQuery$ ? filesRef.current : []);
  return {
    useQuery: vi.fn(resolve),
    query: vi.fn(resolve),
  } as unknown as ReactiveWidgetStore;
};

test("reads the source file's content from OPFS once it resolves", async () => {
  const sourceFile = buildFile({ id: "source-1" });
  testState.textByPath.set(sourceFile.storagePath, "<div>v1</div>");
  const filesRef = { current: [sourceFile] };
  const store = makeStore(filesRef);

  const { result } = renderHook(() => useWidgetSourceCode(store, "source-1"));

  expect(result.current.status).toBe("loading");

  await waitFor(() => expect(result.current.status).toBe("ready"));
  expect(result.current.code).toBe("<div>v1</div>");
});

test("re-reads the file when its updatedAt changes", async () => {
  const sourceFile = buildFile({ id: "source-1", updatedAt: new Date(1_000) });
  testState.textByPath.set(sourceFile.storagePath, "<div>v1</div>");
  const filesRef = { current: [sourceFile] };
  const store = makeStore(filesRef);

  const { result, rerender } = renderHook(() => useWidgetSourceCode(store, "source-1"));
  await waitFor(() => expect(result.current.code).toBe("<div>v1</div>"));

  testState.textByPath.set(sourceFile.storagePath, "<div>v2</div>");
  filesRef.current = [{ ...sourceFile, updatedAt: new Date(2_000) }];
  rerender();

  await waitFor(() => expect(result.current.code).toBe("<div>v2</div>"));
});

test("reports missing when the definition has no source file yet", () => {
  const filesRef = { current: [] as readonly LiveStoreFile[] };
  const store = makeStore(filesRef);

  const { result } = renderHook(() => useWidgetSourceCode(store, null));

  expect(result.current).toEqual({ status: "missing", code: null });
});

test("reports an error state when the OPFS read fails", async () => {
  const sourceFile = buildFile({ id: "source-1" });
  // No content registered for this path, so the mocked read rejects.
  const filesRef = { current: [sourceFile] };
  const store = makeStore(filesRef);

  const { result } = renderHook(() => useWidgetSourceCode(store, "source-1"));

  await waitFor(() => expect(result.current.status).toBe("error"));
  expect(result.current.code).toBeNull();
});
