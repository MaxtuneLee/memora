import { Tooltip } from "@base-ui/react/tooltip";
import { DndContext } from "@dnd-kit/core";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";

import { ConfirmDialog } from "@/components/desktop/ConfirmDialog";
import { DesktopContextMenu } from "@/components/desktop/DesktopContextMenu";
import { DesktopItem } from "@/components/desktop/DesktopItem";
import { DesktopWindow } from "@/components/desktop/DesktopWindow";
import { applyDocumentTheme, type ResolvedTheme } from "@/lib/theme/documentTheme";
import type { DesktopFileItem, DesktopWidgetItem } from "@/types/desktop";

const DEFAULT_VIEWPORT = { width: 1280, height: 800 };
const NARROW_VIEWPORT = { width: 375, height: 700 };

const LONG_EN_NAME = "Quarterly-financial-planning-and-budget-review-meeting-recording-2026.m4a";
const LONG_ZH_NAME = "第一季度财务规划与预算审查会议录音存档备份文件完整版.m4a";
const LONG_EN_DESCRIPTION =
  "This recording, along with every transcript, chapter marker, and linked note that references it across your workspace, will be moved to the trash and permanently removed after thirty days unless you restore it.";
const LONG_ZH_DESCRIPTION =
  "此录音以及工作区中引用它的所有转录文本、章节标记和关联笔记都将被移动到废纸篓，除非您在三十天内将其还原，否则将被永久删除。";

