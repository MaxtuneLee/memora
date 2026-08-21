import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { JSDOM } from "jsdom";
import { beforeEach, expect, test, vi } from "vite-plus/test";
import { MemoryRouter } from "react-router";
import { EditorView } from "@codemirror/view";

import { DocumentEditorPage } from "@/components/editor/DocumentEditorPage";
import type { MarkdownPreflightResult } from "@/lib/editor/markdownRoundTripGuard";
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

const preflightState = vi.hoisted(() => {
  return {
    productionPreflight: null as null | ((markdown: string) => MarkdownPreflightResult),
    preflightMarkdownForWysiwyg: vi.fn<(markdown: string) => MarkdownPreflightResult>(),
  };
});

const attachmentState = vi.hoisted(() => {
  return {
    saveImageAttachment: vi.fn(),
  };
});

vi.mock("@/lib/editor/documentPersistence", () => ({
  readTextDocumentBytes: persistenceState.readTextDocumentBytes,
  saveTextDocument: persistenceState.saveTextDocument,
  upgradeTextFileToMarkdown: persistenceState.upgradeTextFileToMarkdown,
}));

vi.mock("@/lib/editor/markdownRoundTripGuard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/editor/markdownRoundTripGuard")>();
  preflightState.productionPreflight = actual.preflightMarkdownForWysiwyg;

  return {
    ...actual,
    preflightMarkdownForWysiwyg: preflightState.preflightMarkdownForWysiwyg,
  };
});

vi.mock("@/lib/editor/imageAttachments", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/editor/imageAttachments")>();
  return {
    ...actual,
    saveImageAttachment: attachmentState.saveImageAttachment,
  };
});

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
  const requestAnimationFrame = (callback: FrameRequestCallback) => {
    return dom.window.setTimeout(() => callback(0), 0);
  };
  const cancelAnimationFrame = (handle: number) => {
    dom.window.clearTimeout(handle);
  };
  dom.window.requestAnimationFrame = requestAnimationFrame;
  dom.window.cancelAnimationFrame = cancelAnimationFrame;
  Object.defineProperty(dom.window.HTMLElement.prototype, "attachEvent", {
    configurable: true,
    value() {},
  });
  Object.defineProperty(dom.window.HTMLElement.prototype, "detachEvent", {
    configurable: true,
    value() {},
  });
  class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(dom.window.HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value() {
      this.open = true;
    },
  });
  Object.defineProperty(dom.window.HTMLDialogElement.prototype, "close", {
    configurable: true,
    value() {
      this.open = false;
    },
  });

  vi.stubGlobal("window", dom.window);
  vi.stubGlobal("document", dom.window.document);
  vi.stubGlobal("navigator", dom.window.navigator);
  vi.stubGlobal("HTMLElement", dom.window.HTMLElement);
  vi.stubGlobal("HTMLTextAreaElement", dom.window.HTMLTextAreaElement);
  vi.stubGlobal("HTMLDialogElement", dom.window.HTMLDialogElement);
  vi.stubGlobal("Window", dom.window.Window);
  vi.stubGlobal("DOMRect", dom.window.DOMRect);
  vi.stubGlobal("ResizeObserver", ResizeObserver);
  vi.stubGlobal("MutationObserver", dom.window.MutationObserver);
  vi.stubGlobal("Node", dom.window.Node);
  vi.stubGlobal("getComputedStyle", dom.window.getComputedStyle.bind(dom.window));
  vi.stubGlobal("requestAnimationFrame", requestAnimationFrame);
  vi.stubGlobal("cancelAnimationFrame", cancelAnimationFrame);
  Object.defineProperty(dom.window.Range.prototype, "getClientRects", {
    configurable: true,
    value: () => [],
  });
  Object.defineProperty(dom.window.Range.prototype, "getBoundingClientRect", {
    configurable: true,
    value: () => new dom.window.DOMRect(),
  });
};

