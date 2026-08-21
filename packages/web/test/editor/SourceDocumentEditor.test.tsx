import { act, cleanup, render } from "@testing-library/react";
import { JSDOM } from "jsdom";
import { beforeEach, expect, test, vi } from "vite-plus/test";
import { readFileSync } from "node:fs";
import { EditorView } from "@codemirror/view";
import {
  $getRoot,
  $getSelection,
  $isNodeSelection,
  $isRangeSelection,
  createEditor,
} from "lexical";
import { createRef, useState, type JSX } from "react";

import {
  SourceDocumentEditor,
  type SourceDocumentEditorHandle,
} from "@/components/editor/SourceDocumentEditor";
import type { MarkdownSafetyDiagnostic } from "@/lib/editor/markdownRoundTripGuard";
import {
  getEscapedMarkdownLinkTextOffset,
  getFormattedTextLabelOffsetFromSourceOffset,
  getFormattedTextSourceText,
  getImageMarkdownSourceText,
  getMarkdownLinkLabelOffsetFromSourceOffset,
  deleteMarkdownHeadingPrefixCharacter,
  prependMarkdownSourcePrefix,
} from "@/components/editor/WysiwygDocumentEditor";
import { ImageNode } from "@/components/editor/lexical/ImageNode";
import { MathNode } from "@/components/editor/lexical/MathNode";
import {
  MarkdownHeadingNode,
  getMarkdownSourceMarkerOffset,
} from "@/components/editor/lexical/MarkdownSourceNodes";

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

test("marks safety diagnostics and reveals them through the editor handle", () => {
  const diagnostic: MarkdownSafetyDiagnostic = {
    column: 3,
    from: 2,
    line: 1,
    message: 'Line 1: "[]" would become "[ ]".',
    replacementText: "[ ]",
    sourceText: "[]",
    to: 4,
  };
  const editorRef = createRef<SourceDocumentEditorHandle>();
  const view = render(
    <SourceDocumentEditor
      ref={editorRef}
      text="- [] item"
      onTextChange={() => {}}
      diagnostics={[diagnostic]}
    />,
  );

  expect(view.container.querySelector(".cm-markdown-safety-diagnostic")).not.toBeNull();
  expect(view.getByRole("button", { name: diagnostic.message })).not.toBeNull();

  editorRef.current?.revealDiagnostic();
  const editorView = getCodeMirrorView(view.container);
  expect(editorView.state.selection.main.from).toBe(2);
  expect(editorView.state.selection.main.to).toBe(4);
});

