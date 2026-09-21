import { ChatCircleDotsIcon } from "@phosphor-icons/react";
import { type JSX, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { page } from "vitest/browser";

import {
  AddWidgetDrawer,
  type PlaceWidgetInput,
} from "@/components/dashboard/homeGrid/AddWidgetDrawer";
import { HomeGrid } from "@/components/dashboard/homeGrid/HomeGrid";
import type { RecentItem } from "@/components/dashboard/recentItems";
import type { widgetDefinition, widgetInstance } from "@/livestore/widget";
import type { WritableReactiveWidgetStore } from "@/lib/widgets/widgetStore";

// A real reactive store returns a stable reference until the underlying data changes; a fresh
// literal on every call would make useDataSourceValue's liveSignal dependency change on every
// render and loop forever.
const EMPTY_ROWS: readonly unknown[] = [];

const FAKE_STORE = {
  useQuery: () => EMPTY_ROWS,
  query: () => EMPTY_ROWS,
  commit: () => {},
} as unknown as WritableReactiveWidgetStore;

const GENERATED_DEFINITION: widgetDefinition = {
  id: "def-recent-research",
  kind: "generated",
  builtinKey: null,
  name: "Recent research",
  widgetCode: "<div>Recent research</div>",
  dataSourceName: "recentFiles",
  dataSourceParams: JSON.stringify({ limit: 5 }),
  // No source file: keeps this test out of OPFS entirely (useWidgetSourceCode reports "missing"
  // for a null sourceFileId without ever reading a file) — the picker/placement flow under test
  // doesn't depend on the generated preview actually rendering.
  folderId: null,
  sourceFileId: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  deletedAt: null,
};

const BUILTIN_DEFINITION: widgetDefinition = {
  id: "builtin:recent",
  kind: "builtin",
  builtinKey: "recent",
  // Distinct from RecentWidget's own hardcoded "Recent" heading inside the preview, so the two
  // "Recent" texts on screen don't collide in getByText lookups.
  name: "Recent files widget",
  widgetCode: "",
  dataSourceName: "recentFiles",
  dataSourceParams: "{}",
  folderId: null,
  sourceFileId: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  deletedAt: null,
};

const RECENT_ITEM: RecentItem = {
  id: "file-1",
  title: "Notes.md",
  subtitle: "Updated just now",
  href: "/desktop",
  updatedAt: 1,
  icon: ChatCircleDotsIcon,
  tone: "file",
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
  columnSpan: 1,
  rowSpan: 1,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  deletedAt: null,
});

function AddWidgetHarness({ definitions }: { definitions: widgetDefinition[] }): JSX.Element {
  const [instances, setInstances] = useState<PlacedInstance[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [defs, setDefs] = useState(definitions);

  const handlePlace = (input: PlaceWidgetInput) => {
    setInstances((current) => [
      ...current,
      { id: `inst-${current.length}`, definitionId: input.definitionId, params: input.params },
    ]);
  };

  const definitionsById = new Map(defs.map((definition) => [definition.id, definition]));
  const tiles = instances.map((placed, index) => ({
    instance: makeInstance(placed, index),
    definition: definitionsById.get(placed.definitionId) ?? null,
  }));

  return (
    // The builtin "recent" preview renders RecentWidget, which links to items via react-router's
    // <Link> — this harness needs a Router in scope, same as DashboardPage gets from AppLayout.
    <MemoryRouter>
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
        <AddWidgetDrawer
          open={dialogOpen}
          definitions={defs}
          placedDefinitionIds={new Set(instances.map((instance) => instance.definitionId))}
          store={FAKE_STORE}
          files={[]}
          recentItems={[RECENT_ITEM]}
          onOpenChange={setDialogOpen}
          onPlace={handlePlace}
          onRename={(id, name) => {
            setDefs((current) =>
              current.map((definition) =>
                definition.id === id ? { ...definition, name } : definition,
              ),
            );
          }}
          onDelete={(id) => {
            setDefs((current) => current.filter((definition) => definition.id !== id));
          }}
        />
      </div>
    </MemoryRouter>
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

const renderHarness = (definitions: widgetDefinition[]) => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  root.render(<AddWidgetHarness definitions={definitions} />);
};

// The drawer stays open across placements (it's a browse-and-place surface, not a one-shot
// picker), so a card's "Add to Home Grid" button can be clicked more than once in a session.
const placeWithLimit = async (limit: string) => {
  const limitInput = page.getByLabelText("Files to show");
  await limitInput.clear();
  await limitInput.fill(limit);
  await page.getByRole("button", { name: "Add to Home Grid" }).click();
};

describe("Home Grid add-widget drawer", () => {
  it("places a saved definition with configured params, and the same definition again independently", async () => {
    renderHarness([GENERATED_DEFINITION]);

    await expect.element(page.getByText("No widgets yet.")).toBeVisible();

    await page.getByRole("button", { name: "Add widget" }).click();
    await placeWithLimit("8");

    await expect.element(page.getByText("Recent research (limit: 8)")).toBeVisible();

    await placeWithLimit("3");

    await expect.element(page.getByText("Recent research (limit: 8)")).toBeVisible();
    await expect.element(page.getByText("Recent research (limit: 3)")).toBeVisible();
  });

  it("lists a builtin definition, places it, and marks it Placed once it's on the grid", async () => {
    renderHarness([BUILTIN_DEFINITION]);

    await page.getByRole("button", { name: "Add widget" }).click();
    await expect.element(page.getByText("Recent files widget", { exact: true })).toBeVisible();
    expect(page.getByText("Placed", { exact: true }).elements()).toHaveLength(0);

    await page.getByRole("button", { name: "Add to Home Grid" }).click();
    await expect.element(page.getByText("Recent files widget (limit: default)")).toBeVisible();
    await expect.element(page.getByText("Placed", { exact: true })).toBeVisible();
  });

  it("renames and deletes a generated definition from the drawer", async () => {
    renderHarness([GENERATED_DEFINITION]);

    await page.getByRole("button", { name: "Add widget" }).click();
    await page.getByRole("button", { name: "Rename Recent research" }).click();
    const nameInput = page.getByLabelText("Widget name");
    await nameInput.clear();
    await nameInput.fill("My research feed");
    // No keyboard "press" on this locator API — blur the input by clicking elsewhere, which
    // commits the rename the same way pressing Enter would.
    await page.getByRole("heading", { name: "Add widget" }).click();

    await expect.element(page.getByText("My research feed", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Delete My research feed" }).click();
    await expect.element(page.getByText("No saved widgets yet.")).toBeVisible();
  });
});