const getSourceEditorView = (sourceEditor: HTMLElement): EditorView => {
  const editorElement = sourceEditor.closest<HTMLElement>(".cm-editor");
  if (!editorElement) {
    throw new Error("Unable to find the CodeMirror editor.");
  }
  const editorView = EditorView.findFromDOM(editorElement);
  if (!editorView) {
    throw new Error("Unable to resolve the CodeMirror EditorView.");
  }
  return editorView;
};

const getSourceText = (sourceEditor: HTMLElement): string => {
  return getSourceEditorView(sourceEditor).state.doc.toString();
};

const updateSourceText = (sourceEditor: HTMLElement, value: string): void => {
  const editorView = getSourceEditorView(sourceEditor);
  editorView.dispatch({
    changes: { from: 0, to: editorView.state.doc.length, insert: value },
  });
};

const attachmentSettings = {
  attachmentPlacementMode: "root" as const,
  attachmentFolderId: "",
  attachmentSubfolderName: "images",
};

beforeEach(() => {
  cleanup();
  setupDom();
  persistenceState.readTextDocumentBytes.mockReset();
  persistenceState.saveTextDocument.mockReset();
  persistenceState.upgradeTextFileToMarkdown.mockReset();
  preflightState.preflightMarkdownForWysiwyg.mockReset();
  attachmentState.saveImageAttachment.mockReset();
  preflightState.preflightMarkdownForWysiwyg.mockImplementation((markdown) => {
    if (!preflightState.productionPreflight) {
      throw new Error("Production Markdown preflight was not initialized.");
    }

    return preflightState.productionPreflight(markdown);
  });
});

test("loads a markdown document into the dedicated editor shell", async () => {
  persistenceState.readTextDocumentBytes.mockResolvedValue(new TextEncoder().encode("# Draft\n"));

  const view = render(
    <MemoryRouter>
      <DocumentEditorPage
        fileId="document-1"
        files={[createFile()]}
        folders={[]}
        editorFontSizePx={18}
        attachmentSettings={attachmentSettings}
      />
    </MemoryRouter>,
  );

  await waitFor(() => {
    expect(view.getByRole("button", { name: "Preview" }).getAttribute("aria-pressed")).toBe("true");
  });

  expect(view.getByRole("button", { name: "Preview" })).not.toBeNull();
  expect(
    view.getByTestId("document-editor-page").style.getPropertyValue("--document-editor-font-size"),
  ).toBe("18px");
});

test("opens markdown files in wysiwyg mode by default", async () => {
  persistenceState.readTextDocumentBytes.mockResolvedValue(
    new TextEncoder().encode("# Draft\n\nParagraph\n"),
  );

  const view = render(
    <MemoryRouter>
      <DocumentEditorPage
        fileId="document-1"
        files={[createFile()]}
        folders={[]}
        editorFontSizePx={18}
        attachmentSettings={attachmentSettings}
      />
    </MemoryRouter>,
  );

  await waitFor(() => {
    expect(view.getByRole("button", { name: "Preview" }).getAttribute("aria-pressed")).toBe("true");
  });

  expect(view.getByTestId("wysiwyg-document-editor")).not.toBeNull();
});

test("opens safe markdown in preview from the source editor", async () => {
  persistenceState.readTextDocumentBytes.mockResolvedValue(
    new TextEncoder().encode("# Draft\n\nParagraph\n"),
  );

  const view = render(
    <MemoryRouter>
      <DocumentEditorPage
        fileId="document-1"
        files={[createFile()]}
        folders={[]}
        editorFontSizePx={18}
        attachmentSettings={attachmentSettings}
        initialMode="source"
      />
    </MemoryRouter>,
  );

  await waitFor(() => {
    expect(getSourceText(view.getByRole("textbox", { name: "Document source" }))).toBe(
      "# Draft\n\nParagraph\n",
    );
  });

  fireEvent.click(view.getByRole("button", { name: "Preview" }));

  await waitFor(() => {
    expect(view.getByRole("button", { name: "Preview" }).getAttribute("aria-pressed")).toBe("true");
  });
  expect(view.getByTestId("wysiwyg-document-editor")).not.toBeNull();
});

