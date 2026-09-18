import { type JSX, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { page } from "vitest/browser";

import {
  AddWidgetDialog,
  type PlaceWidgetInput,
} from "@/components/dashboard/homeGrid/AddWidgetDialog";
import { HomeGrid } from "@/components/dashboard/homeGrid/HomeGrid";
import type { widgetDefinition, widgetInstance } from "@/livestore/widget";

const SAVED_DEFINITION: widgetDefinition = {
  id: "def-recent-research",
  kind: "generated",
  builtinKey: null,
  name: "Recent research",
  widgetCode: "<div>Recent research</div>",
  dataSourceName: "recentFiles",
  dataSourceParams: JSON.stringify({ limit: 5 }),
  createdAt: new Date(0),
  updatedAt: new Date(0),
  deletedAt: null,
};

interface PlacedInstance {
  id: string;
  definitionId: string;
  params: Record<string, unknown>;
}

const makeInstance = (placed: PlacedInstance, sortOrder: number): widgetInstance => ({
  id: placed.id,
  definitionId: placed.definitionId,
  sortOrder,
  params: JSON.stringify(placed.params),
  createdAt: new Date(0),
  updatedAt: new Date(0),
  deletedAt: null,
});

function AddWidgetHarness(): JSX.Element {
  const [instances, setInstances] = useState<PlacedInstance[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);

  const handlePlace = (input: PlaceWidgetInput) => {
    setInstances((current) => [
      ...current,
      { id: `inst-${current.length}`, definitionId: input.definitionId, params: input.params },
    ]);
  };

  const tiles = instances.map((placed, index) => ({
    instance: makeInstance(placed, index),
    definition: placed.definitionId === SAVED_DEFINITION.id ? SAVED_DEFINITION : null,
  }));

  return (
    <div style={{ width: "600px" }}>
      <HomeGrid
        tiles={tiles}
        renderWidget={(definition, instance) => {
          const limit = (JSON.parse(instance.params) as { limit?: number }).limit ?? "default";
          return (
            <div>
              {definition.name} (limit: {limit})
            </div>
          );
        }}
        onReorder={() => {}}
        onRemove={() => {}}
        onAddWidget={() => setDialogOpen(true)}
      />
      <AddWidgetDialog
        open={dialogOpen}
        definitions={[SAVED_DEFINITION]}
        onOpenChange={setDialogOpen}
        onPlace={handlePlace}
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

const placeDefinitionWithLimit = async (limit: string) => {
  await page.getByRole("button", { name: "Add widget" }).click();
  await page.getByText("Recent research", { exact: true }).click();
  const limitInput = page.getByLabelText("Files to show");
  await limitInput.clear();
  await limitInput.fill(limit);
  await page.getByRole("button", { name: "Add to Home Grid" }).click();
};

describe("Home Grid add-widget picker", () => {
  it("places a saved definition with configured params, and the same definition again independently", async () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    root.render(<AddWidgetHarness />);

    await expect
      .element(page.getByText("No widgets on your Home Grid yet."))
      .toBeVisible();

    await placeDefinitionWithLimit("8");

    await expect.element(page.getByText("Recent research (limit: 8)")).toBeVisible();

    await placeDefinitionWithLimit("3");

    await expect.element(page.getByText("Recent research (limit: 8)")).toBeVisible();
    await expect.element(page.getByText("Recent research (limit: 3)")).toBeVisible();
  });
});
