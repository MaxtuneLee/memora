import { act } from "@testing-library/react";
import { useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { EditorView } from "@codemirror/view";

import { SourceDocumentEditor } from "@/components/editor/SourceDocumentEditor";
import { WysiwygDocumentEditor } from "@/components/editor/WysiwygDocumentEditor";
import type { MarkdownSafetyDiagnostic } from "@/lib/editor/markdownRoundTripGuard";
import { applyDocumentTheme, type ResolvedTheme } from "@/lib/theme/documentTheme";

// Computed-style checks only: no assertions on generated StyleX class names.
const rgb = (color: string): number[] => {
  const channels = color
    .match(/[\d.]+/g)
    ?.slice(0, 3)
    .map(Number);
  if (!channels || channels.length < 3) throw new Error(`Unparsed color: ${color}`);
  return channels;
};

const luminance = (color: string): number => {
  const [r, g, b] = rgb(color).map((value) => {
    const channel = value / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrast = (a: string, b: string): number => {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
};

const backgroundOf = (element: Element): string => {
  for (let node: Element | null = element; node; node = node.parentElement) {
    const color = getComputedStyle(node).backgroundColor;
    if (color !== "rgba(0, 0, 0, 0)" && color !== "transparent") return color;
  }
  return getComputedStyle(document.body).backgroundColor;
};

const textContrast = (element: Element) =>
  contrast(getComputedStyle(element).color, backgroundOf(element));

let root: Root | null = null;
let host: HTMLElement | null = null;

const mount = async (theme: ResolvedTheme, element: React.ReactElement) => {
  applyDocumentTheme(theme);
  document.body.style.backgroundColor = "var(--color-memora-bg)";
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(element);
  });
};

afterEach(() => {
  root?.unmount();
  host?.remove();
  document.body.removeAttribute("style");
  root = null;
  host = null;
});

describe.each(["light", "dark"] as const)("SourceDocumentEditor in %s", (theme) => {
  it("paints the surface, gutter, and selection from the resolved theme", async () => {
    await mount(theme, <SourceDocumentEditor text="alpha\nbeta" onTextChange={() => {}} />);

    const content = host?.querySelector(".cm-content") as HTMLElement;
    const gutters = host?.querySelector(".cm-gutters") as HTMLElement;
    if (!content || !gutters) throw new Error("Missing CodeMirror surfaces");

    expect.soft(textContrast(content), "content text").toBeGreaterThanOrEqual(4.5);

    const editorElement = host?.querySelector(".cm-editor") as HTMLElement;
    const view = EditorView.findFromDOM(editorElement);
    if (!view) throw new Error("Expected an EditorView");
    // CodeMirror only paints the selection layer while the view has real DOM focus - a
    // programmatic view.focus() isn't enough in a headless browser, so click in first.
    await userEvent.click(content);
    view.dispatch({ selection: { anchor: 0, head: 5 } });
    await expect.poll(() => host?.querySelector(".cm-selectionBackground")).not.toBeNull();
    const selectionLayer = host?.querySelector(".cm-selectionBackground") as HTMLElement;
    const selectionBackground = getComputedStyle(selectionLayer).backgroundColor;
    expect(selectionBackground).not.toBe("rgba(0, 0, 0, 0)");
    expect(selectionBackground).not.toBe(getComputedStyle(gutters).backgroundColor);
  });

  it("keeps markdown safety diagnostics legible", async () => {
    const diagnostic: MarkdownSafetyDiagnostic = {
      column: 1,
      from: 0,
      line: 1,
      message: 'Line 1: "[]" would become "[ ]".',
      replacementText: "[ ]",
      sourceText: "[]",
      to: 2,
    };
    await mount(
      theme,
      <SourceDocumentEditor text="[] item" onTextChange={() => {}} diagnostics={[diagnostic]} />,
    );

    const diagnosticButton = [...(host?.querySelectorAll("button") ?? [])].find(
      (button) => button.textContent === diagnostic.message,
    );
    if (!diagnosticButton) throw new Error("Missing diagnostic button");
    expect(textContrast(diagnosticButton)).toBeGreaterThanOrEqual(4.5);
  });
});

describe.each(["light", "dark"] as const)("WysiwygDocumentEditor in %s", (theme) => {
  it("gives headings, links, code, and checklist chrome readable, distinct colors", async () => {
    const markdown = [
      "# Heading",
      "",
      "A paragraph with a [link](https://example.com) and `inline code`.",
      "",
      "- [ ] unchecked",
      "- [x] checked",
    ].join("\n");
    await mount(theme, <WysiwygDocumentEditor text={markdown} onTextChange={() => {}} />);

    const heading = host?.querySelector("h1");
    const link = host?.querySelector("a");
    const inlineCode = host?.querySelector("code");
    const paragraph = [...(host?.querySelectorAll("p") ?? [])].find((node) =>
      node.textContent?.includes("A paragraph"),
    );
    for (const [label, element] of [
      ["heading", heading],
      ["link", link],
      ["inline code", inlineCode],
      ["paragraph", paragraph],
    ] as const) {
      if (!element) throw new Error(`Missing ${label}`);
      expect.soft(textContrast(element), label).toBeGreaterThanOrEqual(4.5);
    }
    expect(getComputedStyle(link as Element).color).not.toBe(
      getComputedStyle(paragraph as Element).color,
    );

    const checkedBox = host?.querySelector("li[aria-checked='true']");
    const uncheckedBox = host?.querySelector("li[aria-checked='false']");
    if (!checkedBox || !uncheckedBox) throw new Error("Missing checklist items");
    const checkedFill = getComputedStyle(checkedBox, "::before").backgroundColor;
    const pageBackground = getComputedStyle(document.body).backgroundColor;
    // The checked box must stay visible against the page surface in both themes - this is the
    // exact case that broke before (a hardcoded near-black fill on a near-black dark surface).
    expect(contrast(checkedFill, pageBackground)).toBeGreaterThanOrEqual(1.5);
  });
});

it("reconfigures CodeMirror on a runtime theme change without recreating the view", async () => {
  let latestText = "alpha";
  const Harness = () => {
    const [value, setValue] = useState(latestText);
    return (
      <SourceDocumentEditor
        text={value}
        onTextChange={(next) => {
          latestText = next;
          setValue(next);
        }}
      />
    );
  };

  await mount("light", <Harness />);
  const textbox = host?.querySelector('[role="textbox"]') as HTMLElement;
  const editorElement = host?.querySelector(".cm-editor") as HTMLElement;
  const viewBefore = EditorView.findFromDOM(editorElement);
  if (!textbox || !viewBefore) throw new Error("Missing CodeMirror editor");

  await userEvent.click(textbox);
  await userEvent.type(textbox, " beta");
  await expect.poll(() => latestText).toBe("alpha beta");
  viewBefore.dispatch({ selection: { anchor: 2, head: 5 } });
  const contentColorBefore = getComputedStyle(host!.querySelector(".cm-content")!).color;

  applyDocumentTheme("dark");
  await expect
    .poll(() => getComputedStyle(host!.querySelector(".cm-content")!).color)
    .not.toBe(contentColorBefore);

  const viewAfter = EditorView.findFromDOM(editorElement);
  expect(viewAfter).toBe(viewBefore);
  expect(viewAfter?.state.doc.toString()).toBe("alpha beta");
  expect(viewAfter?.state.selection.main.from).toBe(2);
  expect(viewAfter?.state.selection.main.to).toBe(5);
  expect(document.activeElement).toBe(textbox);

  // CodeMirror's default keymap binds undo to Mod-z, which resolves to Cmd-z on a Mac platform.
  const isMac = /Mac|iPhone|iPod|iPad/.test(navigator.platform);
  await userEvent.keyboard(isMac ? "{Meta>}z{/Meta}" : "{Control>}z{/Control}");
  await expect.poll(() => latestText).toBe("alpha");
});

it("keeps Lexical content, selection, and focus across a runtime theme change", async () => {
  let latestMarkdown = "Hello world";
  const Harness = () => {
    const [value, setValue] = useState(latestMarkdown);
    return (
      <WysiwygDocumentEditor
        text={value}
        onTextChange={(next) => {
          latestMarkdown = next;
          setValue(next);
        }}
      />
    );
  };

  await mount("light", <Harness />);
  const contentEditable = host?.querySelector(
    '[data-testid="wysiwyg-contenteditable"]',
  ) as HTMLElement;
  if (!contentEditable) throw new Error("Missing Lexical contenteditable");

  await userEvent.click(contentEditable);
  await userEvent.type(contentEditable, "!");
  await expect.poll(() => latestMarkdown).toBe("Hello world!");
  const colorBefore = getComputedStyle(contentEditable).color;

  applyDocumentTheme("dark");
  await expect.poll(() => getComputedStyle(contentEditable).color).not.toBe(colorBefore);

  // Same node, not remounted; content and focus both survive the reconfigure.
  expect(host?.querySelector('[data-testid="wysiwyg-contenteditable"]')).toBe(contentEditable);
  expect(contentEditable.textContent).toBe("Hello world!");
  expect(document.activeElement).toBe(contentEditable);
});