test("opens unsafe raw HTML in code mode and explains why preview is unavailable", async () => {
  const unsafeMarkdown = '<a href="https://example.com">link</a>';
  persistenceState.readTextDocumentBytes.mockResolvedValue(
    new TextEncoder().encode(unsafeMarkdown),
  );

  const view = render(
    <MemoryRouter>
      <DocumentEditorPage
        fileId="document-1"
        files={[createFile()]}
        folders={[]}
        editorFontSizePx={18}
        attachmentSettings={attachmentSettings}
      />
    </MemoryRouter>,
  );

  await waitFor(() => {
    expect(getSourceText(view.getByRole("textbox", { name: "Document source" }))).toBe(
      unsafeMarkdown,
    );
  });
  expect(view.getByText(/converting this document would change its Markdown/i)).not.toBeNull();

  fireEvent.click(view.getByRole("button", { name: "Preview" }));

  await waitFor(() => {
    expect(view.getByRole("button", { name: "Code" }).getAttribute("aria-pressed")).toBe("true");
  });
  expect(view.getByText(/converting this document would change its Markdown/i)).not.toBeNull();
  expect(view.queryByTestId("wysiwyg-document-editor")).toBeNull();
});

test("marks the exact checklist source that blocks preview and clears it after editing", async () => {
  persistenceState.readTextDocumentBytes.mockResolvedValue(new TextEncoder().encode("- [] item"));

  const view = render(
    <MemoryRouter>
      <DocumentEditorPage
        fileId="document-1"
        files={[createFile()]}
        folders={[]}
        editorFontSizePx={18}
        attachmentSettings={attachmentSettings}
      />
    </MemoryRouter>,
  );

  const sourceEditor = await waitFor(() => {
    return view.getByRole("textbox", { name: "Document source" });
  });
  const issueMessage = 'Line 1: "[]" would become "[ ]".';
  await waitFor(() => {
    expect(view.getByRole("button", { name: issueMessage })).not.toBeNull();
  });
  expect(view.container.querySelector(".cm-markdown-safety-diagnostic")).not.toBeNull();
  expect(getSourceEditorView(sourceEditor).state.selection.main.from).toBe(2);
  expect(getSourceEditorView(sourceEditor).state.selection.main.to).toBe(4);

  await act(async () => {
    updateSourceText(sourceEditor, "- [ ] item");
    await Promise.resolve();
  });

  expect(view.queryByRole("button", { name: issueMessage })).toBeNull();
  expect(view.container.querySelector(".cm-markdown-safety-diagnostic")).toBeNull();
});

test("clears safety diagnostics before an attachment changes the canonical text", async () => {
  const initialText = "- [] item";
  const nextText = `${initialText}\n\n![diagram.png](diagram.png)\n`;
  const file = createFile();
  persistenceState.readTextDocumentBytes.mockResolvedValue(new TextEncoder().encode(initialText));
  persistenceState.saveTextDocument.mockResolvedValue({
    file,
    text: nextText,
    textBytes: new TextEncoder().encode(nextText),
    updatedEvent: {
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      sizeBytes: nextText.length,
      storageType: file.storageType,
      storagePath: file.storagePath,
      updatedAt: new Date("2026-07-16T00:00:00.000Z"),
    },
  });
  attachmentState.saveImageAttachment.mockResolvedValue({
    createdFileEvent: undefined,
    createdFolderEvent: null,
    markdownPath: "diagram.png",
    meta: { name: "diagram.png" },
  });

  const view = render(
    <MemoryRouter>
      <DocumentEditorPage
        fileId={file.id}
        files={[file]}
        folders={[]}
        editorFontSizePx={18}
        attachmentSettings={attachmentSettings}
      />
    </MemoryRouter>,
  );
  const issueMessage = 'Line 1: "[]" would become "[ ]".';
  await waitFor(() => {
    expect(view.getByRole("button", { name: issueMessage })).not.toBeNull();
  });

  const input = view.container.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) {
    throw new Error("Expected the attachment file input.");
  }
  fireEvent.change(input, {
    target: { files: [new window.File(["image"], "diagram.png", { type: "image/png" })] },
  });

  await waitFor(() => {
    expect(view.queryByRole("button", { name: issueMessage })).toBeNull();
  });
});

