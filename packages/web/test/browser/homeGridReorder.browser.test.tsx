import { Toast } from "@base-ui/react/toast";
import { type JSX, useCallback, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { page } from "vitest/browser";

import ToastStack from "@/components/ToastStack";
import { HomeGrid } from "@/components/dashboard/homeGrid/HomeGrid";
import { LONG_PRESS_MS } from "@/components/dashboard/homeGrid/HomeGridTile";
import type { widgetDefinition, widgetInstance } from "@/livestore/widget";

const WIDGET_KEYS = ["a", "b", "c"] as const;
type WidgetKey = (typeof WIDGET_KEYS)[number];

const makeDefinition = (key: WidgetKey): widgetDefinition => ({
  id: `def-${key}`,
  kind: "builtin",
  builtinKey: null,
  name: `Widget ${key.toUpperCase()}`,
  widgetCode: "",
  dataSourceName: "recentFiles",
  dataSourceParams: "{}",
  folderId: null,
  sourceFileId: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  deletedAt: null,
});

type Spans = { columnSpan: number; rowSpan: number };

const makeInstance = (
  key: WidgetKey,
  sortOrder: number,
  spans: Spans = { columnSpan: 1, rowSpan: 1 },
): widgetInstance => ({
  id: `inst-${key}`,
  definitionId: `def-${key}`,
  sortOrder,
  params: "{}",
  columnSpan: spans.columnSpan,
  rowSpan: spans.rowSpan,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  deletedAt: null,
});

const definitionsByKey: Record<WidgetKey, widgetDefinition> = {
  a: makeDefinition("a"),
  b: makeDefinition("b"),
  c: makeDefinition("c"),
};

function HomeGridHarnessInner({
  initialOrder,
  onReorder,
  onRemove,
  onResize,
  reducedMotion = true,
}: {
  initialOrder: WidgetKey[];
  onReorder: (order: WidgetKey[]) => void;
  onRemove?: (key: WidgetKey) => void;
  onResize?: (key: WidgetKey, spans: Spans) => void;
  reducedMotion?: boolean;
}): JSX.Element {
  const [order, setOrder] = useState(initialOrder);
  const [spansByKey, setSpansByKey] = useState<Partial<Record<WidgetKey, Spans>>>({});
  const { add, close } = Toast.useToastManager();

  const handleReorder = useCallback(
    (orderedIds: string[]) => {
      const nextOrder = orderedIds.map((id) => id.replace("inst-", "") as WidgetKey);
      setOrder(nextOrder);
      onReorder(nextOrder);
    },
    [onReorder],
  );

  const tiles = order.map((key, index) => ({
    instance: makeInstance(key, index, spansByKey[key]),
    definition: definitionsByKey[key],
  }));

  const handleResize = useCallback(
    (instanceId: string, columnSpan: number, rowSpan: number) => {
      const key = instanceId.replace("inst-", "") as WidgetKey;
      setSpansByKey((current) => ({ ...current, [key]: { columnSpan, rowSpan } }));
      onResize?.(key, { columnSpan, rowSpan });
    },
    [onResize],
  );

  const handleRemove = useCallback(
    (instanceId: string) => {
      const key = instanceId.replace("inst-", "") as WidgetKey;
      const removedIndex = order.indexOf(key);
      setOrder((currentOrder) => currentOrder.filter((currentKey) => currentKey !== key));
      onRemove?.(key);

      const toastId = `toast-${key}`;
      add({
        id: toastId,
        title: `${definitionsByKey[key].name} removed`,
        timeout: 0,
        actionProps: {
          children: "Undo",
          onClick: () => {
            setOrder((currentOrder) => {
              const next = [...currentOrder];
              next.splice(removedIndex, 0, key);
              return next;
            });
            close(toastId);
          },
        },
      });
    },
    [add, close, onRemove, order],
  );

  return (
    <div style={{ width: "600px" }}>
      <HomeGrid
        tiles={tiles}
        renderWidget={(definition) => <div style={{ height: "80px" }}>{definition.name}</div>}
        onReorder={handleReorder}
        onRemove={handleRemove}
        onResize={handleResize}
        reducedMotion={reducedMotion}
      />
      <ToastStack
        render={(toast) => (
          <Toast.Content>
            <Toast.Title>{toast.title as string}</Toast.Title>
            <Toast.Action />
          </Toast.Content>
        )}
      />
    </div>
  );
}

function HomeGridHarness(props: {
  initialOrder: WidgetKey[];
  onReorder: (order: WidgetKey[]) => void;
  onRemove?: (key: WidgetKey) => void;
  onResize?: (key: WidgetKey, spans: Spans) => void;
  reducedMotion?: boolean;
}): JSX.Element {
  return (
    <Toast.Provider>
      <HomeGridHarnessInner {...props} />
    </Toast.Provider>
  );
}

let container: HTMLDivElement | undefined;
let root: Root | undefined;

afterEach(() => {
  root?.unmount();
  root = undefined;
  container?.remove();
  container = undefined;
});

const enterEditModeViaButton = async () => {
  await page.getByRole("button", { name: "Edit" }).click();
};

const enterEditModeViaLongPress = async (widgetName: string, pointerType: "mouse" | "touch") => {
  const target = page.getByText(widgetName).element();
  const bounds = target.getBoundingClientRect();
  const x = bounds.left + bounds.width / 2;
  const y = bounds.top + bounds.height / 2;

  target.dispatchEvent(
    new PointerEvent("pointerdown", {
      bubbles: true,
      button: 0,
      clientX: x,
      clientY: y,
      pointerId: 1,
      pointerType,
      isPrimary: true,
    }),
  );
  await new Promise<void>((resolve) => setTimeout(resolve, LONG_PRESS_MS + 150));
  target.dispatchEvent(
    new PointerEvent("pointerup", {
      bubbles: true,
      clientX: x,
      clientY: y,
      pointerId: 1,
      pointerType,
      isPrimary: true,
    }),
  );
};

const beginDraggingTileOnto = async (fromWidgetName: string, toWidgetName: string) => {
  const source = page.getByText(fromWidgetName).element();
  const target = page.getByText(toWidgetName).element();
  const sourceBounds = source.getBoundingClientRect();
  const targetBounds = target.getBoundingClientRect();
  const sourceX = sourceBounds.left + sourceBounds.width / 2;
  const sourceY = sourceBounds.top + sourceBounds.height / 2;
  const targetX = targetBounds.left + targetBounds.width / 2;
  const targetY = targetBounds.top + targetBounds.height / 2;

  source.dispatchEvent(
    new MouseEvent("mousedown", {
      bubbles: true,
      button: 0,
      buttons: 1,
      clientX: sourceX,
      clientY: sourceY,
    }),
  );
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  document.dispatchEvent(
    new MouseEvent("mousemove", {
      bubbles: true,
      buttons: 1,
      clientX: sourceX + 6,
      clientY: sourceY + 6,
    }),
  );
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  document.dispatchEvent(
    new MouseEvent("mousemove", {
      bubbles: true,
      buttons: 1,
      clientX: targetX,
      clientY: targetY,
    }),
  );
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

  return { targetX, targetY };
};

const finishDragging = async ({ targetX, targetY }: { targetX: number; targetY: number }) => {
  document.dispatchEvent(
    new MouseEvent("mouseup", {
      bubbles: true,
      button: 0,
      clientX: targetX,
      clientY: targetY,
    }),
  );
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
};

const dragTileOnto = async (fromWidgetName: string, toWidgetName: string) => {
  await finishDragging(await beginDraggingTileOnto(fromWidgetName, toWidgetName));
};

const dragTileWithPointerSteps = async (fromId: string, toId: string) => {
  const source = document.querySelector<HTMLElement>(
    `[data-widget-instance-id="${fromId}"] div[aria-hidden="true"]`,
  );
  const target = document.querySelector<HTMLElement>(
    `[data-widget-instance-id="${toId}"] div[aria-hidden="true"]`,
  );
  if (!source || !target) {
    throw new Error("Expected editable Home Grid tiles to expose drag masks");
  }

  const sourceBounds = source.getBoundingClientRect();
  const targetBounds = target.getBoundingClientRect();
  const sourceX = sourceBounds.left + sourceBounds.width / 2;
  const sourceY = sourceBounds.top + sourceBounds.height / 2;
  const targetX = targetBounds.left + targetBounds.width / 2;
  const targetY = targetBounds.top + targetBounds.height / 2;

  source.dispatchEvent(
    new MouseEvent("mousedown", {
      bubbles: true,
      button: 0,
      buttons: 1,
      clientX: sourceX,
      clientY: sourceY,
    }),
  );
  for (let step = 1; step <= 12; step += 1) {
    const progress = step / 12;
    document.dispatchEvent(
      new MouseEvent("mousemove", {
        bubbles: true,
        buttons: 1,
        clientX: sourceX + (targetX - sourceX) * progress,
        clientY: sourceY + (targetY - sourceY) * progress,
      }),
    );
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
  await finishDragging({ targetX, targetY });
};

const resizeHandlesCount = (): number =>
  document.querySelectorAll("[data-widget-instance-id] [data-resize-handle]").length;

const readTileSpans = (instanceId: string): string => {
  const tile = document.querySelector<HTMLElement>(`[data-widget-instance-id="${instanceId}"]`);
  return tile ? `${tile.style.gridColumn} / ${tile.style.gridRow}` : "";
};

const dragResizeHandle = async (instanceId: string, deltaX: number, deltaY: number) => {
  const handle = document.querySelector<HTMLElement>(
    `[data-widget-instance-id="${instanceId}"] [data-resize-handle]`,
  );
  if (!handle) {
    throw new Error(`Expected a resize handle on ${instanceId}`);
  }

  const bounds = handle.getBoundingClientRect();
  const startX = bounds.left + bounds.width / 2;
  const startY = bounds.top + bounds.height / 2;

  handle.dispatchEvent(
    new MouseEvent("mousedown", {
      bubbles: true,
      button: 0,
      buttons: 1,
      clientX: startX,
      clientY: startY,
    }),
  );
  for (let step = 1; step <= 6; step += 1) {
    const progress = step / 6;
    document.dispatchEvent(
      new MouseEvent("mousemove", {
        bubbles: true,
        buttons: 1,
        clientX: startX + deltaX * progress,
        clientY: startY + deltaY * progress,
      }),
    );
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
  document.dispatchEvent(
    new MouseEvent("mouseup", {
      bubbles: true,
      button: 0,
      clientX: startX + deltaX,
      clientY: startY + deltaY,
    }),
  );
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
};

const readTileOrder = (): string[] => {
  return Array.from(document.querySelectorAll("[data-widget-instance-id]")).map(
    (element) => element.textContent ?? "",
  );
};

const mount = (element: JSX.Element) => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  root.render(element);
};

describe("Home Grid edit mode", () => {
  it("hides tile controls until edit mode is entered, and a long-press enters it on both pointer and touch", async () => {
    mount(<HomeGridHarness initialOrder={["a", "b", "c"]} onReorder={() => {}} />);

    await expect.poll(readTileOrder).toEqual(["Widget A", "Widget B", "Widget C"]);
    expect(page.getByRole("button", { name: /^Remove/ }).elements()).toHaveLength(0);
    expect(page.getByRole("button", { name: "Done" }).elements()).toHaveLength(0);

    await enterEditModeViaLongPress("Widget A", "mouse");

    await expect
      .poll(() => page.getByRole("button", { name: /^Remove/ }).elements().length)
      .toBe(3);
    expect(page.getByRole("button", { name: "Done" }).elements()).toHaveLength(1);

    await page.getByRole("button", { name: "Done" }).click();
    await expect
      .poll(() => page.getByRole("button", { name: /^Remove/ }).elements().length)
      .toBe(0);

    await enterEditModeViaLongPress("Widget B", "touch");
    await expect
      .poll(() => page.getByRole("button", { name: /^Remove/ }).elements().length)
      .toBe(3);
  });

  it("reorders via whole-tile drag only while editing, and persists across a simulated reload", async () => {
    let persistedOrder: WidgetKey[] = ["a", "b", "c"];
    mount(
      <HomeGridHarness
        initialOrder={persistedOrder}
        onReorder={(order) => {
          persistedOrder = order;
        }}
      />,
    );
    await expect.poll(readTileOrder).toEqual(["Widget A", "Widget B", "Widget C"]);

    await dragTileOnto("Widget A", "Widget C");
    await expect.poll(readTileOrder).toEqual(["Widget A", "Widget B", "Widget C"]);

    await enterEditModeViaButton();
    await dragTileOnto("Widget A", "Widget C");

    await expect.poll(readTileOrder).toEqual(["Widget B", "Widget C", "Widget A"]);
    expect(persistedOrder).toEqual(["b", "c", "a"]);

    root?.unmount();
    container?.remove();
    mount(<HomeGridHarness initialOrder={persistedOrder} onReorder={() => {}} />);
    await expect.poll(readTileOrder).toEqual(["Widget B", "Widget C", "Widget A"]);
  });

  it("reorders across a continuous pointer drag", async () => {
    mount(<HomeGridHarness initialOrder={["a", "b", "c"]} onReorder={() => {}} />);
    await expect.poll(readTileOrder).toEqual(["Widget A", "Widget B", "Widget C"]);
    await enterEditModeViaButton();

    await dragTileWithPointerSteps("inst-a", "inst-c");

    await expect.poll(readTileOrder).toEqual(["Widget B", "Widget C", "Widget A"]);
  });

  it("animates neighbours into their sorted positions without outlining the drop target", async () => {
    mount(
      <HomeGridHarness initialOrder={["a", "b", "c"]} onReorder={() => {}} reducedMotion={false} />,
    );
    await expect.poll(readTileOrder).toEqual(["Widget A", "Widget B", "Widget C"]);
    await enterEditModeViaButton();

    const dragPosition = await beginDraggingTileOnto("Widget A", "Widget C");
    try {
      const targetTile = document.querySelector<HTMLElement>('[data-widget-instance-id="inst-c"]');

      expect(targetTile).not.toBeNull();
      expect(targetTile ? getComputedStyle(targetTile).boxShadow : "").toBe("none");
      await expect
        .poll(
          () =>
            ["inst-b", "inst-c"].some((id) => {
              const tile = document.querySelector<HTMLElement>(`[data-widget-instance-id="${id}"]`);
              return tile ? getComputedStyle(tile).transform !== "none" : false;
            }),
          { interval: 16, timeout: 180 },
        )
        .toBe(true);
    } finally {
      await finishDragging(dragPosition);
    }
  });

  it("removes a tile via an undoable toast that restores it at its previous order, then exits via Done", async () => {
    let persistedOrder: WidgetKey[] = ["a", "b", "c"];
    const removedDefinitionId = definitionsByKey.b.id;

    mount(
      <HomeGridHarness
        initialOrder={persistedOrder}
        onReorder={() => {}}
        onRemove={(key) => {
          persistedOrder = persistedOrder.filter((persistedKey) => persistedKey !== key);
        }}
      />,
    );

    await enterEditModeViaButton();
    await page.getByRole("button", { name: "Remove Widget B" }).click();

    await expect.poll(readTileOrder).toEqual(["Widget A", "Widget C"]);
    expect(persistedOrder).toEqual(["a", "c"]);
    expect(definitionsByKey.b.id).toBe(removedDefinitionId);

    await expect.poll(() => page.getByText("Widget B removed").elements().length).toBe(1);
    await page.getByRole("button", { name: "Undo" }).click();

    await expect.poll(readTileOrder).toEqual(["Widget A", "Widget B", "Widget C"]);

    await page.getByRole("button", { name: "Done" }).click();
    await expect
      .poll(() => page.getByRole("button", { name: /^Remove/ }).elements().length)
      .toBe(0);
    expect(page.getByRole("button", { name: "Edit" }).elements()).toHaveLength(1);
  });

  it("resizes a tile from its handle in edit mode, committing once on release", async () => {
    const resizes: { key: WidgetKey; spans: Spans }[] = [];
    mount(
      <HomeGridHarness
        initialOrder={["a", "b", "c"]}
        onReorder={() => {}}
        onResize={(key, spans) => resizes.push({ key, spans })}
      />,
    );

    await expect.poll(readTileOrder).toEqual(["Widget A", "Widget B", "Widget C"]);
    expect(resizeHandlesCount()).toBe(0);

    await enterEditModeViaButton();
    await expect.poll(resizeHandlesCount).toBe(3);
    expect(readTileSpans("inst-a")).toBe("span 1 / span 1");

    // The 600px harness renders two ~293px columns, so ~200px clears the midpoint of the
    // neighbouring cell on both axes and snaps the tile to 2x2.
    await dragResizeHandle("inst-a", 200, 200);

    await expect.poll(() => readTileSpans("inst-a")).toBe("span 2 / span 2");
    expect(resizes).toEqual([{ key: "a", spans: { columnSpan: 2, rowSpan: 2 } }]);
    // Resizing must never be read as the start of a whole-tile reorder drag.
    expect(readTileOrder()).toEqual(["Widget A", "Widget B", "Widget C"]);
  });

  it("commits nothing when a resize gesture ends without crossing a cell midpoint", async () => {
    const resizes: { key: WidgetKey; spans: Spans }[] = [];
    mount(
      <HomeGridHarness
        initialOrder={["a", "b", "c"]}
        onReorder={() => {}}
        onResize={(key, spans) => resizes.push({ key, spans })}
      />,
    );
    await enterEditModeViaButton();
    await expect.poll(resizeHandlesCount).toBe(3);

    await dragResizeHandle("inst-a", 12, 12);

    expect(resizes).toEqual([]);
    expect(readTileSpans("inst-a")).toBe("span 1 / span 1");
    expect(readTileOrder()).toEqual(["Widget A", "Widget B", "Widget C"]);
  });
});
