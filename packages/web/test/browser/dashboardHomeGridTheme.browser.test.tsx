import { type JSX, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
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

// Computed-style checks only: no assertions on generated StyleX class names. Mirrors
// test/browser/sharedControlsTheme.browser.test.tsx.
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

afterEach(() => {
  root?.unmount();
  container?.remove();
  document.body.removeAttribute("style");
  root = undefined;
  container = undefined;
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
