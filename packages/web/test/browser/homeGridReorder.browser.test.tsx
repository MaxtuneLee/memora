import { type JSX, useCallback, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { page } from "vitest/browser";

import { HomeGrid } from "@/components/dashboard/homeGrid/HomeGrid";
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
  createdAt: new Date(0),
  updatedAt: new Date(0),
  deletedAt: null,
});

const makeInstance = (key: WidgetKey, sortOrder: number): widgetInstance => ({
  id: `inst-${key}`,
  definitionId: `def-${key}`,
  sortOrder,
  params: "{}",
  createdAt: new Date(0),
  updatedAt: new Date(0),
  deletedAt: null,
});

const definitionsByKey: Record<WidgetKey, widgetDefinition> = {
  a: makeDefinition("a"),
  b: makeDefinition("b"),
  c: makeDefinition("c"),
};

function HomeGridHarness({
  initialOrder,
  onReorder,
  onRemove,
}: {
  initialOrder: WidgetKey[];
  onReorder: (order: WidgetKey[]) => void;
  onRemove?: (key: WidgetKey) => void;
}): JSX.Element {
  const [order, setOrder] = useState(initialOrder);

  const handleReorder = useCallback(
    (orderedIds: string[]) => {
      const nextOrder = orderedIds.map((id) => id.replace("inst-", "") as WidgetKey);
      setOrder(nextOrder);
      onReorder(nextOrder);
    },
    [onReorder],
  );

  const tiles = order.map((key, index) => ({
    instance: makeInstance(key, index),
    definition: definitionsByKey[key],
  }));

  const handleRemove = useCallback(
    (instanceId: string) => {
      const key = instanceId.replace("inst-", "") as WidgetKey;
      setOrder((currentOrder) => currentOrder.filter((currentKey) => currentKey !== key));
      onRemove?.(key);
    },
    [onRemove],
  );

  return (
    <div style={{ width: "600px" }}>
      <HomeGrid
        tiles={tiles}
        renderWidget={(definition) => <div style={{ height: "80px" }}>{definition.name}</div>}
        onReorder={handleReorder}
        onRemove={handleRemove}
      />
    </div>
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

const dragTileHandleOnto = async (fromTestLabel: string, toWidgetName: string) => {
  const handle = page.getByRole("button", { name: fromTestLabel }).element();
  const target = page.getByText(toWidgetName).element();
  const handleBounds = handle.getBoundingClientRect();
  const targetBounds = target.getBoundingClientRect();
  const sourceX = handleBounds.left + handleBounds.width / 2;
  const sourceY = handleBounds.top + handleBounds.height / 2;
  const targetX = targetBounds.left + targetBounds.width / 2;
  const targetY = targetBounds.top + targetBounds.height / 2;

  handle.dispatchEvent(
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
  document.dispatchEvent(
    new MouseEvent("mouseup", {
      bubbles: true,
      button: 0,
      clientX: targetX,
      clientY: targetY,
    }),
  );
};

const readTileOrder = (): string[] => {
  return Array.from(document.querySelectorAll("[data-widget-instance-id]")).map(
    (element) => element.textContent ?? "",
  );
};

describe("Home Grid drag-to-reorder", () => {
  it("persists a real pointer-drag reorder across a simulated reload", async () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    let persistedOrder: WidgetKey[] = ["a", "b", "c"];
    root.render(
      <HomeGridHarness
        initialOrder={persistedOrder}
        onReorder={(order) => {
          persistedOrder = order;
        }}
      />,
    );

    await expect.poll(readTileOrder).toEqual(["Widget A", "Widget B", "Widget C"]);

    await dragTileHandleOnto("Reorder Widget A", "Widget C");

    await expect.poll(readTileOrder).toEqual(["Widget B", "Widget C", "Widget A"]);
    expect(persistedOrder).toEqual(["b", "c", "a"]);

    root.unmount();
    container.remove();

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    root.render(<HomeGridHarness initialOrder={persistedOrder} onReorder={() => {}} />);

    await expect.poll(readTileOrder).toEqual(["Widget B", "Widget C", "Widget A"]);
  });

  it("keeps a removed tile off the grid without deleting its Definition across a simulated reload", async () => {
    let persistedOrder: WidgetKey[] = ["a", "b", "c"];
    const removedDefinitionId = definitionsByKey.b.id;

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    root.render(
      <HomeGridHarness
        initialOrder={persistedOrder}
        onReorder={() => {}}
        onRemove={(key) => {
          persistedOrder = persistedOrder.filter((persistedKey) => persistedKey !== key);
        }}
      />,
    );

    await page.getByRole("button", { name: "Remove Widget B from Home Grid" }).click();

    await expect.poll(readTileOrder).toEqual(["Widget A", "Widget C"]);
    expect(persistedOrder).toEqual(["a", "c"]);
    expect(definitionsByKey.b.id).toBe(removedDefinitionId);

    root.unmount();
    container.remove();

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    root.render(<HomeGridHarness initialOrder={persistedOrder} onReorder={() => {}} />);

    await expect.poll(readTileOrder).toEqual(["Widget A", "Widget C"]);
  });
});
