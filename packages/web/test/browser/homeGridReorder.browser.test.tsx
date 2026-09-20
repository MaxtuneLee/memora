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

function HomeGridHarnessInner({
  initialOrder,
  onReorder,
  onRemove,
}: {
  initialOrder: WidgetKey[];
  onReorder: (order: WidgetKey[]) => void;
  onRemove?: (key: WidgetKey) => void;
}): JSX.Element {
  const [order, setOrder] = useState(initialOrder);
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
    instance: makeInstance(key, index),
    definition: definitionsByKey[key],
  }));

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
        reducedMotion
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

const dragTileOnto = async (fromWidgetName: string, toWidgetName: string) => {
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
});
