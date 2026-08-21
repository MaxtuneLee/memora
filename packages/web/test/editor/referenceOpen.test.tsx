import { cleanup, render, waitFor } from "@testing-library/react";
import { JSDOM } from "jsdom";
import { beforeEach, expect, test, vi } from "vite-plus/test";
import { MemoryRouter } from "react-router";
import { EditorView } from "@codemirror/view";

import { DocumentEditorPage } from "@/components/editor/DocumentEditorPage";
import type { FileMeta } from "@/types/library";

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
    name: overrides.name ?? "Current.md",
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
    url: "http://localhost/editor/file/current-doc",
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
  const editorView = editorElement ? EditorView.findFromDOM(editorElement) : null;
  if (!editorView) {
    throw new Error("Unable to resolve the CodeMirror EditorView.");
  }
  return editorView;
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
});

test("opens an anchored reference in source mode by navigating to the target editor route", async () => {
  const handleNavigateToHref = vi.fn();
  const currentFile = createFile({
    id: "current-doc",
    name: "Draft.md",
    parentId: "work-folder",
  });
  const targetFile = createFile({
    id: "target-doc",
    name: "parser.md",
    parentId: "notes-folder",
    storagePath: "/files/target-doc/target-doc.md",
  });

  persistenceState.readTextDocumentBytes.mockResolvedValue(new TextEncoder().encode("Draft body"));

  render(
    <MemoryRouter>
      <DocumentEditorPage
        fileId={currentFile.id}
        files={[currentFile, targetFile]}
        folders={[
          { id: "work-folder", name: "work", parentId: null },
          { id: "notes-folder", name: "notes", parentId: null },
        ]}
        editorFontSizePx={16}
        attachmentSettings={attachmentSettings}
        initialReferenceTarget="../notes/parser.md#L12-L18"
        onNavigateToHref={handleNavigateToHref}
      />
    </MemoryRouter>,
  );

  await waitFor(() => {
    expect(handleNavigateToHref).toHaveBeenCalledWith(
      "/editor/file/target-doc?mode=source&lineStart=12&lineEnd=18",
    );
  });
});

test("treats invalid anchors as unanchored and explains why no source range was selected", async () => {
  const currentFile = createFile({
    id: "current-doc",
    name: "Draft.md",
    parentId: "work-folder",
  });

  persistenceState.readTextDocumentBytes.mockResolvedValue(
    new TextEncoder().encode("first line\nsecond line\nthird line"),
  );

  const view = render(
    <MemoryRouter>
      <DocumentEditorPage
        fileId={currentFile.id}
        files={[currentFile]}
        folders={[{ id: "work-folder", name: "work", parentId: null }]}
        editorFontSizePx={16}
        attachmentSettings={attachmentSettings}
        initialReferenceTarget="./Draft.md#L18-L12"
      />
    </MemoryRouter>,
  );

  await waitFor(() => {
    expect(
      getSourceEditorView(
        view.getByRole("textbox", { name: "Document source" }),
      ).state.doc.toString(),
    ).toBe("first line\nsecond line\nthird line");
  });

  await waitFor(() => {
    expect(
      view.getByText(
        "Reference anchor was invalid, so the file opened without selecting a source range.",
      ),
    ).not.toBeNull();
  });

  const editorView = getSourceEditorView(view.getByRole("textbox", { name: "Document source" }));
  expect(editorView.state.selection.main.from).toBe(0);
  expect(editorView.state.selection.main.to).toBe(0);
});

test("opens a same-file anchored reference by revealing the requested source range", async () => {
  const currentFile = createFile({
    id: "current-doc",
    name: "Draft.md",
    parentId: "work-folder",
  });

  persistenceState.readTextDocumentBytes.mockResolvedValue(
    new TextEncoder().encode("first line\nsecond line\nthird line"),
  );

  const view = render(
    <MemoryRouter>
      <DocumentEditorPage
        fileId={currentFile.id}
        files={[currentFile]}
        folders={[{ id: "work-folder", name: "work", parentId: null }]}
        editorFontSizePx={16}
        attachmentSettings={attachmentSettings}
        initialReferenceTarget="./Draft.md#L2-L3"
      />
    </MemoryRouter>,
  );

  await waitFor(() => {
    expect(
      getSourceEditorView(
        view.getByRole("textbox", { name: "Document source" }),
      ).state.doc.toString(),
    ).toBe("first line\nsecond line\nthird line");
  });

  const editorView = getSourceEditorView(view.getByRole("textbox", { name: "Document source" }));
  expect(editorView.state.selection.main.from).toBe(11);
  expect(editorView.state.selection.main.to).toBe(33);
});
