import { cleanup, renderHook, act, waitFor } from "@testing-library/react";
import { JSDOM } from "jsdom";
import { beforeEach, afterEach, expect, test, vi } from "vite-plus/test";

import { useDocumentEditorFile } from "@/hooks/editor/useDocumentEditorFile";
import type { FileMeta } from "@/types/library";

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}

const createDeferred = <T,>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
};

const persistenceState = vi.hoisted(() => {
  return {
    readTextDocumentBytes: vi.fn(),
    saveTextDocument: vi.fn(),
    upgradeTextFileToMarkdown: vi.fn(),
  };
});

vi.mock("@/lib/editor/documentPersistence", () => ({
  readTextDocumentBytes: persistenceState.readTextDocumentBytes,
  saveTextDocument: persistenceState.saveTextDocument,
  upgradeTextFileToMarkdown: persistenceState.upgradeTextFileToMarkdown,
}));

const createFile = (overrides: Partial<FileMeta> = {}): FileMeta => {
  const id = overrides.id ?? "document-1";

  return {
    id,
    name: overrides.name ?? "Draft.md",
    type: overrides.type ?? "document",
    mimeType: overrides.mimeType ?? "text/markdown",
    sizeBytes: overrides.sizeBytes ?? 32,
    storageType: overrides.storageType ?? "opfs",
    storagePath: overrides.storagePath ?? `/files/${id}/${id}.md`,
    metaPath: overrides.metaPath ?? `/files/${id}/${id}.meta.json`,
    parentId: overrides.parentId ?? null,
    positionX: overrides.positionX ?? null,
    positionY: overrides.positionY ?? null,
    createdAt: overrides.createdAt ?? 1_746_000_000_000,
    updatedAt: overrides.updatedAt ?? 1_746_000_000_000,
    durationSec: overrides.durationSec ?? null,
    transcriptPath: overrides.transcriptPath ?? null,
    transcriptPreview: overrides.transcriptPreview ?? null,
  };
};

const setupDom = () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/editor/file/document-1",
  });

  vi.stubGlobal("window", dom.window);
  vi.stubGlobal("document", dom.window.document);
  vi.stubGlobal("navigator", dom.window.navigator);
  vi.stubGlobal("HTMLElement", dom.window.HTMLElement);
  vi.stubGlobal("KeyboardEvent", dom.window.KeyboardEvent);
  vi.stubGlobal("MutationObserver", dom.window.MutationObserver);
  vi.stubGlobal("Event", dom.window.Event);
  vi.stubGlobal("getComputedStyle", dom.window.getComputedStyle.bind(dom.window));
};