// A truncated element is acceptable either when its row never grows past the row's own box
// (scrollWidth <= clientWidth, ellipsis handled it) or when it still exposes the full text via
// a title attribute for hover/assistive access.
const hasNoHorizontalOverflow = (container: Element, textCarrier: Element): boolean => {
  const fits = container.scrollWidth <= container.clientWidth + 1;
  const hasTitle = textCarrier.hasAttribute("title") && textCarrier.getAttribute("title") !== "";
  return fits || hasTitle;
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

const byText = (text: string) => {
  const element = [...document.querySelectorAll("body *")].find(
    (node) => node.childElementCount === 0 && node.textContent === text,
  );
  if (!element) throw new Error(`Missing ${text}`);
  return element;
};

const fileItem: DesktopFileItem = {
  id: "file-1",
  name: "Interview.m4a",
  type: "file",
  position: { x: 0, y: 0 },
  fileMeta: {
    id: "file-1",
    name: "Interview.m4a",
    type: "audio",
    mimeType: "audio/mp4",
    sizeBytes: 1024,
    storageType: "opfs",
    storagePath: "/files/file-1",
    metaPath: "/files/file-1.json",
    parentId: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  indexState: { status: "indexed", indexedAt: Date.now(), summary: null },
};

const trashItem: DesktopWidgetItem = {
  id: "trash",
  name: "Trash",
  type: "widget",
  widgetType: "trash",
  position: { x: 0, y: 0 },
  size: { width: 110, height: 110 },
};

let root: Root | null = null;
let host: HTMLElement | null = null;

const mount = async (theme: ResolvedTheme, node: React.ReactElement) => {
  applyDocumentTheme(theme);
  document.body.style.backgroundColor = "var(--color-memora-bg)";
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  root.render(node);
  await expect.poll(() => host?.childElementCount ?? 0).toBeGreaterThan(0);
};

afterEach(async () => {
  root?.unmount();
  host?.remove();
  document.body.removeAttribute("style");
  root = null;
  host = null;
  await page.viewport(DEFAULT_VIEWPORT.width, DEFAULT_VIEWPORT.height);
});

describe.each(["light", "dark"] as const)("desktop workspace in %s", (theme) => {
  it("keeps selected and idle file rows, and the trash icon, readable", async () => {
    await mount(
      theme,
      <Tooltip.Provider>
        <DndContext>
          <DesktopItem
            item={fileItem}
            isSelected
            layout="list"
            onSelect={() => {}}
            onContextMenu={() => {}}
            onOpenItem={() => {}}
          />
          <DesktopItem
            item={{ ...fileItem, id: "file-2", name: "Notes.txt" }}
            isSelected={false}
            layout="list"
            onSelect={() => {}}
            onContextMenu={() => {}}
            onOpenItem={() => {}}
          />
          <DesktopItem
            item={trashItem}
            isSelected={false}
            layout="list"
            onSelect={() => {}}
            onContextMenu={() => {}}
            onOpenItem={() => {}}
          />
        </DndContext>
      </Tooltip.Provider>,
    );

    const selectedRow = byText("Interview.m4a").closest("div[class]") as Element;
    const idleRow = byText("Notes.txt").closest("div[class]") as Element;
    expect(getComputedStyle(selectedRow).backgroundColor).not.toBe(
      getComputedStyle(idleRow).backgroundColor,
    );
    expect(textContrast(byText("Interview.m4a"))).toBeGreaterThanOrEqual(4.5);
    expect(textContrast(byText("Notes.txt"))).toBeGreaterThanOrEqual(4.5);

    const trashIcon = document.querySelector("svg");
    expect(trashIcon).not.toBeNull();
  });

  it("paints window chrome distinctly for the focused window", async () => {
    await mount(
      theme,
      <>
        <div id="focused">
          <DesktopWindow
            id="w1"
            title="Focused window"
            position={{ x: 0, y: 0 }}
            size={{ width: 320, height: 220 }}
            zIndex={1}
            isFocused
            boundsRef={{ current: null }}
            onClose={() => {}}
            onFocus={() => {}}
            onMove={() => {}}
            onResize={() => {}}
          >
            <div>Content</div>
          </DesktopWindow>
        </div>
        <div id="idle">
          <DesktopWindow
            id="w2"
            title="Idle window"
            position={{ x: 0, y: 0 }}
            size={{ width: 320, height: 220 }}
            zIndex={1}
            isFocused={false}
            boundsRef={{ current: null }}
            onClose={() => {}}
            onFocus={() => {}}
            onMove={() => {}}
            onResize={() => {}}
          >
            <div>Content</div>
          </DesktopWindow>
        </div>
      </>,
    );

    const focusedWindow = document.querySelector("#focused > div") as Element;
    const idleWindow = document.querySelector("#idle > div") as Element;
    expect(getComputedStyle(focusedWindow).borderColor).not.toBe(
      getComputedStyle(idleWindow).borderColor,
    );
    expect(textContrast(byText("Focused window"))).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps the destructive context menu item readable against the popup surface", async () => {
    await mount(
      theme,
      <DesktopContextMenu
        isOpen
        position={{ x: 10, y: 10 }}
        targetId="file-1"
        targetType="file"
        onClose={() => {}}
        onNewFolder={() => {}}
        onNewNote={() => {}}
        onUploadAudio={() => {}}
        onDelete={() => {}}
        onRename={() => {}}
      />,
    );

    await expect.poll(() => document.body.textContent?.includes("Delete")).toBe(true);
    const deleteLabel = byText("Delete");
    expect(textContrast(deleteLabel)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps a danger confirm dialog readable and survives a runtime theme change", async () => {
    await mount(
      theme,
      <ConfirmDialog
        isOpen
        title="Move to trash?"
        description="This file will be moved to trash."
        confirmLabel="Delete"
        tone="danger"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );

    await expect
      .poll(() => document.querySelector("dialog")?.getAttribute("data-state"))
      .toBe("open");
    expect(textContrast(byText("Delete"))).toBeGreaterThanOrEqual(3);

    // Flip the resolved theme at runtime; the dialog must stay open and repaint. The confirm
    // button transitions background-color over 150ms, so wait past that before reading it.
    const otherTheme: ResolvedTheme = theme === "dark" ? "light" : "dark";
    applyDocumentTheme(otherTheme);
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(document.querySelector("dialog")?.getAttribute("data-state")).toBe("open");
    expect(byText("Move to trash?")).toBeTruthy();
    expect(textContrast(byText("Delete"))).toBeGreaterThanOrEqual(3);
  });

  it("keeps long English and Chinese file names from overflowing a narrow row", async () => {
    await page.viewport(NARROW_VIEWPORT.width, NARROW_VIEWPORT.height);
    await mount(
      theme,
      <Tooltip.Provider>
        <div style={{ width: "100%", maxWidth: 320 }}>
          <DndContext>
            <DesktopItem
              item={{ ...fileItem, id: "file-en", name: LONG_EN_NAME }}
              isSelected={false}
              layout="list"
              onSelect={() => {}}
              onContextMenu={() => {}}
              onOpenItem={() => {}}
            />
            <DesktopItem
              item={{ ...fileItem, id: "file-zh", name: LONG_ZH_NAME }}
              isSelected={false}
              layout="list"
              onSelect={() => {}}
              onContextMenu={() => {}}
              onOpenItem={() => {}}
            />
          </DndContext>
        </div>
      </Tooltip.Provider>,
    );

    for (const name of [LONG_EN_NAME, LONG_ZH_NAME]) {
      const nameEl = [...document.querySelectorAll("span")].find(
        (span) => span.textContent === name,
      );
      expect(nameEl, name).toBeTruthy();
      const row = nameEl!.closest('div[role="button"]') as Element;
      expect(hasNoHorizontalOverflow(row, nameEl!), name).toBe(true);
      // The row itself must stay within the narrow layout, not just the truncated span.
      expect(row.scrollWidth, name).toBeLessThanOrEqual(row.clientWidth + 1);
    }
  });

  it("keeps long English and Chinese dialog copy from overflowing horizontally", async () => {
    await page.viewport(NARROW_VIEWPORT.width, NARROW_VIEWPORT.height);
    await mount(
      theme,
      <ConfirmDialog
        isOpen
        title="Move to trash?"
        description={`${LONG_EN_DESCRIPTION} ${LONG_ZH_DESCRIPTION}`}
        confirmLabel="Delete"
        tone="danger"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );

    await expect
      .poll(() => document.querySelector("dialog")?.getAttribute("data-state"))
      .toBe("open");

    const panel = document.querySelector(".memora-native-dialog__panel") as Element;
    expect(panel).toBeTruthy();
    expect(panel.scrollWidth).toBeLessThanOrEqual(panel.clientWidth + 1);
    const description = byText(`${LONG_EN_DESCRIPTION} ${LONG_ZH_DESCRIPTION}`);
    expect(hasNoHorizontalOverflow(panel, description)).toBe(true);
  });

  it("shows a visible, high-contrast focus ring on dialog buttons", async () => {
    await mount(
      theme,
      <ConfirmDialog
        isOpen
        title="Move to trash?"
        description="This file will be moved to trash."
        confirmLabel="Delete"
        tone="danger"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );

    await expect
      .poll(() => document.querySelector("dialog")?.getAttribute("data-state"))
      .toBe("open");
    // The dialog auto-focuses its first focusable control (the Cancel button) on open.
    await expect.poll(() => document.activeElement?.textContent).toBe("Cancel");

    // The ring is painted outside the button's own box, against the dialog panel behind it, not
    // against the button's own fill (which matters for the solid danger confirm button).
    const panel = document.querySelector(".memora-native-dialog__panel") as Element;
    const panelBackground = getComputedStyle(panel).backgroundColor;

    const checkFocusRing = (element: Element) => {
      const shadow = getComputedStyle(element).boxShadow;
      expect(shadow, element.textContent ?? "").not.toBe("none");
      const ring = shadow.match(/rgba?\([^)]+\)/g)?.at(-1) ?? "";
      expect(
        contrast(ring, panelBackground),
        `${element.textContent} focus ring contrast`,
      ).toBeGreaterThanOrEqual(3);
    };

    checkFocusRing(document.activeElement as Element);

    await userEvent.tab();
    expect(document.activeElement?.textContent).toBe("Delete");
    checkFocusRing(document.activeElement as Element);
  });
});