test("clears safety diagnostics when the same file id starts a new storage session", async () => {
  const originalFile = createFile();
  const relocatedFile = createFile({
    storagePath: "/relocated/document-1.md",
  });
  persistenceState.readTextDocumentBytes.mockImplementation(async (file: FileMeta) => {
    const text = file.storagePath === relocatedFile.storagePath ? "# Safe document\n" : "- [] item";
    return new TextEncoder().encode(text);
  });

  const view = render(
    <MemoryRouter>
      <DocumentEditorPage
        fileId={originalFile.id}
        files={[originalFile]}
        folders={[]}
        editorFontSizePx={18}
        attachmentSettings={attachmentSettings}
      />
    </MemoryRouter>,
  );
  const issueMessage = 'Line 1: "[]" would become "[ ]".';
  await waitFor(() => {
    expect(view.getByRole("button", { name: issueMessage })).not.toBeNull();
  });

  view.rerender(
    <MemoryRouter>
      <DocumentEditorPage
        fileId={relocatedFile.id}
        files={[relocatedFile]}
        folders={[]}
        editorFontSizePx={18}
        attachmentSettings={attachmentSettings}
      />
    </MemoryRouter>,
  );

  await waitFor(() => {
    expect(persistenceState.readTextDocumentBytes).toHaveBeenCalledTimes(2);
    expect(view.queryByRole("button", { name: issueMessage })).toBeNull();
    expect(view.getByRole("button", { name: "Preview" }).getAttribute("aria-pressed")).toBe("true");
  });
});

test("keeps conversion failures in code mode with a safety explanation", async () => {
  persistenceState.readTextDocumentBytes.mockResolvedValue(new TextEncoder().encode("# Draft\n"));
  preflightState.preflightMarkdownForWysiwyg.mockImplementationOnce(() => {
    throw new Error("conversion failed");
  });

  const view = render(
    <MemoryRouter>
      <DocumentEditorPage
        fileId="document-1"
        files={[createFile()]}
        folders={[]}
        editorFontSizePx={18}
        attachmentSettings={attachmentSettings}
      />
    </MemoryRouter>,
  );

  await waitFor(() => {
    expect(view.getByRole("button", { name: "Code" }).getAttribute("aria-pressed")).toBe("true");
  });
  expect(view.getByText(/could not be converted safely/i)).not.toBeNull();
  expect(view.queryByTestId("wysiwyg-document-editor")).toBeNull();
});

test("refuses a safe preflight result when canonical text changes during conversion", async () => {
  persistenceState.readTextDocumentBytes.mockResolvedValue(new TextEncoder().encode("# Draft\n"));

  const view = render(
    <MemoryRouter>
      <DocumentEditorPage
        fileId="document-1"
        files={[createFile()]}
        folders={[]}
        editorFontSizePx={18}
        attachmentSettings={attachmentSettings}
        initialMode="source"
      />
    </MemoryRouter>,
  );

  const textarea = await waitFor(() => {
    return view.getByRole("textbox", { name: "Document source" });
  });
  textarea.focus();
  preflightState.preflightMarkdownForWysiwyg.mockImplementationOnce(() => {
    updateSourceText(textarea, "# Newer edit\n");
    return {
      roundTrippedText: "# Draft",
      safe: true,
    };
  });

  fireEvent.click(view.getByRole("button", { name: "Preview" }));

  await waitFor(() => {
    expect(getSourceText(view.getByRole("textbox", { name: "Document source" }))).toBe(
      "# Newer edit\n",
    );
  });
  expect(view.getByRole("button", { name: "Code" }).getAttribute("aria-pressed")).toBe("true");
  expect(view.queryByText(/converting this document would change its Markdown/i)).toBeNull();
  expect(view.queryByText(/could not be converted safely/i)).toBeNull();
});

