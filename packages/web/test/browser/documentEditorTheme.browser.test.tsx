import { act } from "@testing-library/react";
import { useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { EditorView } from "@codemirror/view";

import { SourceDocumentEditor } from "@/components/editor/SourceDocumentEditor";
import { WysiwygDocumentEditor } from "@/components/editor/WysiwygDocumentEditor";
import { applyDocumentTheme, type ResolvedTheme } from "@/lib/theme/documentTheme";
import { textContrast } from "./colorContrast";
import { DESKTOP_VIEWPORT, expectScreenshot, loadAppFonts, NARROW_VIEWPORT } from "./visual";

// Computed-style checks only: no assertions on generated StyleX class names.

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

  it("colors markdown syntax with readable theme colors", async () => {
    await mount(
      theme,
      <SourceDocumentEditor
        text={"# Title\n\n[link](https://a.b) `code`"}
        onTextChange={() => {}}
      />,
    );

    const spanFor = (text: string) =>
      [...(host?.querySelectorAll(".cm-line span") ?? [])].find((span) =>
        span.textContent?.includes(text),
      );
    await expect.poll(() => spanFor("Title")).toBeTruthy();
    const plain = host?.querySelector(".cm-content") as HTMLElement;
    for (const text of ["link", "code"]) {
      const span = spanFor(text);
      if (!span) throw new Error(`Missing highlighted span for ${text}`);
      expect.soft(getComputedStyle(span).color, text).not.toBe(getComputedStyle(plain).color);
      expect.soft(textContrast(span), text).toBeGreaterThanOrEqual(4.5);
    }
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

    await expect.poll(() => host?.querySelector(".cm-md-h1")).not.toBeNull();
    const heading = host?.querySelector(".cm-md-h1");
    const link = host?.querySelector(".cm-md-link");
    const inlineCode = host?.querySelector(".cm-md-inline-code");
    const paragraph = [...(host?.querySelectorAll(".cm-line") ?? [])].find((node) =>
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

it("keeps editor content and focus across a runtime theme change", async () => {
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
  const content = host?.querySelector(".cm-content") as HTMLElement;
  if (!content) throw new Error("Missing editor content");

  const view = EditorView.findFromDOM(content);
  view?.focus();
  view?.dispatch({ selection: { anchor: view.state.doc.length } });
  await userEvent.keyboard("!");
  await expect.poll(() => latestMarkdown).toBe("Hello world!");
  const colorBefore = getComputedStyle(content).color;

  applyDocumentTheme("dark");
  await expect.poll(() => getComputedStyle(content).color).not.toBe(colorBefore);

  expect(host?.querySelector(".cm-content")).toBe(content);
  expect(content.textContent).toBe("Hello world!");
  expect(content.contains(document.activeElement)).toBe(true);
});

const REFERENCE_MARKDOWN = [
  "# Quarterly planning notes",
  "",
  "A paragraph with a [link](https://example.com) and `inline code`.",
  "",
  "Memora keeps every recording, transcript, and linked note on this device, so reviewing the quarterly-financial-planning-and-budget-review material never leaves your workspace.",
  "",
  "第一季度财务规划与预算审查会议的全部录音、转录文本和关联笔记都保存在本设备上，不会离开你的工作区。",
  "",
  "- [ ] Draft the summary",
  "- [x] Share the recording",
  "",
  "```ts",
  "const total = items.reduce((sum, item) => sum + item.amount, 0);",
  "```",
].join("\n");

describe.each(["light", "dark"] as const)("document editor references in %s", (theme) => {
  it.each([
    ["desktop", DESKTOP_VIEWPORT],
    ["narrow", NARROW_VIEWPORT],
  ] as const)(
    "matches the %s reference with long English and Chinese text",
    async (size, viewport) => {
      await page.viewport(viewport.width, viewport.height);
      try {
        await mount(
          theme,
          <WysiwygDocumentEditor text={REFERENCE_MARKDOWN} onTextChange={() => {}} />,
        );
        await loadAppFonts();
        const editor = host as HTMLElement;
        expect(editor.scrollWidth).toBeLessThanOrEqual(editor.clientWidth + 1);
        await expectScreenshot(editor, `editor-${size}-${theme}`);
      } finally {
        await page.viewport(DESKTOP_VIEWPORT.width, DESKTOP_VIEWPORT.height);
      }
    },
  );
});
