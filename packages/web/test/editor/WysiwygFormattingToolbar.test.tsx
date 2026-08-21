import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { JSDOM } from "jsdom";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";

import { WysiwygDocumentEditor } from "@/components/editor/WysiwygDocumentEditor";

interface MockRangeRect {
  bottom: number;
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
  x: number;
  y: number;
}

const DEFAULT_RANGE_RECT: MockRangeRect = {
  bottom: 88,
  height: 20,
  left: 120,
  right: 220,
  top: 68,
  width: 100,
  x: 120,
  y: 68,
};

let rangeRect = { ...DEFAULT_RANGE_RECT };

const findTextNode = (root: HTMLElement, text: string): Text => {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    if (node.textContent?.includes(text)) {
      return node as Text;
    }
    node = walker.nextNode();
  }

  throw new Error(`Could not find text node containing ${text}`);
};

const selectText = (editor: HTMLElement, text: string, start = 0, end = text.length): void => {
  const textNode = findTextNode(editor, text);
  const textOffset = textNode.textContent?.indexOf(text) ?? -1;
  const range = document.createRange();
  range.setStart(textNode, textOffset + start);
  range.setEnd(textNode, textOffset + end);

  editor.focus();
  fireEvent.pointerDown(editor, { button: 0, pointerType: "mouse" });
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  document.dispatchEvent(new Event("selectionchange"));
};

const selectEditorOffsets = (editor: HTMLElement, start: number, end: number): void => {
  const textNodes = Array.from(editor.querySelectorAll<HTMLElement>("[data-lexical-text='true']"))
    .map((element) => {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      return walker.nextNode();
    })
    .filter((node): node is Text => node instanceof Text);
  const findPoint = (offset: number, isStart: boolean): { node: Text; offset: number } => {
    let consumed = 0;
    for (const node of textNodes) {
      const length = node.data.length;
      const isPointInNode = isStart ? offset < consumed + length : offset <= consumed + length;
      if (isPointInNode) {
        return { node, offset: offset - consumed };
      }
      consumed += length;
    }

    const lastNode = textNodes.at(-1);
    if (!lastNode || offset !== consumed) {
      throw new Error(`Selection offset ${offset} is outside editor text`);
    }
    return { node: lastNode, offset: lastNode.data.length };
  };

  const anchor = findPoint(start, true);
  const focus = findPoint(end, false);
  const range = document.createRange();
  range.setStart(anchor.node, anchor.offset);
  range.setEnd(focus.node, focus.offset);

  editor.focus();
  fireEvent.pointerDown(editor, { button: 0, pointerType: "mouse" });
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  document.dispatchEvent(new Event("selectionchange"));
};

const selectEditorText = (editor: HTMLElement, text: string): void => {
  const start = editor.textContent?.indexOf(text) ?? -1;
  if (start < 0) {
    throw new Error(`Could not find ${text} in editor`);
  }
  selectEditorOffsets(editor, start, start + text.length);
};

