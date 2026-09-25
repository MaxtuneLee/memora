import { type JSX, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";

import { CalendarWidget } from "@/components/dashboard/CalendarWidget";
import { DashboardToolbarButton } from "@/components/dashboard/DashboardToolbarButton";
import { RecentWidget } from "@/components/dashboard/RecentWidget";
import { TodoPanel } from "@/components/dashboard/TodoPanel";
import type { RecentItem } from "@/components/dashboard/recentItems";
import { HomeGrid } from "@/components/dashboard/homeGrid/HomeGrid";
import { applyDocumentTheme, type ResolvedTheme } from "@/lib/theme/documentTheme";
import type { widgetDefinition, widgetInstance } from "@/livestore/widget";
import { ChatCircleDotsIcon } from "@phosphor-icons/react";
import { luminance, contrast, textContrast } from "./colorContrast";
import { expectScreenshot, loadAppFonts } from "./visual";

// A fixed start date keeps the calendar and relative times in the visual references stable; the
// clock still advances in real time from there.
vi.useFakeTimers({
  toFake: ["Date"],
  now: new Date("2026-09-15T10:00:00"),
  shouldAdvanceTime: true,
});

// Computed-style checks only: no assertions on generated StyleX class names. Mirrors
// test/browser/sharedControlsTheme.browser.test.tsx.

const DEFAULT_VIEWPORT = { width: 1280, height: 800 };
const NARROW_VIEWPORT = { width: 375, height: 700 };

const LONG_EN_TASK =
  "Coordinate the quarterly roadmap review with design, engineering, and support before the leadership sync on Friday afternoon.";
const LONG_ZH_TASK =
  "在周五下午的领导层同步会议之前，协调设计、工程和支持团队完成本季度路线图的评审工作并准备最终演示文稿。";
const LONG_EN_WIDGET_TITLE =
  "Quarterly-financial-planning-and-budget-review-meeting-recording-archive-2026.m4a";
const LONG_ZH_WIDGET_TITLE = "第一季度财务规划与预算审查会议录音存档备份文件完整版.m4a";

// A container must never grow wider than its own box; a truncated/wrapped text carrier is
// allowed to report a wider intrinsic scrollWidth than its clientWidth (that's the ellipsis or
// wrap actually doing its job), as long as the container around it doesn't follow it out.
const fitsWithoutOverflow = (container: Element): boolean =>
  container.scrollWidth <= container.clientWidth + 1;

const RECENT_ITEM: RecentItem = {
  id: "file-1",
  title: "Weekly notes",
  subtitle: "Updated just now",
  href: "/desktop",
  updatedAt: Date.now(),
  icon: ChatCircleDotsIcon,
  tone: "file",
};

const WIDGET_A: widgetDefinition = {
  id: "def-a",
  kind: "builtin",
  builtinKey: null,
  name: "Widget A",
  widgetCode: "",
  dataSourceName: "recentFiles",
  dataSourceParams: "{}",
  folderId: null,
  sourceFileId: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  deletedAt: null,
};
const WIDGET_B: widgetDefinition = { ...WIDGET_A, id: "def-b", name: "Widget B" };

const makeInstance = (definitionId: string, sortOrder: number): widgetInstance => ({
  id: `inst-${definitionId}`,
  definitionId,
  sortOrder,
  params: "{}",
  columnSpan: 1,
  rowSpan: 1,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  deletedAt: null,
});

// A no-op store: the Todo builtin persists to OPFS on its own, which a real headless Chromium
// instance provides, so no fake file backend is needed here.
const TODO_STORE = { commit: () => {} };

function DashboardWidgetsHarness({
  onReorder,
}: {
  onReorder: (order: string[]) => void;
}): JSX.Element {
  const [order, setOrder] = useState(["def-a", "def-b"]);
  const definitionsById = new Map([
    [WIDGET_A.id, WIDGET_A],
    [WIDGET_B.id, WIDGET_B],
  ]);
  const tiles = order.map((id, index) => ({
    instance: makeInstance(id, index),
    definition: definitionsById.get(id) ?? null,
  }));

  return (
    <MemoryRouter>
      <div style={{ width: "640px" }}>
        <DashboardToolbarButton tone="primary">Edit</DashboardToolbarButton>
        <DashboardToolbarButton>Cancel</DashboardToolbarButton>
        <CalendarWidget activityTimestamps={[Date.now()]} />
        <RecentWidget items={[RECENT_ITEM]} />
        <TodoPanel files={[]} store={TODO_STORE} />
        {/* Swaps the tile order the same way HomeGrid's own onReorder callback would after a
            drag — reordering itself is covered by homeGridReorder.browser.test.tsx; this harness
            only needs a way to put the grid into a reordered state before flipping the theme. */}
        <button
          type="button"
          onClick={() => {
            const nextOrder = [...order].reverse();
            setOrder(nextOrder);
            onReorder(nextOrder);
          }}
        >
          Swap tile order
        </button>
        <HomeGrid
          tiles={tiles}
          renderWidget={(definition) => <div style={{ height: "60px" }}>{definition.name}</div>}
          onReorder={(orderedIds) => {
            const nextOrder = orderedIds.map((id) => id.replace("inst-", ""));
            setOrder(nextOrder);
            onReorder(nextOrder);
          }}
          onRemove={() => {}}
          showToolbar={false}
          reducedMotion
        />
      </div>
    </MemoryRouter>
  );
}

let container: HTMLDivElement | undefined;
let root: Root | undefined;

const mount = async (theme: ResolvedTheme, onReorder: (order: string[]) => void = () => {}) => {
  applyDocumentTheme(theme);
  document.body.style.backgroundColor = "var(--color-memora-bg)";
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  root.render(<DashboardWidgetsHarness onReorder={onReorder} />);
  await expect.poll(() => page.getByText("Today Tasks").elements().length).toBe(1);
};

afterEach(async () => {
  root?.unmount();
  container?.remove();
  document.body.removeAttribute("style");
  root = undefined;
  container = undefined;
  await page.viewport(DEFAULT_VIEWPORT.width, DEFAULT_VIEWPORT.height);
});

describe.each(["light", "dark"] as const)("Dashboard and Home Grid in %s", (theme) => {
  it("keeps built-in widget text at WCAG AA contrast", async () => {
    await mount(theme);

    for (const label of ["Edit", "Cancel", "Today Tasks", "Weekly notes", "Widget A", "Widget B"]) {
      const element = page.getByText(label, { exact: true }).elements()[0];
      expect(element, label).toBeDefined();
      if (element) {
        expect.soft(textContrast(element), label).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("paints the active calendar day and the primary toolbar action from the resolved theme", async () => {
    await mount(theme);

    const primaryButton = page.getByRole("button", { name: "Edit" }).element();
    const primaryBackground = getComputedStyle(primaryButton).backgroundColor;
    const primaryText = getComputedStyle(primaryButton).color;
    expect(contrast(primaryText, primaryBackground)).toBeGreaterThanOrEqual(4.5);

    // Today's cell is the only one of its day-number matches with an opaque background (the
    // calendarDayActive fill); every other calendar cell paints transparent.
    const todayLabel = String(new Date().getDate());
    const activeDay = page
      .getByText(todayLabel, { exact: true })
      .elements()
      .map((element) => element.parentElement)
      .find(
        (element): element is HTMLElement =>
          element !== null && getComputedStyle(element).backgroundColor !== "rgba(0, 0, 0, 0)",
      );
    expect(activeDay, "active calendar day").toBeDefined();
    if (activeDay) {
      const dayLuminance = luminance(getComputedStyle(activeDay).backgroundColor);
      // The active day chip and the primary toolbar action share the same olive accent family,
      // so both should read as mid-toned rather than collapsing to page background or pure ink.
      expect(dayLuminance).toBeGreaterThan(0.03);
      expect(dayLuminance).toBeLessThan(0.85);
    }
  });

  it("matches the desktop reference", async () => {
    await mount(theme);
    await loadAppFonts();
    await expectScreenshot(container as Element, `dashboard-desktop-${theme}`);
  });

  it("shows a visible focus ring on the toolbar action", async () => {
    await mount(theme);

    const button = page.getByRole("button", { name: "Cancel" }).element() as HTMLElement;
    // A scripted .focus() doesn't satisfy :focus-visible in Chromium; only real keyboard
    // navigation does, same as sharedControlsTheme.browser.test.tsx.
    await userEvent.tab();
    await userEvent.tab();
    expect(document.activeElement).toBe(button);
    // The ring transitions in over 150ms; read after it settles instead of mid-transition, when
    // box-shadow briefly reports its zero-length "from" keyframe.
    await expect
      .poll(() => getComputedStyle(button).boxShadow, { timeout: 1000 })
      .not.toMatch("0px 0px 0px 0px");
    const shadow = getComputedStyle(button).boxShadow;
    const ring = shadow.match(/rgba?\([^)]+\)/g)?.at(-1) ?? "";
    expect(contrast(ring, getComputedStyle(document.body).backgroundColor)).toBeGreaterThanOrEqual(
      2,
    );
  });
});

describe("Dashboard theme change", () => {
  it("repaints the page live and keeps Home Grid order and Today Tasks state, without remounting", async () => {
    let latestOrder: string[] = ["def-a", "def-b"];
    await mount("light", (order) => {
      latestOrder = order;
    });

    expect(document.querySelectorAll("[data-widget-instance-id]")).toHaveLength(2);
    await page.getByRole("button", { name: "Swap tile order" }).click();
    await expect.poll(() => latestOrder).toEqual(["def-b", "def-a"]);

    // Add a task so there is per-widget state to lose across a naive remount.
    await page.getByRole("button", { name: "Add task" }).click();
    const composerInput = page.getByPlaceholder("Add a task for today...");
    await composerInput.fill("Ship the dark theme");
    await userEvent.keyboard("{Enter}");
    await expect.element(page.getByText("Ship the dark theme")).toBeVisible();

    const lightBackground = getComputedStyle(document.body).backgroundColor;
    const lightLuminance = luminance(lightBackground);

    applyDocumentTheme("dark");

    await expect
      .poll(() => luminance(getComputedStyle(document.body).backgroundColor))
      .toBeLessThan(lightLuminance);

    // The task added before the theme flip is still there: TodoPanel never remounted or reloaded.
    await expect.element(page.getByText("Ship the dark theme")).toBeVisible();
    // The reordered Home Grid is unchanged too — nothing reset it back to definition order.
    expect(latestOrder).toEqual(["def-b", "def-a"]);
    expect(
      Array.from(document.querySelectorAll("[data-widget-instance-id]")).map((element) =>
        element.getAttribute("data-widget-instance-id"),
      ),
    ).toEqual(["inst-def-b", "inst-def-a"]);
  });
});

function NarrowDashboardHarness(): JSX.Element {
  const longRecentEn: RecentItem = {
    ...RECENT_ITEM,
    id: "recent-long-en",
    title: LONG_EN_WIDGET_TITLE,
    subtitle: LONG_EN_WIDGET_TITLE,
  };
  const longRecentZh: RecentItem = {
    ...RECENT_ITEM,
    id: "recent-long-zh",
    title: LONG_ZH_WIDGET_TITLE,
    subtitle: LONG_ZH_WIDGET_TITLE,
  };
  const definitionEn: widgetDefinition = { ...WIDGET_A, id: "tile-en", name: "Recent (EN)" };
  const definitionZh: widgetDefinition = { ...WIDGET_A, id: "tile-zh", name: "Recent (ZH)" };
  const tiles = [
    { instance: makeInstance(definitionEn.id, 0), definition: definitionEn },
    { instance: makeInstance(definitionZh.id, 1), definition: definitionZh },
  ];

  return (
    <MemoryRouter>
      {/* Mirrors the padded content column DashboardPage renders its Home Grid and widgets
          inside, scaled to a 375px phone viewport instead of the desktop max width. */}
      <div data-testid="narrow-dashboard" style={{ width: "100%", maxWidth: 360 }}>
        <TodoPanel files={[]} store={TODO_STORE} />
        <HomeGrid
          tiles={tiles}
          renderWidget={(definition) =>
            definition.id === definitionEn.id ? (
              <RecentWidget items={[longRecentEn]} />
            ) : (
              <RecentWidget items={[longRecentZh]} />
            )
          }
          onReorder={() => {}}
          onRemove={() => {}}
          showToolbar={false}
          reducedMotion
        />
      </div>
    </MemoryRouter>
  );
}

const mountNarrow = async (theme: ResolvedTheme) => {
  await page.viewport(NARROW_VIEWPORT.width, NARROW_VIEWPORT.height);
  applyDocumentTheme(theme);
  document.body.style.backgroundColor = "var(--color-memora-bg)";
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  root.render(<NarrowDashboardHarness />);
  await expect.poll(() => page.getByText("Today Tasks").elements().length).toBe(1);
};

describe.each(["light", "dark"] as const)("Dashboard at a narrow viewport in %s", (theme) => {
  it("keeps the dashboard, Home Grid tiles, and Today Tasks free of horizontal overflow with long English and Chinese text", async () => {
    await mountNarrow(theme);

    const dashboard = document.querySelector('[data-testid="narrow-dashboard"]') as HTMLElement;
    expect(dashboard).toBeTruthy();
    expect(fitsWithoutOverflow(dashboard), "dashboard wrapper").toBe(true);

    // Home Grid tiles: each must stay inside its own box even though its built-in Recent widget
    // carries a long, unbroken English or Chinese file name.
    const tiles = Array.from(document.querySelectorAll<HTMLElement>("[data-widget-instance-id]"));
    expect(tiles).toHaveLength(2);
    for (const tile of tiles) {
      expect(fitsWithoutOverflow(tile), tile.dataset.widgetInstanceId ?? "tile").toBe(true);
    }

    // The Recent widget truncates with an ellipsis instead of growing the row: the title's own
    // content is expected to be wider than its box (that's the truncation actually engaging),
    // as long as the row around it — and the tile around that — never follows it out.
    for (const title of [LONG_EN_WIDGET_TITLE, LONG_ZH_WIDGET_TITLE]) {
      const titleEl = [...document.querySelectorAll("p")].find((p) => p.textContent === title);
      expect(titleEl, title).toBeTruthy();
      const row = titleEl?.closest("a") as HTMLElement;
      expect(fitsWithoutOverflow(row), `${title} row`).toBe(true);
      const titleStyle = getComputedStyle(titleEl as Element);
      expect(titleStyle.textOverflow, `${title} ellipsis`).toBe("ellipsis");
      expect(
        (titleEl as HTMLElement).scrollWidth,
        `${title} is actually truncated, not just configured to be`,
      ).toBeGreaterThan((titleEl as HTMLElement).clientWidth);
    }

    // Today Tasks: long English and Chinese tasks must wrap onto multiple lines rather than
    // pushing their row, or the panel, wider than the narrow viewport. The composer closes after
    // each submit, so it's reopened for the second task.
    for (const taskText of [LONG_EN_TASK, LONG_ZH_TASK]) {
      await page.getByRole("button", { name: "Add task" }).click();
      await page.getByPlaceholder("Add a task for today...").fill(taskText);
      await userEvent.keyboard("{Enter}");
      await expect.element(page.getByText(taskText)).toBeVisible();

      const taskEl = [...document.querySelectorAll("span")].find(
        (span) => span.textContent === taskText,
      ) as HTMLElement;
      const row = taskEl.closest("label") as HTMLElement;
      expect(fitsWithoutOverflow(row), `${taskText.slice(0, 12)}… row`).toBe(true);
      expect(fitsWithoutOverflow(taskEl), `${taskText.slice(0, 12)}… text`).toBe(true);
      // A single line of this panel's task text is ~40px tall; a row this long only fits inside
      // 360px by wrapping across several lines, so a noticeably taller row is the visible wrap.
      expect(
        row.getBoundingClientRect().height,
        `${taskText.slice(0, 12)}… wraps onto multiple lines`,
      ).toBeGreaterThan(60);
    }

    expect(fitsWithoutOverflow(dashboard), "dashboard wrapper after adding tasks").toBe(true);
    await loadAppFonts();
    // Typing the tasks scrolls the page; capture from a fixed scroll position.
    window.scrollTo(0, 0);
    await expectScreenshot(dashboard, `dashboard-narrow-${theme}`);
  });
});

describe("Home Grid built-in widget overflow", () => {
  it("scrolls a tall Recent widget inside its card border, not on the tile", async () => {
    const items = Array.from({ length: 12 }, (_, index) => ({
      ...RECENT_ITEM,
      id: `file-${index}`,
      title: `Recent item ${index}`,
    }));
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    root.render(
      <MemoryRouter>
        <div style={{ width: "640px" }}>
          <HomeGrid
            tiles={[{ instance: makeInstance(WIDGET_A.id, 0), definition: WIDGET_A }]}
            renderWidget={() => <RecentWidget items={items} />}
            onReorder={() => {}}
            onRemove={() => {}}
            showToolbar={false}
            reducedMotion
          />
        </div>
      </MemoryRouter>,
    );
    await expect.poll(() => page.getByText("Recent item 11").elements().length).toBe(1);

    const card = page.getByRole("heading", { name: "Recent" }).element().parentElement
      ?.parentElement as HTMLElement;
    const tileContent = card.parentElement as HTMLElement;
    expect(card.scrollHeight).toBeGreaterThan(card.clientHeight);
    expect(tileContent.scrollHeight).toBeLessThanOrEqual(tileContent.clientHeight + 1);
    expect(card.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      tileContent.getBoundingClientRect().bottom + 1,
    );
  });
});