test("does not let the save button steal source editor focus on mouse down", async () => {
  persistenceState.readTextDocumentBytes.mockResolvedValue(
    new TextEncoder().encode("# Draft\n\nParagraph\n"),
  );
  persistenceState.saveTextDocument.mockResolvedValue({
    file: createFile(),
    text: "# Draft\n\nParagraph\n",
    textBytes: new TextEncoder().encode("# Draft\n\nParagraph\n"),
    updatedEvent: {
      id: "document-1",
      name: "Draft.md",
      mimeType: "text/markdown",
      sizeBytes: 18,
      storageType: "opfs",
      storagePath: "/files/document-1/document-1.md",
      updatedAt: new Date("2026-05-08T00:00:00.000Z"),
    },
  });

  const view = render(
    <MemoryRouter>
      <DocumentEditorPage
        fileId="document-1"
        files={[createFile()]}
        folders={[]}
        editorFontSizePx={18}
        attachmentSettings={attachmentSettings}
        initialMode="source"
        onFileUpdated={() => {}}
      />
    </MemoryRouter>,
  );

  const textarea = await waitFor(() => {
    return view.getByRole("textbox", { name: "Document source" });
  });
  textarea.focus();
  getSourceEditorView(textarea).dispatch({ selection: { anchor: 5 } });

  const saveButton = view.getByRole("menuitem", { name: /Save/ });
  const mouseDownEvent = new window.MouseEvent("mousedown", {
    bubbles: true,
    cancelable: true,
  });

  saveButton.dispatchEvent(mouseDownEvent);

  expect(mouseDownEvent.defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(textarea);
  expect(getSourceEditorView(textarea).state.selection.main.from).toBe(5);
  expect(getSourceEditorView(textarea).state.selection.main.to).toBe(5);
});

test("does not reload the current source document when autosave only updates file metadata", async () => {
  const initialFile = createFile({
    updatedAt: 1_746_000_000_000,
    sizeBytes: 18,
  });
  const updatedFile = {
    ...initialFile,
    updatedAt: 1_746_000_000_500,
    sizeBytes: 24,
  };

  persistenceState.readTextDocumentBytes.mockResolvedValue(
    new TextEncoder().encode("# Draft\n\nParagraph\n"),
  );

  const view = render(
    <MemoryRouter>
      <DocumentEditorPage
        fileId={initialFile.id}
        files={[initialFile]}
        folders={[]}
        editorFontSizePx={18}
        attachmentSettings={attachmentSettings}
        initialMode="source"
        onFileUpdated={() => {}}
      />
    </MemoryRouter>,
  );

  const textarea = await waitFor(() => {
    return view.getByRole("textbox", { name: "Document source" });
  });
  textarea.focus();
  getSourceEditorView(textarea).dispatch({ selection: { anchor: 5 } });

  view.rerender(
    <MemoryRouter>
      <DocumentEditorPage
        fileId={updatedFile.id}
        files={[updatedFile]}
        folders={[]}
        editorFontSizePx={18}
        attachmentSettings={attachmentSettings}
        initialMode="source"
        onFileUpdated={() => {}}
      />
    </MemoryRouter>,
  );

  await waitFor(() => {
    expect(persistenceState.readTextDocumentBytes).toHaveBeenCalledTimes(1);
  });
  expect(view.getByRole("textbox", { name: "Document source" })).toBe(textarea);
  expect(document.activeElement).toBe(textarea);
  expect(getSourceEditorView(textarea).state.selection.main.from).toBe(5);
  expect(getSourceEditorView(textarea).state.selection.main.to).toBe(5);
});

test("loads a fresh file session and ignores a deferred load from the previous file", async () => {
  const fileA = createFile({ id: "document-a", name: "A.md" });
  const fileB = createFile({ id: "document-b", name: "B.md" });
  const staleLoad = createDeferred<Uint8Array>();
  persistenceState.readTextDocumentBytes.mockImplementation((file: FileMeta) => {
    return file.id === fileA.id
      ? staleLoad.promise
      : Promise.resolve(new TextEncoder().encode("# File B\n"));
  });

  const view = render(
    <MemoryRouter>
      <DocumentEditorPage
        fileId={fileA.id}
        files={[fileA, fileB]}
        folders={[]}
        editorFontSizePx={18}
        attachmentSettings={attachmentSettings}
        initialMode="source"
      />
    </MemoryRouter>,
  );

  await waitFor(() => {
    expect(persistenceState.readTextDocumentBytes).toHaveBeenCalledWith(fileA);
  });
  view.rerender(
    <MemoryRouter>
      <DocumentEditorPage
        fileId={fileB.id}
        files={[fileA, fileB]}
        folders={[]}
        editorFontSizePx={18}
        attachmentSettings={attachmentSettings}
        initialMode="source"
      />
    </MemoryRouter>,
  );

  await waitFor(() => {
    expect(getSourceText(view.getByRole("textbox", { name: "Document source" }))).toBe(
      "# File B\n",
    );
  });

  await act(async () => {
    staleLoad.resolve(new TextEncoder().encode("# Stale file A\n"));
    await staleLoad.promise;
    await Promise.resolve();
  });

  expect(getSourceText(view.getByRole("textbox", { name: "Document source" }))).toBe("# File B\n");
});

test("loads a fresh file session and ignores a deferred save from the previous file", async () => {
  const fileA = createFile({ id: "document-a", name: "A.md" });
  const fileB = createFile({ id: "document-b", name: "B.md" });
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
  persistenceState.readTextDocumentBytes.mockImplementation(async (file: FileMeta) =>
    new TextEncoder().encode(file.id === fileA.id ? "# File A\n" : "# File B\n"),
  );
  persistenceState.saveTextDocument.mockImplementationOnce(() => staleSave.promise);

  const view = render(
    <MemoryRouter>
      <DocumentEditorPage
        fileId={fileA.id}
        files={[fileA, fileB]}
        folders={[]}
        editorFontSizePx={18}
        attachmentSettings={attachmentSettings}
        initialMode="source"
      />
    </MemoryRouter>,
  );

  const fileATextarea = await waitFor(() => {
    return view.getByRole("textbox", { name: "Document source" });
  });
  fileATextarea.focus();
  await act(async () => {
    updateSourceText(fileATextarea, "# File A edited\n");
    await Promise.resolve();
  });
  expect(getSourceText(fileATextarea)).toBe("# File A edited\n");
  await waitFor(
    () => {
      expect(persistenceState.saveTextDocument).toHaveBeenCalledWith({
        file: expect.objectContaining({ id: fileA.id }),
        text: "# File A edited\n",
      });
    },
    { timeout: 2_500 },
  );

  view.rerender(
    <MemoryRouter>
      <DocumentEditorPage
        fileId={fileB.id}
        files={[fileA, fileB]}
        folders={[]}
        editorFontSizePx={18}
        attachmentSettings={attachmentSettings}
        initialMode="source"
      />
    </MemoryRouter>,
  );

  const fileBTextarea = await waitFor(() => {
    const textarea = view.getByRole("textbox", { name: "Document source" });
    expect(getSourceText(textarea)).toBe("# File B\n");
    return textarea;
  });

  await act(async () => {
    staleSave.resolve({
      file: fileA,
      text: "# File A edited\n",
      textBytes: new TextEncoder().encode("# File A edited\n"),
      updatedEvent: {
        id: fileA.id,
        name: fileA.name,
        mimeType: fileA.mimeType,
        sizeBytes: 16,
        storageType: fileA.storageType,
        storagePath: fileA.storagePath,
        updatedAt: new Date("2026-07-15T10:00:00.000Z"),
      },
    });
    await staleSave.promise;
    await Promise.resolve();
  });

  expect(getSourceText(fileBTextarea)).toBe("# File B\n");
  expect(view.getByRole("button", { name: "Code" }).getAttribute("aria-pressed")).toBe("true");
});

test("shows txt upgrade confirmation before leaving source mode", async () => {
  const handleFileUpdated = vi.fn();
  const txtFile = createFile({
    id: "document-2",
    name: "Draft.txt",
    mimeType: "text/plain",
    storagePath: "/files/document-2/document-2.txt",
  });

  persistenceState.readTextDocumentBytes.mockResolvedValue(new TextEncoder().encode("plain text"));
  persistenceState.upgradeTextFileToMarkdown.mockResolvedValue({
    file: {
      ...txtFile,
      name: "Draft.md",
      mimeType: "text/markdown",
    },
    text: "plain text",
    textBytes: new TextEncoder().encode("plain text"),
    updatedEvent: {
      id: txtFile.id,
      name: "Draft.md",
      mimeType: "text/markdown",
      sizeBytes: 10,
      storageType: txtFile.storageType,
      storagePath: txtFile.storagePath,
      updatedAt: new Date("2026-05-07T00:00:00.000Z"),
    },
  });

  const view = render(
    <MemoryRouter>
      <DocumentEditorPage
        fileId={txtFile.id}
        files={[txtFile]}
        folders={[]}
        editorFontSizePx={16}
        attachmentSettings={attachmentSettings}
        onFileUpdated={handleFileUpdated}
      />
    </MemoryRouter>,
  );

  await waitFor(() => {
    expect(getSourceText(view.getByRole("textbox", { name: "Document source" }))).toBe(
      "plain text",
    );
  });

  fireEvent.click(view.getByRole("button", { name: "Preview" }));

  await waitFor(() => {
    expect(view.getByText("Upgrade Draft.txt to Markdown?")).not.toBeNull();
  });

  const confirmButton = view.getByText("Upgrade").closest("button");
  expect(confirmButton).not.toBeNull();
  fireEvent.click(confirmButton!);

  await waitFor(() => {
    expect(persistenceState.upgradeTextFileToMarkdown).toHaveBeenCalledWith({
      file: expect.objectContaining({ id: txtFile.id, name: "Draft.txt" }),
      text: "plain text",
      files: [txtFile],
    });
  });
  expect(handleFileUpdated).toHaveBeenCalledWith(
    expect.objectContaining({
      id: txtFile.id,
      name: "Draft.md",
      mimeType: "text/markdown",
    }),
  );
});

test("switches txt files into wysiwyg mode after confirming the markdown upgrade", async () => {
  const txtFile = createFile({
    id: "document-3",
    name: "Draft.txt",
    mimeType: "text/plain",
    storagePath: "/files/document-3/document-3.txt",
  });

  persistenceState.readTextDocumentBytes.mockResolvedValue(new TextEncoder().encode("plain text"));
  persistenceState.upgradeTextFileToMarkdown.mockResolvedValue({
    file: {
      ...txtFile,
      name: "Draft.md",
      mimeType: "text/markdown",
    },
    text: "plain text",
    textBytes: new TextEncoder().encode("plain text"),
    updatedEvent: {
      id: txtFile.id,
      name: "Draft.md",
      mimeType: "text/markdown",
      sizeBytes: 10,
      storageType: txtFile.storageType,
      storagePath: txtFile.storagePath,
      updatedAt: new Date("2026-05-07T00:00:00.000Z"),
    },
  });

  const view = render(
    <MemoryRouter>
      <DocumentEditorPage
        fileId={txtFile.id}
        files={[txtFile]}
        folders={[]}
        editorFontSizePx={16}
        attachmentSettings={attachmentSettings}
      />
    </MemoryRouter>,
  );

  await waitFor(() => {
    expect(getSourceText(view.getByRole("textbox", { name: "Document source" }))).toBe(
      "plain text",
    );
  });

  fireEvent.click(view.getByRole("button", { name: "Preview" }));

  await waitFor(() => {
    expect(view.getByText("Upgrade Draft.txt to Markdown?")).not.toBeNull();
  });

  fireEvent.click(view.getByText("Upgrade").closest("button")!);

  await waitFor(() => {
    expect(view.getByRole("button", { name: "Preview" }).getAttribute("aria-pressed")).toBe("true");
  });

  expect(view.getByTestId("wysiwyg-document-editor")).not.toBeNull();
});

test("upgrades unsafe txt metadata but keeps its content in code mode", async () => {
  const handleFileUpdated = vi.fn();
  const unsafeMarkdown = '<a href="https://example.com">link</a>';
  const txtFile = createFile({
    id: "document-unsafe-txt",
    name: "Unsafe.txt",
    mimeType: "text/plain",
    storagePath: "/files/document-unsafe-txt/document-unsafe-txt.txt",
  });
  const markdownFile = {
    ...txtFile,
    name: "Unsafe.md",
    mimeType: "text/markdown",
  };

  persistenceState.readTextDocumentBytes.mockResolvedValue(
    new TextEncoder().encode(unsafeMarkdown),
  );
  persistenceState.upgradeTextFileToMarkdown.mockResolvedValue({
    file: markdownFile,
    text: unsafeMarkdown,
    textBytes: new TextEncoder().encode(unsafeMarkdown),
    updatedEvent: {
      id: txtFile.id,
      name: markdownFile.name,
      mimeType: markdownFile.mimeType,
      sizeBytes: unsafeMarkdown.length,
      storageType: txtFile.storageType,
      storagePath: txtFile.storagePath,
      updatedAt: new Date("2026-07-15T11:00:00.000Z"),
    },
  });

  const view = render(
    <MemoryRouter>
      <DocumentEditorPage
        fileId={txtFile.id}
        files={[txtFile]}
        folders={[]}
        editorFontSizePx={16}
        attachmentSettings={attachmentSettings}
        onFileUpdated={handleFileUpdated}
      />
    </MemoryRouter>,
  );

  await waitFor(() => {
    expect(getSourceText(view.getByRole("textbox", { name: "Document source" }))).toBe(
      unsafeMarkdown,
    );
  });
  fireEvent.click(view.getByRole("button", { name: "Preview" }));
  await waitFor(() => {
    expect(view.getByText("Upgrade Unsafe.txt to Markdown?")).not.toBeNull();
  });
  fireEvent.click(view.getByText("Upgrade").closest("button")!);

  await waitFor(() => {
    expect(handleFileUpdated).toHaveBeenCalledWith(
      expect.objectContaining({
        id: txtFile.id,
        name: "Unsafe.md",
        mimeType: "text/markdown",
      }),
    );
  });
  expect(view.getByRole("button", { name: "Code" }).getAttribute("aria-pressed")).toBe("true");
  expect(view.getByText(/converting this document would change its Markdown/i)).not.toBeNull();
  expect(view.queryByTestId("wysiwyg-document-editor")).toBeNull();
});

test("shows the attachment action in the source-mode editor shell", async () => {
  persistenceState.readTextDocumentBytes.mockResolvedValue(new TextEncoder().encode("# Draft\n"));

  const view = render(
    <MemoryRouter>
      <DocumentEditorPage
        fileId="document-1"
        files={[createFile()]}
        folders={[]}
        editorFontSizePx={16}
        attachmentSettings={attachmentSettings}
        initialMode="source"
      />
    </MemoryRouter>,
  );

  await waitFor(() => {
    expect(getSourceText(view.getByRole("textbox", { name: "Document source" }))).toBe("# Draft\n");
  });

  expect(view.getByRole("menuitem", { name: /Attach image/ })).not.toBeNull();
});
