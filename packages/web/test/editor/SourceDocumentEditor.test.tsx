import { act, cleanup, render } from "@testing-library/react";
import { JSDOM } from "jsdom";
import { beforeEach, expect, test, vi } from "vite-plus/test";
import { EditorView } from "@codemirror/view";
import { useState } from "react";

import { SourceDocumentEditor } from "@/components/editor/SourceDocumentEditor";

const setupDom = () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/",
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

  vi.stubGlobal("window", dom.window);
  vi.stubGlobal("document", dom.window.document);
  vi.stubGlobal("navigator", dom.window.navigator);
  vi.stubGlobal("HTMLElement", dom.window.HTMLElement);
  vi.stubGlobal("HTMLTextAreaElement", dom.window.HTMLTextAreaElement);
  vi.stubGlobal("MutationObserver", dom.window.MutationObserver);
  vi.stubGlobal("DOMRect", dom.window.DOMRect);
  vi.stubGlobal("Node", dom.window.Node);
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

const getCodeMirrorView = (container: HTMLElement): EditorView => {
  const editorElement = container.querySelector<HTMLElement>(".cm-editor");
  if (!editorElement) {
    throw new Error("Expected a CodeMirror editor.");
  }
  const editorView = EditorView.findFromDOM(editorElement);
  if (!editorView) {
    throw new Error("Expected an EditorView instance.");
  }
  return editorView;
};

beforeEach(() => {
  cleanup();
  setupDom();
});

test("reveals an external source range in the source editor selection", () => {
  const view = render(
    <SourceDocumentEditor
      text={"alpha\nbeta\ngamma\n"}
      onTextChange={() => {}}
      focusedLineStart={2}
      focusedLineEnd={3}
    />,
  );

  expect(view.getByRole("textbox", { name: "Document source" })).not.toBeNull();
  const editorView = getCodeMirrorView(view.container);
  expect(editorView.state.selection.main.from).toBe(6);
  expect(editorView.state.selection.main.to).toBe(16);
});

test("publishes controlled CodeMirror edits", () => {
  const ControlledEditor = () => {
    const [text, setText] = useState("alpha");
    return <SourceDocumentEditor text={text} onTextChange={setText} />;
  };
  const view = render(<ControlledEditor />);
  const editorView = getCodeMirrorView(view.container);

  editorView.dispatch({ changes: { from: 5, insert: " beta" } });

  expect(view.getByRole("textbox", { name: "Document source" }).textContent).toBe("alpha beta");
});

test("does not reapply an external line selection after the user edits", async () => {
  const ControlledEditor = () => {
    const [text, setText] = useState("alpha\nbeta\ngamma");
    return (
      <SourceDocumentEditor
        text={text}
        onTextChange={setText}
        focusedLineStart={2}
        focusedLineEnd={2}
      />
    );
  };
  const view = render(<ControlledEditor />);
  const editorView = getCodeMirrorView(view.container);
  expect(editorView.state.selection.main.from).toBe(6);
  expect(editorView.state.selection.main.to).toBe(10);

  await act(async () => {
    editorView.dispatch({
      changes: { from: editorView.state.doc.length, insert: "!" },
      selection: { anchor: editorView.state.doc.length + 1 },
    });
    await Promise.resolve();
  });

  expect(editorView.state.selection.main.from).toBe(17);
  expect(editorView.state.selection.main.to).toBe(17);
});

test("does not render a reference directory above the source editor", () => {
  const view = render(
    <SourceDocumentEditor
      text={"See [Parser notes](../notes/parser.md#L12-L18) for the full example."}
      onTextChange={() => {}}
    />,
  );

  expect(view.queryByText("References")).toBeNull();
  expect(view.queryByRole("button", { name: "Open Parser notes" })).toBeNull();
});