const setupDom = (): void => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/",
  });
  const requestAnimationFrame = (callback: FrameRequestCallback) => {
    return dom.window.setTimeout(() => callback(0), 0);
  };
  const cancelAnimationFrame = (handle: number) => {
    dom.window.clearTimeout(handle);
  };

  Object.defineProperty(dom.window.Range.prototype, "getBoundingClientRect", {
    configurable: true,
    value: () => ({
      ...rangeRect,
      toJSON: () => ({}),
    }),
  });
  Object.defineProperty(dom.window.HTMLElement.prototype, "attachEvent", {
    configurable: true,
    value() {},
  });
  Object.defineProperty(dom.window.HTMLElement.prototype, "detachEvent", {
    configurable: true,
    value() {},
  });
  dom.window.requestAnimationFrame = requestAnimationFrame;
  dom.window.cancelAnimationFrame = cancelAnimationFrame;

  vi.stubGlobal("window", dom.window);
  vi.stubGlobal("document", dom.window.document);
  vi.stubGlobal("navigator", dom.window.navigator);
  vi.stubGlobal("HTMLElement", dom.window.HTMLElement);
  vi.stubGlobal("HTMLAnchorElement", dom.window.HTMLAnchorElement);
  vi.stubGlobal("DOMParser", dom.window.DOMParser);
  vi.stubGlobal("Event", dom.window.Event);
  vi.stubGlobal("KeyboardEvent", dom.window.KeyboardEvent);
  vi.stubGlobal("MouseEvent", dom.window.MouseEvent);
  vi.stubGlobal("MutationObserver", dom.window.MutationObserver);
  vi.stubGlobal("Node", dom.window.Node);
  vi.stubGlobal("NodeFilter", dom.window.NodeFilter);
  vi.stubGlobal("Range", dom.window.Range);
  vi.stubGlobal("Text", dom.window.Text);
  vi.stubGlobal("requestAnimationFrame", requestAnimationFrame);
  vi.stubGlobal("cancelAnimationFrame", cancelAnimationFrame);
  vi.stubGlobal("getComputedStyle", dom.window.getComputedStyle.bind(dom.window));
};