beforeEach(() => {
  cleanup();
  setupDom();
  persistenceState.readTextDocumentBytes.mockReset();
  persistenceState.saveTextDocument.mockReset();
  persistenceState.upgradeTextFileToMarkdown.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

test("an older save completion never replaces a newer canonical revision", async () => {
  const file = createFile();
  const firstSave = createDeferred<{
    file: FileMeta;
    text: string;
    textBytes: Uint8Array;
    updatedEvent: {
      id: string;
      name: string;
      mimeType: string;
      sizeBytes: number;
      storageType: FileMeta["storageType"];
      storagePath: string;
      updatedAt: Date;
    };
  }>();
  const secondSave = createDeferred<Awaited<typeof firstSave.promise>>();

  persistenceState.readTextDocumentBytes.mockResolvedValue(new TextEncoder().encode("Initial"));
  persistenceState.saveTextDocument
    .mockImplementationOnce(() => firstSave.promise)
    .mockImplementationOnce(() => secondSave.promise);

  const { result, unmount } = renderHook(() =>
    useDocumentEditorFile({
      file,
      files: [file],
      folders: [],
      attachmentSettings: {
        attachmentPlacementMode: "root",
        attachmentFolderId: "",
        attachmentSubfolderName: "images",
      },
      autoSaveDelayMs: 5_000,
    }),
  );

  await act(async () => {
    await Promise.resolve();
  });
  const initialSnapshot = result.current.getCanonicalSnapshot();

  act(() => {
    result.current.updateText("Revision 1");
  });
  const savePromise = result.current.saveNow();

  act(() => {
    result.current.updateText("Revision 2");
  });

  await act(async () => {
    firstSave.resolve({
      file,
      text: "Revision 1",
      textBytes: new TextEncoder().encode("Revision 1"),
      updatedEvent: {
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        sizeBytes: 10,
        storageType: file.storageType,
        storagePath: file.storagePath,
        updatedAt: new Date("2026-07-15T01:00:00.000Z"),
      },
    });
    await savePromise;
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(result.current.text).toBe("Revision 2");
  expect(result.current.saveState).toBe("saving");
  expect(result.current.file).toMatchObject({
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    storagePath: file.storagePath,
  });
  expect(result.current.getCanonicalSnapshot()).toEqual({
    fileId: file.id,
    revision: 2,
    sessionId: initialSnapshot.sessionId,
    text: "Revision 2",
  });

  const flushPromise = result.current.flushPendingSave();
  await act(async () => {
    secondSave.resolve({
      file,
      text: "Revision 2",
      textBytes: new TextEncoder().encode("Revision 2"),
      updatedEvent: {
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        sizeBytes: 10,
        storageType: file.storageType,
        storagePath: file.storagePath,
        updatedAt: new Date("2026-07-15T01:01:00.000Z"),
      },
    });
    await flushPromise;
  });
  expect(result.current.saveState).toBe("idle");

  await act(async () => {
    unmount();
    await Promise.resolve();
    await Promise.resolve();
  });
});

test("a queued save intent keeps its original file target after rerender", async () => {
  const fileA = createFile({
    id: "document-a",
    storagePath: "/files/document-a/document-a.md",
  });
  const fileB = createFile({
    id: "document-b",
    storagePath: "/files/document-b/document-b.md",
  });
  const firstSave = createDeferred<never>();

  persistenceState.readTextDocumentBytes.mockImplementation(async (target: FileMeta) =>
    new TextEncoder().encode(target.id === fileA.id ? "A initial" : "B initial"),
  );
  persistenceState.saveTextDocument
    .mockImplementationOnce(() => firstSave.promise)
    .mockImplementation(
      async ({ file: savedFile, text: savedText }: { file: FileMeta; text: string }) => ({
        file: savedFile,
        text: savedText,
        textBytes: new TextEncoder().encode(savedText),
        updatedEvent: {
          id: savedFile.id,
          name: savedFile.name,
          mimeType: savedFile.mimeType,
          sizeBytes: savedText.length,
          storageType: savedFile.storageType,
          storagePath: savedFile.storagePath,
          updatedAt: new Date("2026-07-15T02:00:00.000Z"),
        },
      }),
    );

  const { result, rerender, unmount } = renderHook(
    ({ currentFile }: { currentFile: FileMeta }) =>
      useDocumentEditorFile({
        file: currentFile,
        files: [fileA, fileB],
        folders: [],
        attachmentSettings: {
          attachmentPlacementMode: "root",
          attachmentFolderId: "",
          attachmentSubfolderName: "images",
        },
        autoSaveDelayMs: 5_000,
      }),
    { initialProps: { currentFile: fileA } },
  );

  await act(async () => {
    await Promise.resolve();
  });

  act(() => {
    result.current.updateText("A revision 1");
  });
  const firstPromise = result.current.saveNow().catch(() => undefined);

  act(() => {
    result.current.updateText("A revision 2");
  });
  const secondPromise = result.current.saveNow();

  rerender({ currentFile: fileB });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(result.current.text).toBe("B initial");

  await act(async () => {
    firstSave.reject(new Error("first write failed"));
    await firstPromise;
    await secondPromise;
  });

  expect(persistenceState.saveTextDocument).toHaveBeenNthCalledWith(2, {
    file: expect.objectContaining({ id: fileA.id, storagePath: fileA.storagePath }),
    text: "A revision 2",
  });

  await act(async () => {
    unmount();
    await Promise.resolve();
    await Promise.resolve();
  });
});

test("a new file session saves independently while the previous session has pending work", async () => {
  const fileA = createFile({ id: "session-a", storagePath: "/files/session-a/session-a.md" });
  const fileB = createFile({ id: "session-b", storagePath: "/files/session-b/session-b.md" });
  const firstAWrite = createDeferred<{
    file: FileMeta;
    text: string;
    textBytes: Uint8Array;
    updatedEvent: {
      id: string;
      name: string;
      mimeType: string;
      sizeBytes: number;
      storageType: FileMeta["storageType"];
      storagePath: string;
      updatedAt: Date;
    };
  }>();
  const secondAWrite = createDeferred<{
    file: FileMeta;
    text: string;
    textBytes: Uint8Array;
    updatedEvent: {
      id: string;
      name: string;
      mimeType: string;
      sizeBytes: number;
      storageType: FileMeta["storageType"];
      storagePath: string;
      updatedAt: Date;
    };
  }>();
  const bWrite = createDeferred<{
    file: FileMeta;
    text: string;
    textBytes: Uint8Array;
    updatedEvent: {
      id: string;
      name: string;
      mimeType: string;
      sizeBytes: number;
      storageType: FileMeta["storageType"];
      storagePath: string;
      updatedAt: Date;
    };
  }>();
  let aWriteCount = 0;

  const buildResult = (savedFile: FileMeta, savedText: string) => ({
    file: savedFile,
    text: savedText,
    textBytes: new TextEncoder().encode(savedText),
    updatedEvent: {
      id: savedFile.id,
      name: savedFile.name,
      mimeType: savedFile.mimeType,
      sizeBytes: savedText.length,
      storageType: savedFile.storageType,
      storagePath: savedFile.storagePath,
      updatedAt: new Date("2026-07-15T02:30:00.000Z"),
    },
  });

  persistenceState.readTextDocumentBytes.mockImplementation(async (target: FileMeta) =>
    new TextEncoder().encode(target.id === fileA.id ? "A initial" : "B initial"),
  );
  persistenceState.saveTextDocument.mockImplementation(
    ({ file: savedFile }: { file: FileMeta }) => {
      if (savedFile.id === fileB.id) {
        return bWrite.promise;
      }

      aWriteCount += 1;
      return aWriteCount === 1 ? firstAWrite.promise : secondAWrite.promise;
    },
  );

  const { result, rerender } = renderHook(
    ({ currentFile }: { currentFile: FileMeta }) =>
      useDocumentEditorFile({
        file: currentFile,
        files: [fileA, fileB],
        folders: [],
        attachmentSettings: {
          attachmentPlacementMode: "root",
          attachmentFolderId: "",
          attachmentSubfolderName: "images",
        },
        autoSaveDelayMs: 5_000,
      }),
    { initialProps: { currentFile: fileA } },
  );

  await act(async () => {
    await Promise.resolve();
  });
  act(() => {
    result.current.updateText("A revision 1");
  });
  const firstAPromise = result.current.saveNow();
  act(() => {
    result.current.updateText("A revision 2");
  });
  const secondAPromise = result.current.saveNow();

  rerender({ currentFile: fileB });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  act(() => {
    result.current.updateText("B revision 1");
  });
  const bPromise = result.current.saveNow();

  await act(async () => {
    await Promise.resolve();
  });

  expect(persistenceState.saveTextDocument).toHaveBeenCalledTimes(2);
  expect(persistenceState.saveTextDocument).toHaveBeenCalledWith({
    file: expect.objectContaining({ id: fileB.id }),
    text: "B revision 1",
  });

  await act(async () => {
    bWrite.resolve(buildResult(fileB, "B revision 1"));
    await bPromise;
    firstAWrite.resolve(buildResult(fileA, "A revision 1"));
    await firstAPromise;
    await Promise.resolve();
    secondAWrite.resolve(buildResult(fileA, "A revision 2"));
    await secondAPromise;
  });
});

test("reload sessions serialize actual writes that target the same storage path", async () => {
  const file = createFile({
    id: "same-path-reload",
    storagePath: "/files/same-path-reload/same-path-reload.md",
  });
  const firstWrite = createDeferred<{
    file: FileMeta;
    text: string;
    textBytes: Uint8Array;
    updatedEvent: {
      id: string;
      name: string;
      mimeType: string;
      sizeBytes: number;
      storageType: FileMeta["storageType"];
      storagePath: string;
      updatedAt: Date;
    };
  }>();
  const secondWrite = createDeferred<{
    file: FileMeta;
    text: string;
    textBytes: Uint8Array;
    updatedEvent: {
      id: string;
      name: string;
      mimeType: string;
      sizeBytes: number;
      storageType: FileMeta["storageType"];
      storagePath: string;
      updatedAt: Date;
    };
  }>();
  const buildResult = (savedText: string, minute: string) => ({
    file,
    text: savedText,
    textBytes: new TextEncoder().encode(savedText),
    updatedEvent: {
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      sizeBytes: savedText.length,
      storageType: file.storageType,
      storagePath: file.storagePath,
      updatedAt: new Date(`2026-07-15T02:${minute}:00.000Z`),
    },
  });

  persistenceState.readTextDocumentBytes.mockResolvedValue(new TextEncoder().encode("Initial"));
  persistenceState.saveTextDocument
    .mockImplementationOnce(() => firstWrite.promise)
    .mockImplementationOnce(() => secondWrite.promise);

  const { result } = renderHook(() =>
    useDocumentEditorFile({
      file,
      files: [file],
      folders: [],
      attachmentSettings: {
        attachmentPlacementMode: "root",
        attachmentFolderId: "",
        attachmentSubfolderName: "images",
      },
      autoSaveDelayMs: 5_000,
    }),
  );

  await act(async () => {
    await Promise.resolve();
  });
  act(() => {
    result.current.updateText("Session 1");
  });
  const firstPromise = result.current.saveNow();

  act(() => {
    result.current.reload();
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  act(() => {
    result.current.updateText("Session 2");
  });
  const secondPromise = result.current.saveNow();

  await act(async () => {
    await Promise.resolve();
  });
  expect(persistenceState.saveTextDocument).toHaveBeenCalledTimes(1);

  await act(async () => {
    firstWrite.resolve(buildResult("Session 1", "40"));
    await firstPromise;
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(persistenceState.saveTextDocument).toHaveBeenCalledTimes(2);
  expect(persistenceState.saveTextDocument).toHaveBeenLastCalledWith({
    file: expect.objectContaining({ id: file.id, storagePath: file.storagePath }),
    text: "Session 2",
  });

  await act(async () => {
    secondWrite.resolve(buildResult("Session 2", "41"));
    await secondPromise;
  });

  expect(result.current.text).toBe("Session 2");
  expect(result.current.saveState).toBe("idle");
});

test("reload waits for its reserved cleanup write before reading the same path", async () => {
  const file = createFile({
    id: "reload-read-order",
    storagePath: "/files/reload-read-order/reload-read-order.md",
  });
  const cleanupWrite = createDeferred<{
    file: FileMeta;
    text: string;
    textBytes: Uint8Array;
    updatedEvent: {
      id: string;
      name: string;
      mimeType: string;
      sizeBytes: number;
      storageType: FileMeta["storageType"];
      storagePath: string;
      updatedAt: Date;
    };
  }>();
  const reloadRead = createDeferred<Uint8Array>();
  const savedResult = {
    file,
    text: "Latest persisted text",
    textBytes: new TextEncoder().encode("Latest persisted text"),
    updatedEvent: {
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      sizeBytes: 21,
      storageType: file.storageType,
      storagePath: file.storagePath,
      updatedAt: new Date("2026-07-15T02:45:00.000Z"),
    },
  };

  persistenceState.readTextDocumentBytes
    .mockResolvedValueOnce(new TextEncoder().encode("Initial"))
    .mockImplementationOnce(() => reloadRead.promise);
  persistenceState.saveTextDocument.mockImplementationOnce(() => cleanupWrite.promise);

  const { result } = renderHook(() =>
    useDocumentEditorFile({
      file,
      files: [file],
      folders: [],
      attachmentSettings: {
        attachmentPlacementMode: "root",
        attachmentFolderId: "",
        attachmentSubfolderName: "images",
      },
      autoSaveDelayMs: 5_000,
    }),
  );

  await act(async () => {
    await Promise.resolve();
  });
  act(() => {
    result.current.updateText("Latest persisted text");
    result.current.reload();
  });

  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(persistenceState.saveTextDocument).toHaveBeenCalledTimes(1);
  expect(persistenceState.readTextDocumentBytes).toHaveBeenCalledTimes(1);

  await act(async () => {
    cleanupWrite.resolve(savedResult);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(persistenceState.readTextDocumentBytes).toHaveBeenCalledTimes(2);

  await act(async () => {
    reloadRead.resolve(new TextEncoder().encode("Latest persisted text"));
    await reloadRead.promise;
    await Promise.resolve();
  });

  expect(result.current.text).toBe("Latest persisted text");
  expect(result.current.isLoading).toBe(false);
});

test("same-path reservations preserve pending session order across hook instances", async () => {
  const file = createFile({
    id: "shared-path-order",
    storagePath: "/files/shared-path-order/shared-path-order.md",
  });
  const firstAWrite = createDeferred<{
    file: FileMeta;
    text: string;
    textBytes: Uint8Array;
    updatedEvent: {
      id: string;
      name: string;
      mimeType: string;
      sizeBytes: number;
      storageType: FileMeta["storageType"];
      storagePath: string;
      updatedAt: Date;
    };
  }>();
  const secondAWrite = createDeferred<{
    file: FileMeta;
    text: string;
    textBytes: Uint8Array;
    updatedEvent: {
      id: string;
      name: string;
      mimeType: string;
      sizeBytes: number;
      storageType: FileMeta["storageType"];
      storagePath: string;
      updatedAt: Date;
    };
  }>();
  const bWrite = createDeferred<{
    file: FileMeta;
    text: string;
    textBytes: Uint8Array;
    updatedEvent: {
      id: string;
      name: string;
      mimeType: string;
      sizeBytes: number;
      storageType: FileMeta["storageType"];
      storagePath: string;
      updatedAt: Date;
    };
  }>();
  const actualWriteOrder: string[] = [];
  const buildResult = (savedText: string, minute: string) => ({
    file,
    text: savedText,
    textBytes: new TextEncoder().encode(savedText),
    updatedEvent: {
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      sizeBytes: savedText.length,
      storageType: file.storageType,
      storagePath: file.storagePath,
      updatedAt: new Date(`2026-07-15T02:${minute}:00.000Z`),
    },
  });

  persistenceState.readTextDocumentBytes.mockResolvedValue(new TextEncoder().encode("Initial"));
  persistenceState.saveTextDocument.mockImplementation(({ text: savedText }: { text: string }) => {
    actualWriteOrder.push(savedText);
    if (savedText === "A1") {
      return firstAWrite.promise;
    }
    if (savedText === "A2") {
      return secondAWrite.promise;
    }
    return bWrite.promise;
  });

  const hookInput = {
    file,
    files: [file],
    folders: [],
    attachmentSettings: {
      attachmentPlacementMode: "root" as const,
      attachmentFolderId: "",
      attachmentSubfolderName: "images",
    },
    autoSaveDelayMs: 5_000,
  };
  const editorA = renderHook(() => useDocumentEditorFile(hookInput));
  const editorB = renderHook(() => useDocumentEditorFile(hookInput));

  await act(async () => {
    await Promise.resolve();
  });
  act(() => {
    editorA.result.current.updateText("A1");
  });
  const firstAPromise = editorA.result.current.saveNow();
  act(() => {
    editorA.result.current.updateText("A2");
  });
  const secondAPromise = editorA.result.current.saveNow();
  act(() => {
    editorB.result.current.updateText("B1");
  });
  const bPromise = editorB.result.current.saveNow();

  await act(async () => {
    await Promise.resolve();
  });
  expect(actualWriteOrder).toEqual(["A1"]);

  await act(async () => {
    firstAWrite.resolve(buildResult("A1", "50"));
    await firstAPromise;
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(actualWriteOrder).toEqual(["A1", "A2"]);

  await act(async () => {
    secondAWrite.resolve(buildResult("A2", "51"));
    await secondAPromise;
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(actualWriteOrder).toEqual(["A1", "A2", "B1"]);

  await act(async () => {
    bWrite.resolve(buildResult("B1", "52"));
    await bPromise;
  });
  expect(editorB.result.current.text).toBe("B1");
  expect(editorB.result.current.saveState).toBe("idle");
});

test("replacing a pending intent moves its reservation behind newer same-path work", async () => {
  const file = createFile({
    id: "shared-path-replacement",
    storagePath: "/files/shared-path-replacement/shared-path-replacement.md",
  });
  const firstAWrite = createDeferred<{
    file: FileMeta;
    text: string;
    textBytes: Uint8Array;
    updatedEvent: {
      id: string;
      name: string;
      mimeType: string;
      sizeBytes: number;
      storageType: FileMeta["storageType"];
      storagePath: string;
      updatedAt: Date;
    };
  }>();
  const thirdAWrite = createDeferred<Awaited<typeof firstAWrite.promise>>();
  const bWrite = createDeferred<Awaited<typeof firstAWrite.promise>>();
  const actualWriteOrder: string[] = [];
  const buildResult = (savedText: string, minute: string) => ({
    file,
    text: savedText,
    textBytes: new TextEncoder().encode(savedText),
    updatedEvent: {
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      sizeBytes: savedText.length,
      storageType: file.storageType,
      storagePath: file.storagePath,
      updatedAt: new Date(`2026-07-15T03:${minute}:00.000Z`),
    },
  });

  persistenceState.readTextDocumentBytes.mockResolvedValue(new TextEncoder().encode("Initial"));
  persistenceState.saveTextDocument.mockImplementation(({ text: savedText }: { text: string }) => {
    actualWriteOrder.push(savedText);
    if (savedText === "A1") {
      return firstAWrite.promise;
    }
    if (savedText === "B1") {
      return bWrite.promise;
    }
    return thirdAWrite.promise;
  });

  const hookInput = {
    file,
    files: [file],
    folders: [],
    attachmentSettings: {
      attachmentPlacementMode: "root" as const,
      attachmentFolderId: "",
      attachmentSubfolderName: "images",
    },
    autoSaveDelayMs: 5_000,
  };
  const editorA = renderHook(() => useDocumentEditorFile(hookInput));
  const editorB = renderHook(() => useDocumentEditorFile(hookInput));

  await act(async () => {
    await Promise.resolve();
  });
  act(() => {
    editorA.result.current.updateText("A1");
  });
  const firstAPromise = editorA.result.current.saveNow();
  act(() => {
    editorA.result.current.updateText("A2");
  });
  let secondASettled = false;
  const secondAPromise = editorA.result.current.saveNow().then(() => {
    secondASettled = true;
  });
  act(() => {
    editorB.result.current.updateText("B1");
  });
  const bPromise = editorB.result.current.saveNow();
  act(() => {
    editorA.result.current.updateText("A3");
  });
  let thirdASettled = false;
  const thirdAPromise = editorA.result.current.saveNow().then(() => {
    thirdASettled = true;
  });

  await act(async () => {
    firstAWrite.resolve(buildResult("A1", "10"));
    await firstAPromise;
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(actualWriteOrder).toEqual(["A1", "B1"]);
  expect(secondASettled).toBe(false);
  expect(thirdASettled).toBe(false);

  await act(async () => {
    bWrite.resolve(buildResult("B1", "11"));
    await bPromise;
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(actualWriteOrder).toEqual(["A1", "B1", "A3"]);
  expect(secondASettled).toBe(false);
  expect(thirdASettled).toBe(false);

  await act(async () => {
    thirdAWrite.resolve(buildResult("A3", "12"));
    await Promise.all([secondAPromise, thirdAPromise]);
  });
  expect(editorA.result.current.text).toBe("A3");
  expect(editorA.result.current.saveState).toBe("idle");
  expect(secondASettled).toBe(true);
  expect(thirdASettled).toBe(true);
});

test("a stale save completion cannot replace the active file session", async () => {
  const fileA = createFile({ id: "stale-a", storagePath: "/files/stale-a/stale-a.md" });
  const fileB = createFile({ id: "active-b", storagePath: "/files/active-b/active-b.md" });
  const staleSave = createDeferred<{
    file: FileMeta;
    text: string;
    textBytes: Uint8Array;
    updatedEvent: {
      id: string;
      name: string;
      mimeType: string;
      sizeBytes: number;
      storageType: FileMeta["storageType"];
      storagePath: string;
      updatedAt: Date;
    };
  }>();

  persistenceState.readTextDocumentBytes.mockImplementation(async (target: FileMeta) =>
    new TextEncoder().encode(target.id === fileA.id ? "A initial" : "B initial"),
  );
  persistenceState.saveTextDocument.mockImplementationOnce(() => staleSave.promise);

  const { result, rerender } = renderHook(
    ({ currentFile }: { currentFile: FileMeta }) =>
      useDocumentEditorFile({
        file: currentFile,
        files: [fileA, fileB],
        folders: [],
        attachmentSettings: {
          attachmentPlacementMode: "root",
          attachmentFolderId: "",
          attachmentSubfolderName: "images",
        },
        autoSaveDelayMs: 5_000,
      }),
    { initialProps: { currentFile: fileA } },
  );

  await act(async () => {
    await Promise.resolve();
  });
  act(() => {
    result.current.updateText("A edited");
  });
  const savePromise = result.current.saveNow();

  rerender({ currentFile: fileB });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

  await act(async () => {
    staleSave.resolve({
      file: fileA,
      text: "A edited",
      textBytes: new TextEncoder().encode("A edited"),
      updatedEvent: {
        id: fileA.id,
        name: fileA.name,
        mimeType: fileA.mimeType,
        sizeBytes: 8,
        storageType: fileA.storageType,
        storagePath: fileA.storagePath,
        updatedAt: new Date("2026-07-15T03:00:00.000Z"),
      },
    });
    await savePromise;
  });

  expect(result.current.file?.id).toBe(fileB.id);
  expect(result.current.text).toBe("B initial");
});

test("a stale load completion cannot replace the active file session", async () => {
  const fileA = createFile({ id: "loading-a", storagePath: "/files/loading-a/loading-a.md" });
  const fileB = createFile({ id: "loaded-b", storagePath: "/files/loaded-b/loaded-b.md" });
  const staleLoad = createDeferred<Uint8Array>();

  persistenceState.readTextDocumentBytes
    .mockImplementationOnce(() => staleLoad.promise)
    .mockResolvedValueOnce(new TextEncoder().encode("B loaded"));

  const { result, rerender } = renderHook(
    ({ currentFile }: { currentFile: FileMeta }) =>
      useDocumentEditorFile({
        file: currentFile,
        files: [fileA, fileB],
        folders: [],
        attachmentSettings: {
          attachmentPlacementMode: "root",
          attachmentFolderId: "",
          attachmentSubfolderName: "images",
        },
      }),
    { initialProps: { currentFile: fileA } },
  );

  await waitFor(() => {
    expect(persistenceState.readTextDocumentBytes).toHaveBeenCalledTimes(1);
  });
  rerender({ currentFile: fileB });
  await waitFor(() => {
    expect(result.current.file?.id).toBe(fileB.id);
    expect(result.current.text).toBe("B loaded");
  });

  await act(async () => {
    staleLoad.resolve(new TextEncoder().encode("A stale"));
    await staleLoad.promise;
    await Promise.resolve();
  });

  expect(result.current.file?.id).toBe(fileB.id);
  expect(result.current.text).toBe("B loaded");
});

test("editing during an in-flight save queues one follow-up with the newest revision", async () => {
  const file = createFile();
  const firstSave = createDeferred<{
    file: FileMeta;
    text: string;
    textBytes: Uint8Array;
    updatedEvent: {
      id: string;
      name: string;
      mimeType: string;
      sizeBytes: number;
      storageType: FileMeta["storageType"];
      storagePath: string;
      updatedAt: Date;
    };
  }>();

  persistenceState.readTextDocumentBytes.mockResolvedValue(new TextEncoder().encode("Initial"));
  persistenceState.saveTextDocument
    .mockImplementationOnce(() => firstSave.promise)
    .mockImplementation(
      async ({ file: savedFile, text: savedText }: { file: FileMeta; text: string }) => ({
        file: savedFile,
        text: savedText,
        textBytes: new TextEncoder().encode(savedText),
        updatedEvent: {
          id: savedFile.id,
          name: savedFile.name,
          mimeType: savedFile.mimeType,
          sizeBytes: savedText.length,
          storageType: savedFile.storageType,
          storagePath: savedFile.storagePath,
          updatedAt: new Date("2026-07-15T04:00:00.000Z"),
        },
      }),
    );

  const { result } = renderHook(() =>
    useDocumentEditorFile({
      file,
      files: [file],
      folders: [],
      attachmentSettings: {
        attachmentPlacementMode: "root",
        attachmentFolderId: "",
        attachmentSubfolderName: "images",
      },
      autoSaveDelayMs: 5_000,
    }),
  );

  await act(async () => {
    await Promise.resolve();
  });
  act(() => {
    result.current.updateText("Revision 1");
  });
  const savePromise = result.current.saveNow();

  act(() => {
    result.current.updateText("Revision 2");
    result.current.updateText("Revision 3");
  });

  await act(async () => {
    firstSave.resolve({
      file,
      text: "Revision 1",
      textBytes: new TextEncoder().encode("Revision 1"),
      updatedEvent: {
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        sizeBytes: 10,
        storageType: file.storageType,
        storagePath: file.storagePath,
        updatedAt: new Date("2026-07-15T04:00:00.000Z"),
      },
    });
    await savePromise;
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(persistenceState.saveTextDocument).toHaveBeenCalledTimes(2);
  expect(persistenceState.saveTextDocument).toHaveBeenNthCalledWith(2, {
    file: expect.objectContaining({ id: file.id }),
    text: "Revision 3",
  });
});

test("a failed save remains dirty and a later explicit save succeeds without immediate retry", async () => {
  const file = createFile();

  persistenceState.readTextDocumentBytes.mockResolvedValue(new TextEncoder().encode("Initial"));
  persistenceState.saveTextDocument
    .mockRejectedValueOnce(new Error("disk full"))
    .mockResolvedValueOnce({
      file,
      text: "Needs retry",
      textBytes: new TextEncoder().encode("Needs retry"),
      updatedEvent: {
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        sizeBytes: 11,
        storageType: file.storageType,
        storagePath: file.storagePath,
        updatedAt: new Date("2026-07-15T05:00:00.000Z"),
      },
    });

  const { result } = renderHook(() =>
    useDocumentEditorFile({
      file,
      files: [file],
      folders: [],
      attachmentSettings: {
        attachmentPlacementMode: "root",
        attachmentFolderId: "",
        attachmentSubfolderName: "images",
      },
      autoSaveDelayMs: 5_000,
    }),
  );

  await act(async () => {
    await Promise.resolve();
  });
  act(() => {
    result.current.updateText("Needs retry");
  });

  await act(async () => {
    await expect(result.current.saveNow()).rejects.toThrow("disk full");
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(result.current.saveState).toBe("error");
  expect(result.current.saveError).toBe("disk full");
  expect(persistenceState.saveTextDocument).toHaveBeenCalledTimes(1);

  await act(async () => {
    await result.current.saveNow();
  });

  expect(persistenceState.saveTextDocument).toHaveBeenCalledTimes(2);
  expect(result.current.saveState).toBe("idle");
  expect(result.current.saveError).toBeNull();
});

test("a stale successful write still emits the update event for the file actually written", async () => {
  const fileA = createFile({ id: "event-a", storagePath: "/files/event-a/event-a.md" });
  const fileB = createFile({ id: "event-b", storagePath: "/files/event-b/event-b.md" });
  const staleSave = createDeferred<{
    file: FileMeta;
    text: string;
    textBytes: Uint8Array;
    updatedEvent: {
      id: string;
      name: string;
      mimeType: string;
      sizeBytes: number;
      storageType: FileMeta["storageType"];
      storagePath: string;
      updatedAt: Date;
    };
  }>();
  const handleFileUpdated = vi.fn();
  const updatedEvent = {
    id: fileA.id,
    name: fileA.name,
    mimeType: fileA.mimeType,
    sizeBytes: 8,
    storageType: fileA.storageType,
    storagePath: fileA.storagePath,
    updatedAt: new Date("2026-07-15T06:00:00.000Z"),
  };

  persistenceState.readTextDocumentBytes.mockImplementation(async (target: FileMeta) =>
    new TextEncoder().encode(target.id === fileA.id ? "A initial" : "B initial"),
  );
  persistenceState.saveTextDocument
    .mockImplementationOnce(() => staleSave.promise)
    .mockResolvedValue({
      file: fileA,
      text: "A edited",
      textBytes: new TextEncoder().encode("A edited"),
      updatedEvent,
    });

  const { result, rerender } = renderHook(
    ({ currentFile }: { currentFile: FileMeta }) =>
      useDocumentEditorFile({
        file: currentFile,
        files: [fileA, fileB],
        folders: [],
        attachmentSettings: {
          attachmentPlacementMode: "root",
          attachmentFolderId: "",
          attachmentSubfolderName: "images",
        },
        autoSaveDelayMs: 5_000,
        onFileUpdated: handleFileUpdated,
      }),
    { initialProps: { currentFile: fileA } },
  );

  await act(async () => {
    await Promise.resolve();
  });
  act(() => {
    result.current.updateText("A edited");
  });
  const savePromise = result.current.saveNow();

  rerender({ currentFile: fileB });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

  await act(async () => {
    staleSave.resolve({
      file: fileA,
      text: "A edited",
      textBytes: new TextEncoder().encode("A edited"),
      updatedEvent,
    });
    await savePromise;
    await result.current.flushPendingSave();
  });

  expect(handleFileUpdated).toHaveBeenCalledWith(updatedEvent);
  expect(result.current.file?.id).toBe(fileB.id);
});

test("a throwing onFileUpdated callback cannot turn a successful write into a failed save", async () => {
  const file = createFile();
  const savedFile = createFile({
    ...file,
    sizeBytes: 7,
    updatedAt: 1_752_550_000_000,
  });
  const handleFileUpdated = vi.fn(() => {
    throw new Error("callback failed");
  });

  persistenceState.readTextDocumentBytes.mockResolvedValue(new TextEncoder().encode("Initial"));
  persistenceState.saveTextDocument.mockResolvedValue({
    file: savedFile,
    text: "Changed",
    textBytes: new TextEncoder().encode("Changed"),
    updatedEvent: {
      id: savedFile.id,
      name: savedFile.name,
      mimeType: savedFile.mimeType,
      sizeBytes: savedFile.sizeBytes,
      storageType: savedFile.storageType,
      storagePath: savedFile.storagePath,
      updatedAt: new Date(savedFile.updatedAt),
    },
  });

  const { result } = renderHook(() =>
    useDocumentEditorFile({
      file,
      files: [file],
      folders: [],
      attachmentSettings: {
        attachmentPlacementMode: "root",
        attachmentFolderId: "",
        attachmentSubfolderName: "images",
      },
      autoSaveDelayMs: 5_000,
      onFileUpdated: handleFileUpdated,
    }),
  );

  await act(async () => {
    await Promise.resolve();
  });
  act(() => {
    result.current.updateText("Changed");
  });

  let rejectedWith: unknown;
  await act(async () => {
    try {
      await result.current.saveNow();
    } catch (error) {
      rejectedWith = error;
    }
  });

  expect(rejectedWith).toBeUndefined();
  expect(handleFileUpdated).toHaveBeenCalledTimes(1);
  expect(result.current.file).toEqual(savedFile);
  expect(result.current.saveState).toBe("idle");
  expect(result.current.saveError).toBeNull();

  await act(async () => {
    await result.current.saveNow();
  });
  expect(persistenceState.saveTextDocument).toHaveBeenCalledTimes(1);
});

test("an identical text update stays clean and does not queue persistence", async () => {
  vi.useFakeTimers();
  const file = createFile();

  persistenceState.readTextDocumentBytes.mockResolvedValue(new TextEncoder().encode("Unchanged"));

  const { result } = renderHook(() =>
    useDocumentEditorFile({
      file,
      files: [file],
      folders: [],
      attachmentSettings: {
        attachmentPlacementMode: "root",
        attachmentFolderId: "",
        attachmentSubfolderName: "images",
      },
      autoSaveDelayMs: 400,
    }),
  );

  await act(async () => {
    await Promise.resolve();
  });

  act(() => {
    result.current.updateText("Unchanged");
  });

  expect(result.current.saveState).toBe("idle");

  await act(async () => {
    vi.advanceTimersByTime(400);
    await Promise.resolve();
  });

  expect(persistenceState.saveTextDocument).not.toHaveBeenCalled();
});

test("editing away and back to the saved text clears autosave without writing", async () => {
  vi.useFakeTimers();
  const file = createFile();
  const savedResult = {
    file,
    text: "Initial",
    textBytes: new TextEncoder().encode("Initial"),
    updatedEvent: {
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      sizeBytes: 7,
      storageType: file.storageType,
      storagePath: file.storagePath,
      updatedAt: new Date("2026-07-15T06:30:00.000Z"),
    },
  };

  persistenceState.readTextDocumentBytes.mockResolvedValue(new TextEncoder().encode("Initial"));
  persistenceState.saveTextDocument.mockResolvedValue(savedResult);

  const { result } = renderHook(() =>
    useDocumentEditorFile({
      file,
      files: [file],
      folders: [],
      attachmentSettings: {
        attachmentPlacementMode: "root",
        attachmentFolderId: "",
        attachmentSubfolderName: "images",
      },
      autoSaveDelayMs: 400,
    }),
  );

  await act(async () => {
    await Promise.resolve();
  });
  act(() => {
    result.current.updateText("Changed");
    result.current.updateText("Initial");
  });

  await act(async () => {
    vi.advanceTimersByTime(400);
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(result.current.text).toBe("Initial");
  expect(result.current.saveState).toBe("idle");
  expect(persistenceState.saveTextDocument).not.toHaveBeenCalled();
});

test("an upgrade racing a newer edit keeps the text and the follow-up uses upgraded metadata", async () => {
  const file = createFile({
    id: "upgrade-race",
    name: "Race.txt",
    mimeType: "text/plain",
    storagePath: "/files/upgrade-race/upgrade-race.txt",
  });
  const upgradedFile = createFile({
    ...file,
    name: "Race.md",
    mimeType: "text/markdown",
  });
  const upgrade = createDeferred<{
    file: FileMeta;
    text: string;
    textBytes: Uint8Array;
    updatedEvent: {
      id: string;
      name: string;
      mimeType: string;
      sizeBytes: number;
      storageType: FileMeta["storageType"];
      storagePath: string;
      updatedAt: Date;
    };
  }>();

  persistenceState.readTextDocumentBytes.mockResolvedValue(new TextEncoder().encode("Plain"));
  persistenceState.upgradeTextFileToMarkdown.mockImplementationOnce(() => upgrade.promise);
  persistenceState.saveTextDocument.mockImplementation(
    async ({ file: savedFile, text: savedText }: { file: FileMeta; text: string }) => ({
      file: savedFile,
      text: savedText,
      textBytes: new TextEncoder().encode(savedText),
      updatedEvent: {
        id: savedFile.id,
        name: savedFile.name,
        mimeType: savedFile.mimeType,
        sizeBytes: savedText.length,
        storageType: savedFile.storageType,
        storagePath: savedFile.storagePath,
        updatedAt: new Date("2026-07-15T07:01:00.000Z"),
      },
    }),
  );

  const { result } = renderHook(() =>
    useDocumentEditorFile({
      file,
      files: [file],
      folders: [],
      attachmentSettings: {
        attachmentPlacementMode: "root",
        attachmentFolderId: "",
        attachmentSubfolderName: "images",
      },
      autoSaveDelayMs: 5_000,
    }),
  );

  await act(async () => {
    await Promise.resolve();
  });
  act(() => {
    result.current.requestWysiwyg();
  });
  const upgradePromise = result.current.confirmTxtUpgrade();

  act(() => {
    result.current.updateText("Newer Markdown text");
  });

  await act(async () => {
    upgrade.resolve({
      file: upgradedFile,
      text: "Plain",
      textBytes: new TextEncoder().encode("Plain"),
      updatedEvent: {
        id: upgradedFile.id,
        name: upgradedFile.name,
        mimeType: upgradedFile.mimeType,
        sizeBytes: 5,
        storageType: upgradedFile.storageType,
        storagePath: upgradedFile.storagePath,
        updatedAt: new Date("2026-07-15T07:00:00.000Z"),
      },
    });
    await upgradePromise;
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(result.current.text).toBe("Newer Markdown text");
  expect(persistenceState.saveTextDocument).toHaveBeenCalledTimes(1);
  expect(persistenceState.saveTextDocument).toHaveBeenCalledWith({
    file: expect.objectContaining({
      id: file.id,
      storagePath: file.storagePath,
      name: "Race.md",
      mimeType: "text/markdown",
    }),
    text: "Newer Markdown text",
  });
});

test("a pending upgrade absorbs a queued rename and settles both callers together", async () => {
  const file = createFile({
    id: "upgrade-rename-race",
    name: "Original.txt",
    mimeType: "text/plain",
    storagePath: "/files/upgrade-rename-race/upgrade-rename-race.txt",
  });
  const upgradedFile = createFile({
    ...file,
    name: "Renamed.md",
    mimeType: "text/markdown",
  });
  const firstWrite = createDeferred<{
    file: FileMeta;
    text: string;
    textBytes: Uint8Array;
    updatedEvent: {
      id: string;
      name: string;
      mimeType: string;
      sizeBytes: number;
      storageType: FileMeta["storageType"];
      storagePath: string;
      updatedAt: Date;
    };
  }>();
  const upgrade = createDeferred<{
    file: FileMeta;
    text: string;
    textBytes: Uint8Array;
    updatedEvent: {
      id: string;
      name: string;
      mimeType: string;
      sizeBytes: number;
      storageType: FileMeta["storageType"];
      storagePath: string;
      updatedAt: Date;
    };
  }>();
  const firstResult = {
    file,
    text: "Changed",
    textBytes: new TextEncoder().encode("Changed"),
    updatedEvent: {
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      sizeBytes: 7,
      storageType: file.storageType,
      storagePath: file.storagePath,
      updatedAt: new Date("2026-07-15T07:30:00.000Z"),
    },
  };
  const upgradeResult = {
    file: upgradedFile,
    text: "Changed",
    textBytes: new TextEncoder().encode("Changed"),
    updatedEvent: {
      id: upgradedFile.id,
      name: upgradedFile.name,
      mimeType: upgradedFile.mimeType,
      sizeBytes: 7,
      storageType: upgradedFile.storageType,
      storagePath: upgradedFile.storagePath,
      updatedAt: new Date("2026-07-15T07:31:00.000Z"),
    },
  };

  persistenceState.readTextDocumentBytes.mockResolvedValue(new TextEncoder().encode("Plain"));
  persistenceState.saveTextDocument.mockImplementationOnce(() => firstWrite.promise);
  persistenceState.upgradeTextFileToMarkdown.mockImplementationOnce(() => upgrade.promise);

  const { result } = renderHook(() =>
    useDocumentEditorFile({
      file,
      files: [file],
      folders: [],
      attachmentSettings: {
        attachmentPlacementMode: "root",
        attachmentFolderId: "",
        attachmentSubfolderName: "images",
      },
      autoSaveDelayMs: 5_000,
    }),
  );

  await act(async () => {
    await Promise.resolve();
  });
  act(() => {
    result.current.updateText("Changed");
  });
  const firstPromise = result.current.saveNow();

  act(() => {
    result.current.requestWysiwyg();
  });
  let upgradeSettled = false;
  let renameSettled = false;
  const upgradePromise = result.current.confirmTxtUpgrade().then(() => {
    upgradeSettled = true;
  });
  const renamePromise = result.current.renameTitle("Renamed.txt").then(() => {
    renameSettled = true;
  });

  await act(async () => {
    firstWrite.resolve(firstResult);
    await firstPromise;
    await Promise.resolve();
  });

  expect(persistenceState.upgradeTextFileToMarkdown).toHaveBeenCalledWith({
    file: expect.objectContaining({
      id: file.id,
      storagePath: file.storagePath,
      name: "Renamed.txt",
      mimeType: "text/plain",
    }),
    text: "Changed",
    files: [file],
  });
  expect(upgradeSettled).toBe(false);
  expect(renameSettled).toBe(false);

  await act(async () => {
    upgrade.resolve(upgradeResult);
    await Promise.all([upgradePromise, renamePromise]);
  });

  expect(result.current.file).toEqual(upgradedFile);
  expect(upgradeSettled).toBe(true);
  expect(renameSettled).toBe(true);
});

test("coalesced explicit save callers remain pending until their covering write settles", async () => {
  const file = createFile();
  const firstWrite = createDeferred<{
    file: FileMeta;
    text: string;
    textBytes: Uint8Array;
    updatedEvent: {
      id: string;
      name: string;
      mimeType: string;
      sizeBytes: number;
      storageType: FileMeta["storageType"];
      storagePath: string;
      updatedAt: Date;
    };
  }>();
  const secondWrite = createDeferred<{
    file: FileMeta;
    text: string;
    textBytes: Uint8Array;
    updatedEvent: {
      id: string;
      name: string;
      mimeType: string;
      sizeBytes: number;
      storageType: FileMeta["storageType"];
      storagePath: string;
      updatedAt: Date;
    };
  }>();
  const firstResult = {
    file,
    text: "Revision 1",
    textBytes: new TextEncoder().encode("Revision 1"),
    updatedEvent: {
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      sizeBytes: 9,
      storageType: file.storageType,
      storagePath: file.storagePath,
      updatedAt: new Date("2026-07-15T08:00:00.000Z"),
    },
  };
  const secondResult = {
    ...firstResult,
    text: "Revision 2",
    textBytes: new TextEncoder().encode("Revision 2"),
    updatedEvent: {
      ...firstResult.updatedEvent,
      updatedAt: new Date("2026-07-15T08:01:00.000Z"),
    },
  };

  persistenceState.readTextDocumentBytes.mockResolvedValue(new TextEncoder().encode("Initial"));
  persistenceState.saveTextDocument
    .mockImplementationOnce(() => firstWrite.promise)
    .mockImplementationOnce(() => secondWrite.promise);

  const { result } = renderHook(() =>
    useDocumentEditorFile({
      file,
      files: [file],
      folders: [],
      attachmentSettings: {
        attachmentPlacementMode: "root",
        attachmentFolderId: "",
        attachmentSubfolderName: "images",
      },
      autoSaveDelayMs: 5_000,
    }),
  );

  await act(async () => {
    await Promise.resolve();
  });
  act(() => {
    result.current.updateText("Revision 1");
  });
  const firstPromise = result.current.saveNow();
  act(() => {
    result.current.updateText("Revision 2");
  });

  let saveNowSettled = false;
  let flushSettled = false;
  const saveNowPromise = result.current.saveNow().then(() => {
    saveNowSettled = true;
  });
  const flushPromise = result.current.flushPendingSave().then(() => {
    flushSettled = true;
  });

  await act(async () => {
    await Promise.resolve();
  });
  expect(saveNowSettled).toBe(false);
  expect(flushSettled).toBe(false);

  await act(async () => {
    firstWrite.resolve(firstResult);
    await firstPromise;
    await Promise.resolve();
  });

  expect(persistenceState.saveTextDocument).toHaveBeenCalledTimes(2);
  expect(saveNowSettled).toBe(false);
  expect(flushSettled).toBe(false);

  await act(async () => {
    secondWrite.resolve(secondResult);
    await Promise.all([saveNowPromise, flushPromise]);
  });

  expect(saveNowSettled).toBe(true);
  expect(flushSettled).toBe(true);
});

test("getCanonicalSnapshot is stable and reads the current session refs", async () => {
  const file = createFile();
  persistenceState.readTextDocumentBytes.mockResolvedValue(new TextEncoder().encode("Initial"));
  persistenceState.saveTextDocument.mockResolvedValue({
    file,
    text: "Changed",
    textBytes: new TextEncoder().encode("Changed"),
    updatedEvent: {
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      sizeBytes: 7,
      storageType: file.storageType,
      storagePath: file.storagePath,
      updatedAt: new Date("2026-07-15T09:00:00.000Z"),
    },
  });

  const { result, rerender } = renderHook(
    ({ listedFiles }: { listedFiles: FileMeta[] }) =>
      useDocumentEditorFile({
        file,
        files: listedFiles,
        folders: [],
        attachmentSettings: {
          attachmentPlacementMode: "root",
          attachmentFolderId: "",
          attachmentSubfolderName: "images",
        },
      }),
    { initialProps: { listedFiles: [file] } },
  );

  await act(async () => {
    await Promise.resolve();
  });

  const getSnapshot = result.current.getCanonicalSnapshot;
  expect(getSnapshot()).toEqual({
    fileId: file.id,
    revision: 0,
    sessionId: expect.any(Number),
    text: "Initial",
  });

  act(() => {
    result.current.updateText("Changed");
  });
  rerender({ listedFiles: [file] });

  expect(result.current.getCanonicalSnapshot).toBe(getSnapshot);
  expect(getSnapshot()).toEqual({
    fileId: file.id,
    revision: 1,
    sessionId: expect.any(Number),
    text: "Changed",
  });

  await act(async () => {
    await result.current.saveNow();
  });
});

test("auto-save and manual save use the same persistence path and commit fileUpdated", async () => {
  vi.useFakeTimers();
  const file = createFile();
  const handleFileUpdated = vi.fn();
  const updatedEvent = {
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    sizeBytes: 48,
    storageType: file.storageType,
    storagePath: file.storagePath,
    updatedAt: new Date("2026-05-07T01:00:00.000Z"),
  };

  persistenceState.readTextDocumentBytes.mockResolvedValue(new TextEncoder().encode("Initial"));
  persistenceState.saveTextDocument.mockResolvedValue({
    file,
    text: "Updated",
    textBytes: new TextEncoder().encode("Updated"),
    updatedEvent,
  });

  const { result } = renderHook(() =>
    useDocumentEditorFile({
      file,
      files: [file],
      folders: [],
      attachmentSettings: {
        attachmentPlacementMode: "root",
        attachmentFolderId: "",
        attachmentSubfolderName: "images",
      },
      autoSaveDelayMs: 400,
      onFileUpdated: handleFileUpdated,
    }),
  );

  await act(async () => {
    await Promise.resolve();
  });
  expect(result.current.isLoading).toBe(false);

  act(() => {
    result.current.updateText("Updated");
  });

  await act(async () => {
    vi.advanceTimersByTime(400);
    await Promise.resolve();
  });

  expect(persistenceState.saveTextDocument).toHaveBeenCalledTimes(1);

  act(() => {
    result.current.updateText("Updated again");
  });

  await act(async () => {
    await result.current.saveNow();
  });

  expect(persistenceState.saveTextDocument).toHaveBeenNthCalledWith(1, {
    file: expect.objectContaining({
      id: file.id,
      storagePath: file.storagePath,
    }),
    text: "Updated",
  });
  expect(persistenceState.saveTextDocument).toHaveBeenNthCalledWith(2, {
    file: expect.objectContaining({
      id: file.id,
      storagePath: file.storagePath,
    }),
    text: "Updated again",
  });
  expect(handleFileUpdated).toHaveBeenCalledTimes(2);
  expect(handleFileUpdated).toHaveBeenLastCalledWith(updatedEvent);
  vi.useRealTimers();
});

test("flushPendingSave persists dirty text before route leave", async () => {
  const file = createFile();

  persistenceState.readTextDocumentBytes.mockResolvedValue(new TextEncoder().encode("Initial"));
  persistenceState.saveTextDocument.mockResolvedValue({
    file,
    text: "Leaving soon",
    textBytes: new TextEncoder().encode("Leaving soon"),
    updatedEvent: {
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      sizeBytes: 12,
      storageType: file.storageType,
      storagePath: file.storagePath,
      updatedAt: new Date("2026-05-07T02:00:00.000Z"),
    },
  });

  const { result } = renderHook(() =>
    useDocumentEditorFile({
      file,
      files: [file],
      folders: [],
      attachmentSettings: {
        attachmentPlacementMode: "root",
        attachmentFolderId: "",
        attachmentSubfolderName: "images",
      },
      autoSaveDelayMs: 5_000,
    }),
  );

  await act(async () => {
    await Promise.resolve();
  });
  expect(result.current.isLoading).toBe(false);

  act(() => {
    result.current.updateText("Leaving soon");
  });

  await act(async () => {
    await result.current.flushPendingSave();
  });

  expect(persistenceState.saveTextDocument).toHaveBeenCalledWith({
    file: expect.objectContaining({ id: file.id }),
    text: "Leaving soon",
  });
});

test("confirming txt upgrade commits the markdown rename while cancelling leaves metadata unchanged", async () => {
  const file = createFile({
    id: "document-2",
    name: "Draft.txt",
    mimeType: "text/plain",
    storagePath: "/files/document-2/document-2.txt",
  });
  const handleFileUpdated = vi.fn();

  persistenceState.readTextDocumentBytes.mockResolvedValue(new TextEncoder().encode("plain text"));
  persistenceState.upgradeTextFileToMarkdown.mockResolvedValue({
    file: {
      ...file,
      name: "Draft.md",
      mimeType: "text/markdown",
    },
    text: "plain text",
    textBytes: new TextEncoder().encode("plain text"),
    updatedEvent: {
      id: file.id,
      name: "Draft.md",
      mimeType: "text/markdown",
      sizeBytes: 10,
      storageType: file.storageType,
      storagePath: file.storagePath,
      updatedAt: new Date("2026-05-07T03:00:00.000Z"),
    },
  });

  const { result } = renderHook(() =>
    useDocumentEditorFile({
      file,
      files: [file],
      folders: [],
      attachmentSettings: {
        attachmentPlacementMode: "root",
        attachmentFolderId: "",
        attachmentSubfolderName: "images",
      },
      onFileUpdated: handleFileUpdated,
    }),
  );

  await act(async () => {
    await Promise.resolve();
  });
  expect(result.current.isLoading).toBe(false);

  act(() => {
    result.current.requestWysiwyg();
  });

  expect(result.current.txtUpgradeDialogOpen).toBe(true);

  act(() => {
    result.current.cancelTxtUpgrade();
  });

  expect(result.current.txtUpgradeDialogOpen).toBe(false);
  expect(persistenceState.upgradeTextFileToMarkdown).not.toHaveBeenCalled();

  act(() => {
    result.current.requestWysiwyg();
  });

  await act(async () => {
    await result.current.confirmTxtUpgrade();
  });

  expect(persistenceState.upgradeTextFileToMarkdown).toHaveBeenCalledWith({
    file: expect.objectContaining({ id: file.id, name: "Draft.txt" }),
    text: "plain text",
    files: [file],
  });
  expect(handleFileUpdated).toHaveBeenCalledWith(
    expect.objectContaining({
      id: file.id,
      name: "Draft.md",
      mimeType: "text/markdown",
    }),
  );
  expect(result.current.file?.name).toBe("Draft.md");
});
