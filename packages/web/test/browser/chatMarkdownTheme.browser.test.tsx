import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { AssistantMessageContent } from "@/components/chat/chatMessage/AssistantMessageContent";
import type { ChatMessageData } from "@/components/chat/chatMessage/types";
import { applyDocumentTheme, type ResolvedTheme } from "@/lib/theme/documentTheme";
import { buildWidgetIframeSrcDoc } from "@/components/chat/chatWidget/constants";

// tokens.css and streamdown.css are only reached through index.css in the app shell, which this
// harness does not load (see sharedControlsTheme.browser.test.tsx) - pull them in directly so the
// markdown rules under test are actually present.
import "@/styles/tokens.css";
import "@/styles/streamdown.css";

const LONG_EN =
  "Memora keeps every note, transcript, and generated widget readable regardless of the theme the reader has chosen, even across long paragraphs that wrap across several lines of the composer and message list.";
const LONG_ZH =
  "无论读者选择浅色还是深色主题,备忘录都会让每一条笔记、转录文本和生成的组件保持可读,即便是跨越消息列表中多行的长段落也是如此。";

const MARKDOWN_CONTENT = `# Heading one

A paragraph with **bold text**, *italic text*, and a [link](https://example.com/docs).

- first item
- second item

> A quoted callout note worth calling out.

| Column A | Column B |
| --- | --- |
| one | two |

\`\`\`js
const value = 1 + 1;
\`\`\`

${LONG_EN}

${LONG_ZH}
`;

const MESSAGE: ChatMessageData = {
  id: "msg-1",
  role: "assistant",
  content: MARKDOWN_CONTENT,
};

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

const mount = async (theme: ResolvedTheme) => {
  applyDocumentTheme(theme);
  document.body.style.backgroundColor = "var(--color-memora-bg)";
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  root.render(<AssistantMessageContent message={MESSAGE} isStreaming={false} />);
  await expect.poll(() => host?.querySelector("table") !== null).toBe(true);
};

afterEach(() => {
  root?.unmount();
  host?.remove();
  document.body.removeAttribute("style");
  root = null;
  host = null;
});

describe.each(["light", "dark"] as const)("streamed markdown in %s", (theme) => {
  it("gives headings, links, blockquotes, and table cells readable contrast", async () => {
    await mount(theme);

    const heading = host?.querySelector("h1");
    const paragraph = [...(host?.querySelectorAll("p") ?? [])].find(
      (node) => node.textContent?.includes("bold text"),
    );
    const link = host?.querySelector('[data-streamdown="link"]');
    const blockquote = host?.querySelector("blockquote");
    const tableHeaderCell = host?.querySelector("th");
    const tableCell = host?.querySelector("td");
    const longEnglish = [...(host?.querySelectorAll("p") ?? [])].find((node) =>
      node.textContent?.includes("Memora keeps every note"),
    );
    const longChinese = [...(host?.querySelectorAll("p") ?? [])].find((node) =>
      node.textContent?.includes("无论读者选择"),
    );

    for (const [label, element] of [
      ["heading", heading],
      ["paragraph", paragraph],
      ["link", link],
      ["blockquote", blockquote],
      ["table header", tableHeaderCell],
      ["table cell", tableCell],
      ["long English paragraph", longEnglish],
      ["long Chinese paragraph", longChinese],
    ] as const) {
      if (!element) throw new Error(`Missing ${label}`);
      expect.soft(textContrast(element), label).toBeGreaterThanOrEqual(4.5);
    }

    // The link must remain visually distinct from body text, not just readable.
    expect(getComputedStyle(link as Element).color).not.toBe(
      getComputedStyle(paragraph as Element).color,
    );
  });

  it("gives the code block a themed surface distinct from the page background", async () => {
    await mount(theme);
    const codeBlock = host?.querySelector('[data-streamdown="code-block-body"]');
    if (!codeBlock) throw new Error("Missing code block body");
    const codeBackground = getComputedStyle(codeBlock).backgroundColor;
    const pageBackground = getComputedStyle(document.body).backgroundColor;
    expect(codeBackground).not.toBe("rgba(0, 0, 0, 0)");
    expect(codeBackground).not.toBe(pageBackground);
  });
});

it("retains the rendered message node across a runtime theme change", async () => {
  await mount("light");
  const heading = host?.querySelector("h1");
  const lightColor = heading ? getComputedStyle(heading).color : null;
  if (!heading || !lightColor) throw new Error("Missing heading");

  applyDocumentTheme("dark");
  await expect
    .poll(() => (heading ? getComputedStyle(heading).color : null))
    .not.toBe(lightColor);

  // Same DOM node: the theme change restyled it in place instead of remounting the message.
  expect(host?.querySelector("h1")).toBe(heading);
});

describe("chat widget preview srcDoc", () => {
  it("bakes the initial theme into the markup so the first paint never mismatches", () => {
    for (const theme of ["light", "dark"] as const) {
      const srcDoc = buildWidgetIframeSrcDoc(theme);
      const htmlStart = srcDoc.indexOf("<html");
      const htmlOpenTag = srcDoc.slice(htmlStart, srcDoc.indexOf(">", htmlStart) + 1);
      expect(htmlOpenTag).toContain(`data-theme="${theme}"`);
      expect(htmlOpenTag).toContain(`color-scheme: ${theme}`);
    }
  });
});