beforeEach(() => {
  rangeRect = { ...DEFAULT_RANGE_RECT };
  setupDom();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

test("shows selection formatting controls only for a non-collapsed text selection", async () => {
  const view = render(<WysiwygDocumentEditor text="alpha beta" onTextChange={() => {}} />);
  const editor = view.getByRole("textbox", { name: "Document wysiwyg editor" });

  expect(view.queryByRole("toolbar", { name: "Text formatting" })).toBeNull();

  selectText(editor, "alpha");
  expect(document.activeElement).toBe(editor);
  expect(window.getSelection()?.toString()).toBe("alpha");

  const toolbar = await view.findByRole("toolbar", { name: "Text formatting" });
  expect(toolbar.hidden).toBe(false);
  expect(view.getByRole("button", { name: "Bold" })).not.toBeNull();
  expect(view.getByRole("button", { name: "Italic" })).not.toBeNull();
  expect(view.getByRole("button", { name: "Strikethrough" })).not.toBeNull();
  expect(view.getByRole("button", { name: "Inline code" })).not.toBeNull();
  expect(view.getByRole("button", { name: "Link" })).not.toBeNull();

  selectText(editor, "alpha", 2, 2);

  await waitFor(() => {
    expect(view.queryByRole("toolbar", { name: "Text formatting" })).toBeNull();
  });
});

test("does not restore a stale toolbar after a collapsed selection is refocused", async () => {
  const view = render(
    <>
      <button type="button">Outside</button>
      <WysiwygDocumentEditor text="alpha beta" onTextChange={() => {}} />
    </>,
  );
  const editor = view.getByRole("textbox", { name: "Document wysiwyg editor" });
  selectText(editor, "alpha");
  await view.findByRole("toolbar", { name: "Text formatting" });

  selectText(editor, "alpha", 2, 2);
  await waitFor(() => {
    expect(view.queryByRole("toolbar", { name: "Text formatting" })).toBeNull();
  });

  view.getByRole("button", { name: "Outside" }).focus();
  editor.focus();
  fireEvent.focusIn(editor);

  expect(document.activeElement).toBe(editor);
  expect(view.queryByRole("toolbar", { name: "Text formatting" })).toBeNull();
});

test("reports unformatted, uniformly formatted, and mixed selection states", async () => {
  const plainView = render(<WysiwygDocumentEditor text="alpha beta" onTextChange={() => {}} />);
  const plainEditor = plainView.getByRole("textbox", { name: "Document wysiwyg editor" });
  selectEditorText(plainEditor, "alpha");
  expect(
    (await plainView.findByRole("button", { name: "Bold" })).getAttribute("aria-pressed"),
  ).toBe("false");
  cleanup();

  const boldView = render(<WysiwygDocumentEditor text="**alpha** beta" onTextChange={() => {}} />);
  const boldEditor = boldView.getByRole("textbox", { name: "Document wysiwyg editor" });
  selectEditorText(boldEditor, "alpha");
  expect((await boldView.findByRole("button", { name: "Bold" })).getAttribute("aria-pressed")).toBe(
    "true",
  );
  cleanup();

  const mixedView = render(<WysiwygDocumentEditor text="**alpha** beta" onTextChange={() => {}} />);
  const mixedEditor = mixedView.getByRole("textbox", { name: "Document wysiwyg editor" });
  selectEditorOffsets(mixedEditor, 0, "alpha beta".length);
  expect(
    (await mixedView.findByRole("button", { name: "Bold" })).getAttribute("aria-pressed"),
  ).toBe("mixed");
});

test("preserves the DOM selection on pointer activation and restores it for click activation", async () => {
  const onTextChange = vi.fn();
  const view = render(<WysiwygDocumentEditor text="alpha beta" onTextChange={onTextChange} />);
  const editor = view.getByRole("textbox", { name: "Document wysiwyg editor" });
  selectEditorText(editor, "alpha");
  const boldButton = await view.findByRole("button", { name: "Bold" });

  expect(fireEvent.pointerDown(boldButton, { button: 0, pointerType: "mouse" })).toBe(false);
  expect(window.getSelection()?.toString()).toBe("alpha");
  expect(boldButton.tabIndex).toBe(0);

  boldButton.focus();
  window.getSelection()?.removeAllRanges();
  fireEvent.click(boldButton);

  await waitFor(() => {
    expect(onTextChange).toHaveBeenLastCalledWith("**alpha** beta");
  });
});

test("repositions the visible toolbar when the viewport scrolls or resizes", async () => {
  const view = render(<WysiwygDocumentEditor text="alpha beta" onTextChange={() => {}} />);
  const editor = view.getByRole("textbox", { name: "Document wysiwyg editor" });
  selectEditorText(editor, "alpha");
  const toolbar = await view.findByRole("toolbar", { name: "Text formatting" });
  expect(toolbar.style.left).toBe("60px");
  expect(toolbar.style.top).toBe("20px");

  rangeRect = {
    bottom: 220,
    height: 20,
    left: 300,
    right: 380,
    top: 200,
    width: 80,
    x: 300,
    y: 200,
  };
  fireEvent.scroll(window);

  await waitFor(() => {
    expect(toolbar.style.left).toBe("230px");
    expect(toolbar.style.top).toBe("152px");
  });

  rangeRect = {
    bottom: 120,
    height: 20,
    left: 40,
    right: 80,
    top: 100,
    width: 40,
    x: 40,
    y: 100,
  };
  fireEvent.resize(window);

  await waitFor(() => {
    expect(toolbar.style.left).toBe("8px");
    expect(toolbar.style.top).toBe("52px");
  });
});

test("moves focus between toolbar controls with horizontal arrow keys", async () => {
  const view = render(<WysiwygDocumentEditor text="alpha beta" onTextChange={() => {}} />);
  const editor = view.getByRole("textbox", { name: "Document wysiwyg editor" });
  selectEditorText(editor, "alpha");
  const boldButton = await view.findByRole("button", { name: "Bold" });
  const italicButton = view.getByRole("button", { name: "Italic" });
  boldButton.focus();

  fireEvent.keyDown(boldButton, { key: "ArrowRight" });
  expect(document.activeElement).toBe(italicButton);

  fireEvent.keyDown(italicButton, { key: "ArrowLeft" });
  expect(document.activeElement).toBe(boldButton);
  expect(boldButton.tabIndex).toBe(0);
  expect(italicButton.tabIndex).toBe(0);
});

test.each([
  ["Bold", "**alpha** beta"],
  ["Italic", "*alpha* beta"],
  ["Strikethrough", "~~alpha~~ beta"],
  ["Inline code", "`alpha` beta"],
] as const)(
  "applies and removes %s while publishing Markdown",
  async (label, formattedMarkdown) => {
    const onApplyTextChange = vi.fn();
    const applyView = render(
      <WysiwygDocumentEditor text="alpha beta" onTextChange={onApplyTextChange} />,
    );
    const applyEditor = applyView.getByRole("textbox", { name: "Document wysiwyg editor" });
    selectEditorText(applyEditor, "alpha");

    fireEvent.click(await applyView.findByRole("button", { name: label }));
    await waitFor(() => {
      expect(onApplyTextChange).toHaveBeenLastCalledWith(formattedMarkdown);
    });
    cleanup();

    const onRemoveTextChange = vi.fn();
    const removeView = render(
      <WysiwygDocumentEditor text={formattedMarkdown} onTextChange={onRemoveTextChange} />,
    );
    const removeEditor = removeView.getByRole("textbox", {
      name: "Document wysiwyg editor",
    });
    selectEditorText(removeEditor, "alpha");
    fireEvent.click(await removeView.findByRole("button", { name: label }));
    await waitFor(() => {
      expect(onRemoveTextChange).toHaveBeenLastCalledWith("alpha beta");
    });
  },
);

test.each([
  ["**alpha** beta", "Bold"],
  ["*alpha* beta", "Italic"],
  ["~~alpha~~ beta", "Strikethrough"],
  ["`alpha` beta", "Inline code"],
] as const)(
  "applies %s across a mixed range whose first node is formatted",
  async (text, label) => {
    const onTextChange = vi.fn();
    const view = render(<WysiwygDocumentEditor text={text} onTextChange={onTextChange} />);
    const editor = view.getByRole("textbox", { name: "Document wysiwyg editor" });
    selectEditorOffsets(editor, 0, editor.textContent?.length ?? 0);

    fireEvent.click(await view.findByRole("button", { name: label }));

    const marker =
      label === "Bold" ? "**" : label === "Italic" ? "*" : label === "Strikethrough" ? "~~" : "`";
    await waitFor(() => {
      expect(onTextChange).toHaveBeenLastCalledWith(`${marker}alpha beta${marker}`);
    });
    expect(onTextChange.mock.calls).toEqual([[`${marker}alpha beta${marker}`]]);
  },
);

test("publishes a mixed-format application once and undoes it in one step", async () => {
  const originalMarkdown = "**alpha** beta";
  const formattedMarkdown = "**alpha beta**";
  const onTextChange = vi.fn();
  const view = render(
    <WysiwygDocumentEditor text={originalMarkdown} onTextChange={onTextChange} />,
  );
  const editor = view.getByRole("textbox", { name: "Document wysiwyg editor" });
  selectEditorOffsets(editor, 0, "alpha beta".length);

  fireEvent.click(await view.findByRole("button", { name: "Bold" }));

  await waitFor(() => {
    expect(onTextChange).toHaveBeenLastCalledWith(formattedMarkdown);
  });
  expect(onTextChange.mock.calls).toEqual([[formattedMarkdown]]);

  view.rerender(<WysiwygDocumentEditor text={formattedMarkdown} onTextChange={onTextChange} />);
  fireEvent.keyDown(editor, { ctrlKey: true, key: "z" });

  await waitFor(() => {
    expect(onTextChange).toHaveBeenLastCalledWith(originalMarkdown);
  });
  expect(onTextChange.mock.calls).toEqual([[formattedMarkdown], [originalMarkdown]]);
});

test.each([
  ["b", "**alpha** beta"],
  ["i", "*alpha* beta"],
] as const)(
  "keeps the primary modifier+%s formatting shortcut publishing Markdown",
  async (key, markdown) => {
    const onTextChange = vi.fn();
    const view = render(<WysiwygDocumentEditor text="alpha beta" onTextChange={onTextChange} />);
    const editor = view.getByRole("textbox", { name: "Document wysiwyg editor" });
    selectEditorText(editor, "alpha");

    fireEvent.keyDown(editor, { ctrlKey: true, key });

    await waitFor(() => {
      expect(onTextChange).toHaveBeenLastCalledWith(markdown);
    });
  },
);

test.each([
  "https://example.com/notes",
  "http://example.com/notes",
  "mailto:reader@example.com",
  "notes/topic.md",
  "../notes/topic.md",
  "/notes/topic",
  "#topic",
  "/search?q=alpha&sort=recent",
])("creates a Markdown link for the safe destination %s", async (destination) => {
  const onTextChange = vi.fn();
  const view = render(<WysiwygDocumentEditor text="alpha beta" onTextChange={onTextChange} />);
  const editor = view.getByRole("textbox", { name: "Document wysiwyg editor" });
  vi.spyOn(window, "prompt").mockReturnValue(`  ${destination}  `);
  selectEditorText(editor, "alpha");

  fireEvent.click(await view.findByRole("button", { name: "Link" }));

  await waitFor(() => {
    expect(onTextChange).toHaveBeenLastCalledWith(`[alpha](${destination}) beta`);
  });
});

test("unlinks a fully linked selection without prompting", async () => {
  const onTextChange = vi.fn();
  const prompt = vi.spyOn(window, "prompt");
  const view = render(
    <WysiwygDocumentEditor text="[alpha](https://example.com) beta" onTextChange={onTextChange} />,
  );
  const editor = view.getByRole("textbox", { name: "Document wysiwyg editor" });
  selectEditorText(editor, "alpha");
  const linkButton = await view.findByRole("button", { name: "Link" });
  expect(linkButton.getAttribute("aria-pressed")).toBe("true");

  fireEvent.click(linkButton);

  await waitFor(() => {
    expect(onTextChange).toHaveBeenLastCalledWith("alpha beta");
  });
  expect(prompt).not.toHaveBeenCalled();
});

test.each(["[alpha](/a) beta", "[alpha](/a) [beta](/b)"])(
  "reports a partial or multiple-link selection as mixed for %s",
  async (markdown) => {
    const view = render(<WysiwygDocumentEditor text={markdown} onTextChange={() => {}} />);
    const editor = view.getByRole("textbox", { name: "Document wysiwyg editor" });
    selectEditorOffsets(editor, 0, "alpha beta".length);

    expect((await view.findByRole("button", { name: "Link" })).getAttribute("aria-pressed")).toBe(
      "mixed",
    );
  },
);

test.each([
  null,
  "",
  "   ",
  "javascript:alert(1)",
  "data:text/plain,hello",
  "vbscript:msgbox(1)",
  "ftp://example.com/file",
  "//example.com/path",
  "https://example.com/bad path",
  "notes/\u0000topic",
  "java&#x73;cript&colon;alert(1)",
  "java&#115;cript:alert(1)",
  "java\\script:alert(1)",
  "javascript\\:alert(1)",
])("does not change Markdown for a cancelled or unsafe destination %s", async (destination) => {
  const onTextChange = vi.fn();
  const view = render(<WysiwygDocumentEditor text="alpha beta" onTextChange={onTextChange} />);
  const editor = view.getByRole("textbox", { name: "Document wysiwyg editor" });
  vi.spyOn(window, "prompt").mockReturnValue(destination);
  selectEditorText(editor, "alpha");

  fireEvent.click(await view.findByRole("button", { name: "Link" }));

  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(onTextChange).not.toHaveBeenCalled();
});

test("Escape restores the editor selection and focus", async () => {
  const view = render(<WysiwygDocumentEditor text="alpha beta" onTextChange={() => {}} />);
  const editor = view.getByRole("textbox", { name: "Document wysiwyg editor" });
  selectEditorText(editor, "alpha");
  const boldButton = await view.findByRole("button", { name: "Bold" });
  boldButton.focus();
  window.getSelection()?.removeAllRanges();

  fireEvent.keyDown(boldButton, { key: "Escape" });

  await waitFor(() => {
    expect(document.activeElement).toBe(editor);
    expect(window.getSelection()?.toString()).toBe("alpha");
  });
});