test("clears diagnostic decorations when diagnostics are removed", () => {
  const diagnostic: MarkdownSafetyDiagnostic = {
    column: 3,
    from: 2,
    line: 1,
    message: 'Line 1: "[]" would become "[ ]".',
    replacementText: "[ ]",
    sourceText: "[]",
    to: 4,
  };
  const view = render(
    <SourceDocumentEditor text="- [] item" onTextChange={() => {}} diagnostics={[diagnostic]} />,
  );
  expect(view.container.querySelector(".cm-markdown-safety-diagnostic")).not.toBeNull();

  view.rerender(<SourceDocumentEditor text="- [] item" onTextChange={() => {}} diagnostics={[]} />);

  expect(view.container.querySelector(".cm-markdown-safety-diagnostic")).toBeNull();
  expect(view.queryByRole("button", { name: diagnostic.message })).toBeNull();
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

test("mounts selection formatting without current-block source interception", () => {
  const sourceEditorSource = readFileSync(
    new URL("../../src/components/editor/SourceDocumentEditor.tsx", import.meta.url),
    "utf8",
  );
  const wysiwygEditorSource = readFileSync(
    new URL("../../src/components/editor/WysiwygDocumentEditor.tsx", import.meta.url),
    "utf8",
  );
  const markdownSourceNodesSource = readFileSync(
    new URL("../../src/components/editor/lexical/MarkdownSourceNodes.ts", import.meta.url),
    "utf8",
  );
  const mountedEditorSource = wysiwygEditorSource.slice(
    wysiwygEditorSource.indexOf("export const WysiwygDocumentEditor"),
  );

  expect(sourceEditorSource).not.toContain("Current source");
  expect(wysiwygEditorSource).toContain("CurrentBlockSourcePlugin");
  expect(mountedEditorSource).not.toContain("<CurrentBlockSourcePlugin");
  expect(mountedEditorSource).toContain("<WysiwygFormattingToolbar />");
  expect(mountedEditorSource).not.toContain("editableMarkdownSourceRef");
  expect(mountedEditorSource).toContain("const markdown = exportWysiwygMarkdown(editorState);");
  expect(mountedEditorSource).toContain("commitMarkdown(markdown);");
  expect(wysiwygEditorSource).toContain("text-[var(--color-memora-olive)]");
  expect(wysiwygEditorSource).not.toContain("text-blue-700");
  expect(wysiwygEditorSource).not.toContain("#3f7fc4");
  expect(wysiwygEditorSource).toContain("var(--color-memora-accent)");
  expect(wysiwygEditorSource).toContain("editableMarkdownSourceRef.current");
  expect(wysiwygEditorSource).toContain("onEditableMarkdownSourceCommit");
  expect(mountedEditorSource).not.toContain("if (editableMarkdownSourceRef.current)");
  expect(wysiwygEditorSource).toContain("editableMarkdownSourceRef.current = null;");
  expect(wysiwygEditorSource).toContain("previewNodeKey");
  expect(wysiwygEditorSource).toContain("sourceTextNode.setFormat(IS_CODE);");
  expect(wysiwygEditorSource).toContain("node.insertBefore(paragraphNode);");
  expect(wysiwygEditorSource).toContain("parseMarkdownLinkedImage(sourceText.trim())");
  expect(wysiwygEditorSource).toContain("parseMathBlock(sourceText)");
  expect(wysiwygEditorSource).toContain(
    'kind: "inline-math",\n        nodeKey: sourceTextNode.getKey(),\n        sourceNodeKeys: [sourceTextNode.getKey()]',
  );
  expect(wysiwygEditorSource).toContain("restoredEditableMarkdownSourceNodeKey");
  expect(wysiwygEditorSource).toContain(
    "activeMarkdownSourceNode.getKey() !== restoredEditableMarkdownSourceNodeKey",
  );
  expect(wysiwygEditorSource).toContain("node.setTextContent(sourceText);");
  expect(wysiwygEditorSource).toContain("node.toggleUnmergeable();");
  expect(wysiwygEditorSource).toContain("node.isUnmergeable()");
  expect(wysiwygEditorSource).not.toContain(
    "node.replace(sourceTextNode);\n    selectTextNodeOffset(\n      sourceTextNode,\n      getFormattedTextSourceOffsetFromLabelOffset",
  );
  expect(wysiwygEditorSource).toContain("[HISTORY_MERGE_TAG, HISTORIC_TAG]");
  expect(wysiwygEditorSource).toContain(
    "return getFormattedTextKind(anchorNode) ? anchorNode : null",
  );
  expect(wysiwygEditorSource).toContain("return;");
  expect(
    wysiwygEditorSource.indexOf("deactivateEditableMarkdownSource(editableMarkdownSource)"),
  ).toBeLessThan(
    wysiwygEditorSource.indexOf("const activeMarkdownSourceNode = getActiveMarkdownSourceNode()"),
  );
  expect(wysiwygEditorSource).not.toContain("replacement.setIndent(node.getIndent())");
  expect(wysiwygEditorSource).toContain("registerNodeTransform(HeadingNode");
  expect(wysiwygEditorSource).toContain("registerNodeTransform(ListItemNode");
  expect(markdownSourceNodesSource).toContain("class MarkdownHeadingNode extends HeadingNode");
  expect(markdownSourceNodesSource).toContain("class MarkdownListItemNode extends ListItemNode");
  expect(markdownSourceNodesSource).toContain(
    'element.setAttribute("data-active-markdown-source", "true")',
  );
  expect(markdownSourceNodesSource).toContain('element.style.whiteSpace = "pre-wrap"');
  expect(markdownSourceNodesSource).toContain('element.style.listStyleType = "none"');
  expect(markdownSourceNodesSource).not.toContain('element.style.all = "unset"');
  expect(wysiwygEditorSource).toContain("prependMarkdownSourcePrefix");
  expect(wysiwygEditorSource).toContain("removeMarkdownSourcePrefix");
  expect(wysiwygEditorSource).toContain("onEditableMarkdownSourceCommitRef.current");
  expect(wysiwygEditorSource).not.toContain(
    "[editor, editableMarkdownSourceRef, onEditableMarkdownSourceCommit]",
  );
  expect(wysiwygEditorSource).toContain('<div className="relative">');
  expect(wysiwygEditorSource).toContain("absolute left-0 top-0 leading-7");
});

test("reserves enough gutter space for active checklist markdown markers", () => {
  expect(getMarkdownSourceMarkerOffset("- ")).toBe("-2.5ch");
  expect(getMarkdownSourceMarkerOffset("- [] ")).toBe("-5.5ch");
  expect(getMarkdownSourceMarkerOffset("- [ ] ")).toBe("-6.5ch");
});

test("keeps the cursor after the visible heading marker for a new empty heading", () => {
  const editor = createEditor({
    nodes: [MarkdownHeadingNode],
    onError: (error) => {
      throw error;
    },
  });

  editor.update(
    () => {
      const headingNode = new MarkdownHeadingNode("h1");
      $getRoot().append(headingNode);
      headingNode.selectStart();

      prependMarkdownSourcePrefix(headingNode);

      const selection = $getSelection();
      if (!$isRangeSelection(selection)) {
        throw new Error("Expected a range selection after showing the heading marker");
      }
      expect(selection.anchor.getNode().getTextContent()).toBe("# ");
      expect(selection.anchor.offset).toBe(2);
    },
    { discrete: true },
  );
});

test("lets backspace remove the editable heading marker space", () => {
  const editor = createEditor({
    nodes: [MarkdownHeadingNode],
    onError: (error) => {
      throw error;
    },
  });

  editor.update(
    () => {
      const headingNode = new MarkdownHeadingNode("h1");
      $getRoot().append(headingNode);
      headingNode.selectStart();
      prependMarkdownSourcePrefix(headingNode);

      expect(deleteMarkdownHeadingPrefixCharacter(headingNode)).toBe(true);

      const selection = $getSelection();
      if (!$isRangeSelection(selection)) {
        throw new Error("Expected a range selection after deleting the heading marker space");
      }
      expect(selection.anchor.getNode().getTextContent()).toBe("#");
      expect(selection.anchor.offset).toBe(1);
    },
    { discrete: true },
  );
});

test("maps a rendered link label cursor offset into escaped markdown source", () => {
  expect(getEscapedMarkdownLinkTextOffset("alpha", 2)).toBe(2);
  expect(getEscapedMarkdownLinkTextOffset("a[b]c", 4)).toBe(6);
  expect(getMarkdownLinkLabelOffsetFromSourceOffset("[a\\[b\\]c](https://example.com)", 7)).toBe(4);
});

test("builds editable markdown source for inline formats and images", () => {
  expect(getFormattedTextSourceText("code", "code")).toBe("`code`");
  expect(getFormattedTextSourceText("bold", "粗体")).toBe("**粗体**");
  expect(getFormattedTextSourceText("bold-italic", "粗斜体")).toBe("***粗斜体***");
  expect(getFormattedTextSourceText("italic", "斜体字")).toBe("*斜体字*");
  expect(getFormattedTextSourceText("strikethrough", "删除线")).toBe("~~删除线~~");
  expect(getFormattedTextLabelOffsetFromSourceOffset("**粗体**", 4, "bold")).toBe(2);
  expect(getFormattedTextLabelOffsetFromSourceOffset("***粗斜体***", 5, "bold-italic")).toBe(2);
  expect(getFormattedTextLabelOffsetFromSourceOffset("~~删除线~~", 4, "strikethrough")).toBe(2);
  expect(getFormattedTextLabelOffsetFromSourceOffset("~~删除线~~ ", 10, "strikethrough")).toBe(3);
  expect(getImageMarkdownSourceText("cover", "https://example.com/cover.jpg", null)).toBe(
    "![cover](https://example.com/cover.jpg)",
  );
  expect(
    getImageMarkdownSourceText("cover", "https://example.com/cover.jpg", "https://example.com"),
  ).toBe("[![cover](https://example.com/cover.jpg)](https://example.com)");
});

test("keeps selected images visible while showing their markdown source", () => {
  const editor = createEditor({
    nodes: [ImageNode],
    onError: (error) => {
      throw error;
    },
  });
  const renderedImage = { current: null as JSX.Element | null };

  editor.update(
    () => {
      const imageNode = new ImageNode("https://example.com/cover.jpg", "cover");
      imageNode.setMarkdownSourceActive(true);
      renderedImage.current = imageNode.decorate({} as never, {} as never);
      expect(imageNode.isMarkdownSourceActive()).toBe(true);
    },
    { discrete: true },
  );

  expect(renderedImage.current?.props.children[0].props.children).toBe(
    "![cover](https://example.com/cover.jpg)",
  );
});

test("selects linked images on click without navigating", () => {
  const editor = createEditor({
    nodes: [ImageNode],
    onError: (error) => {
      throw error;
    },
  });
  const renderedImage = { current: null as JSX.Element | null };
  const imageKey = { current: "" };

  editor.update(
    () => {
      const imageNode = new ImageNode(
        "https://example.com/cover.jpg",
        "cover",
        "https://example.com",
      );
      imageKey.current = imageNode.getKey();
      $getRoot().append(imageNode);
      renderedImage.current = imageNode.decorate(editor, {} as never);
    },
    { discrete: true },
  );

  const preventDefault = vi.fn();
  const stopPropagation = vi.fn();
  renderedImage.current?.props.onClick({
    preventDefault,
    stopPropagation,
  });

  expect(preventDefault).toHaveBeenCalledOnce();
  expect(stopPropagation).toHaveBeenCalledOnce();
  editor.getEditorState().read(() => {
    const selection = $getSelection();
    expect($isNodeSelection(selection)).toBe(true);
    expect(selection?.getNodes().map((node) => node.getKey())).toEqual([imageKey.current]);
  });
});

test("keeps block math visible while showing its markdown source above the formula", () => {
  const editor = createEditor({
    nodes: [MathNode],
    onError: (error) => {
      throw error;
    },
  });
  const activeFormula = { current: null as JSX.Element | null };

  editor.update(
    () => {
      const mathNode = new MathNode("\\sum_{k=1}^n a_k", true);
      mathNode.setMarkdownSourceActive(true);
      activeFormula.current = mathNode.decorate({} as never, {} as never);
    },
    { discrete: true },
  );

  expect(activeFormula.current?.props.children[0].props.children).toBe("$$\\sum_{k=1}^n a_k$$");
  expect(activeFormula.current?.props.children[1].props.dangerouslySetInnerHTML.__html).toContain(
    "katex",
  );
});

test("selects formulas on click so markdown source can activate", () => {
  const editor = createEditor({
    nodes: [MathNode],
    onError: (error) => {
      throw error;
    },
  });
  const renderedFormula = { current: null as JSX.Element | null };
  const mathKey = { current: "" };

  editor.update(
    () => {
      const mathNode = new MathNode("\\sum_{k=1}^n a_k", true);
      mathKey.current = mathNode.getKey();
      $getRoot().append(mathNode);
      renderedFormula.current = mathNode.decorate(editor, {} as never);
    },
    { discrete: true },
  );

  const preventDefault = vi.fn();
  const stopPropagation = vi.fn();
  renderedFormula.current?.props.onClick({
    preventDefault,
    stopPropagation,
  });

  expect(preventDefault).toHaveBeenCalledOnce();
  expect(stopPropagation).toHaveBeenCalledOnce();
  editor.getEditorState().read(() => {
    const selection = $getSelection();
    expect($isNodeSelection(selection)).toBe(true);
    expect(selection?.getNodes().map((node) => node.getKey())).toEqual([mathKey.current]);
  });
});
