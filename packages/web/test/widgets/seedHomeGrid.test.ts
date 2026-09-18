import { expect, test, vi } from "vite-plus/test";

import { activeFilesQuery$ } from "@/lib/library/queries";
import { settingsDocumentQuery$ } from "@/lib/settings/queries";
import { seedHomeGrid } from "@/lib/widgets/seedHomeGrid";
import { widgetFoldersQuery$ } from "@/lib/widgets/widgetFolders";
import { activeWidgetDefinitionsQuery$ } from "@/lib/widgets/widgetQueries";
import type { SaveFileInput, SaveFileResult } from "@/lib/library/fileStorage";
import type { FileMeta } from "@/types/library";

const testState = vi.hoisted(() => {
  const saveFileToOpfs = vi.fn();
  return { saveFileToOpfs };
});

vi.mock("@/lib/library/fileStorage", async () => {
  const actual = await vi.importActual<typeof import("@/lib/library/fileStorage")>(
    "@/lib/library/fileStorage",
  );

  return {
    ...actual,
    saveFileToOpfs: testState.saveFileToOpfs,
  };
});

interface FakeFolder {
  id: string;
  name: string;
  parentId: string | null;
  reservedKind: "widgets" | "widgetDefinition" | null;
  deletedAt: Date | null;
  purgedAt: Date | null;
}

interface FakeDefinition {
  id: string;
  kind: string;
  builtinKey: string | null;
  name: string;
  dataSourceName: string;
  folderId: string | null;
  deletedAt: Date | null;
}

interface FakeInstance {
  id: string;
  definitionId: string;
  sortOrder: number;
  deletedAt: Date | null;
}

interface Commit {
  name: string;
  args: Record<string, unknown>;
}

interface FolderCreatedArgs {
  id: string;
  name: string;
  parentId?: string | null;
  reservedKind?: FakeFolder["reservedKind"];
}

interface FileCreatedArgs {
  id: string;
  name: string;
  type: FileMeta["type"];
  mimeType: string;
  sizeBytes: number;
  storageType: FileMeta["storageType"];
  storagePath: string;
  parentId?: string | null;
  createdAt: Date;
}

interface FileUpdatedArgs {
  id: string;
  parentId?: string | null;
}

interface WidgetDefinitionCreatedArgs {
  id: string;
  kind: string;
  builtinKey?: string | null;
  name: string;
  dataSourceName: string;
  folderId?: string | null;
}

interface WidgetDefinitionUpdatedArgs {
  id: string;
  name?: string;
  folderId?: string;
}

interface WidgetInstanceCreatedArgs {
  id: string;
  definitionId: string;
  sortOrder: number;
}

interface SettingsSetArgs {
  value: Record<string, unknown>;
}

// A minimal in-memory store that actually applies the events seedHomeGrid commits, so a second
// call sees the real resulting state — proving the seed is idempotent, not just single-shot.
const createFakeStore = (
  initial: Partial<{
    settings: Record<string, unknown>;
    folders: FakeFolder[];
    files: FileMeta[];
  }> = {},
) => {
  const settings: Record<string, unknown> = { ...initial.settings };
  const folders: FakeFolder[] = [...(initial.folders ?? [])];
  const files: FileMeta[] = [...(initial.files ?? [])];
  const definitions: FakeDefinition[] = [];
  const instances: FakeInstance[] = [];

  const commit = vi.fn((...events: unknown[]) => {
    const event = events[0] as Commit;
    switch (event.name) {
      case "v1.FolderCreated": {
        const args = event.args as unknown as FolderCreatedArgs;
        folders.push({
          id: args.id,
          name: args.name,
          parentId: args.parentId ?? null,
          reservedKind: args.reservedKind ?? null,
          deletedAt: null,
          purgedAt: null,
        });
        break;
      }
      case "v1.FileCreated": {
        const args = event.args as unknown as FileCreatedArgs;
        files.push({
          id: args.id,
          name: args.name,
          type: args.type,
          mimeType: args.mimeType,
          sizeBytes: args.sizeBytes,
          storageType: args.storageType,
          storagePath: args.storagePath,
          metaPath: `/files/${args.id}/${args.id}.meta.json`,
          parentId: args.parentId ?? null,
          positionX: null,
          positionY: null,
          createdAt: args.createdAt.getTime(),
          updatedAt: args.createdAt.getTime(),
          durationSec: null,
          transcriptPath: null,
          transcriptPreview: null,
        });
        break;
      }
      case "v1.FileUpdated": {
        const args = event.args as unknown as FileUpdatedArgs;
        const index = files.findIndex((file) => file.id === args.id);
        if (index >= 0) {
          files[index] = {
            ...files[index],
            ...(args.parentId !== undefined ? { parentId: args.parentId } : {}),
          };
        }
        break;
      }
      case "v1.WidgetDefinitionCreated": {
        const args = event.args as unknown as WidgetDefinitionCreatedArgs;
        definitions.push({
          id: args.id,
          kind: args.kind,
          builtinKey: args.builtinKey ?? null,
          name: args.name,
          dataSourceName: args.dataSourceName,
          folderId: args.folderId ?? null,
          deletedAt: null,
        });
        break;
      }
      case "v1.WidgetDefinitionUpdated": {
        const args = event.args as unknown as WidgetDefinitionUpdatedArgs;
        const index = definitions.findIndex((definition) => definition.id === args.id);
        if (index >= 0) {
          definitions[index] = {
            ...definitions[index],
            ...(args.name !== undefined ? { name: args.name } : {}),
            ...(args.folderId !== undefined ? { folderId: args.folderId } : {}),
          };
        }
        break;
      }
      case "v1.WidgetInstanceCreated": {
        const args = event.args as unknown as WidgetInstanceCreatedArgs;
        instances.push({
          id: args.id,
          definitionId: args.definitionId,
          sortOrder: args.sortOrder,
          deletedAt: null,
        });
        break;
      }
      case "settingsSet": {
        const args = event.args as unknown as SettingsSetArgs;
        Object.assign(settings, args.value);
        break;
      }
      default:
        break;
    }
  });

  const query = vi.fn((query: unknown) => {
    if (query === settingsDocumentQuery$) return settings;
    if (query === widgetFoldersQuery$) return folders;
    if (query === activeFilesQuery$) return files;
    if (query === activeWidgetDefinitionsQuery$) {
      return definitions.filter((definition) => !definition.deletedAt);
    }
    return [];
  });

  return { commit, query, settings, folders, files, definitions, instances };
};

const stubSaveFileToOpfs = () => {
  let call = 0;
  testState.saveFileToOpfs.mockImplementation(
    async (input: SaveFileInput): Promise<SaveFileResult> => {
      call += 1;
      const id = `${input.name}-id-${call}`;
      const meta: FileMeta = {
        id,
        name: input.name,
        type: input.type,
        mimeType: input.mimeType ?? "application/json",
        sizeBytes: 10,
        storageType: "opfs",
        storagePath: `/files/${id}/${id}`,
        metaPath: `/files/${id}/${id}.meta.json`,
        parentId: input.parentId ?? null,
        positionX: null,
        positionY: null,
        createdAt: 1_000,
        updatedAt: 1_000,
        durationSec: null,
        transcriptPath: null,
        transcriptPreview: null,
      };
      return { id, meta };
    },
  );
};

test("seeds a builtin Definition, Instance, and Widgets folder for calendar, todo, and recent in order", async () => {
  const store = createFakeStore();
  stubSaveFileToOpfs();

  await seedHomeGrid({ store, legacyVisibility: {} });

  const commits = store.commit.mock.calls.map((call) => call[0] as Commit);

  const definitionEvents = commits.filter((event) => event.name === "v1.WidgetDefinitionCreated");
  expect(definitionEvents).toHaveLength(3);
  expect(definitionEvents.map((event) => event.args.builtinKey)).toEqual([
    "calendar",
    "todo",
    "recent",
  ]);
  expect(definitionEvents.every((event) => event.args.kind === "builtin")).toBe(true);
  expect(definitionEvents.every((event) => Boolean(event.args.folderId))).toBe(true);

  const instanceEvents = commits.filter((event) => event.name === "v1.WidgetInstanceCreated");
  expect(instanceEvents).toHaveLength(3);
  expect(instanceEvents.map((event) => event.args.sortOrder)).toEqual([0, 1, 2]);
  expect(instanceEvents.map((event) => event.args.definitionId)).toEqual(
    definitionEvents.map((event) => event.args.id),
  );

  const rootFolderCreated = commits.find(
    (event) => event.name === "v1.FolderCreated" && event.args.reservedKind === "widgets",
  );
  expect(rootFolderCreated?.args.name).toBe("Widgets");

  const definitionFolderEvents = commits.filter(
    (event) => event.name === "v1.FolderCreated" && event.args.reservedKind === "widgetDefinition",
  );
  expect(definitionFolderEvents).toHaveLength(3);
  expect(definitionFolderEvents.map((event) => event.args.parentId)).toEqual([
    rootFolderCreated?.args.id,
    rootFolderCreated?.args.id,
    rootFolderCreated?.args.id,
  ]);

  const manifestFileEvents = commits.filter(
    (event) => event.name === "v1.FileCreated" && event.args.name === "widget.json",
  );
  expect(manifestFileEvents).toHaveLength(3);

  const settingsEvent = commits.find((event) => event.name === "settingsSet");
  expect(settingsEvent?.args.value).toMatchObject({
    homeGridSeeded: true,
    widgetFoldersSeeded: true,
  });
});

test("still creates a Definition but skips the Instance for a widget hidden by the legacy toggle", async () => {
  const store = createFakeStore();
  stubSaveFileToOpfs();

  await seedHomeGrid({ store, legacyVisibility: { calendar: false } });

  const commits = store.commit.mock.calls.map((call) => call[0] as Commit);
  const definitionEvents = commits.filter((event) => event.name === "v1.WidgetDefinitionCreated");
  expect(definitionEvents).toHaveLength(3);

  const instanceEvents = commits.filter((event) => event.name === "v1.WidgetInstanceCreated");
  const calendarDefinitionId = definitionEvents.find(
    (event) => event.args.builtinKey === "calendar",
  )?.args.id;
  expect(instanceEvents).toHaveLength(2);
  expect(instanceEvents.map((event) => event.args.sortOrder)).toEqual([0, 1]);
  expect(instanceEvents.some((event) => event.args.definitionId === calendarDefinitionId)).toBe(
    false,
  );
});

test("moves a root Today Tasks document into Widgets/Todo during a fresh seed", async () => {
  const rootTodoDocument: FileMeta = {
    id: "root-todo",
    name: "Today Tasks",
    type: "document",
    mimeType: "text/markdown",
    sizeBytes: 12,
    storageType: "opfs",
    storagePath: "/files/root-todo/root-todo.md",
    metaPath: "/files/root-todo/root-todo.meta.json",
    parentId: null,
    positionX: null,
    positionY: null,
    createdAt: 1_000,
    updatedAt: 1_000,
    durationSec: null,
    transcriptPath: null,
    transcriptPreview: null,
  };
  const store = createFakeStore({ files: [rootTodoDocument] });
  stubSaveFileToOpfs();

  await seedHomeGrid({ store, legacyVisibility: {} });

  const todoFolder = store.folders.find(
    (folder) =>
      folder.reservedKind === "widgetDefinition" &&
      store.definitions.find((definition) => definition.builtinKey === "todo")?.folderId ===
        folder.id,
  );
  expect(todoFolder).toBeDefined();

  const movedFile = store.files.find((file) => file.id === "root-todo");
  expect(movedFile?.parentId).toBe(todoFolder?.id);
});

test("does nothing once the Widgets folders have already been seeded", async () => {
  const store = createFakeStore({
    settings: { homeGridSeeded: true, widgetFoldersSeeded: true },
  });

  await seedHomeGrid({ store, legacyVisibility: {} });

  expect(store.commit).not.toHaveBeenCalled();
});

test("backfills Widgets folders for a legacy install that already has homeGridSeeded but no folders", async () => {
  const legacyDefinitions = [
    { id: "builtin:calendar", builtinKey: "calendar", name: "Calendar", folderId: null },
    { id: "builtin:todo", builtinKey: "todo", name: "Todo", folderId: null },
    { id: "builtin:recent", builtinKey: "recent", name: "Recent", folderId: null },
  ];
  const store = createFakeStore({ settings: { homeGridSeeded: true } });
  store.definitions.push(
    ...legacyDefinitions.map((definition) => ({
      ...definition,
      kind: "builtin",
      dataSourceName: "recentFiles",
      deletedAt: null,
    })),
  );
  stubSaveFileToOpfs();

  await seedHomeGrid({ store, legacyVisibility: {} });

  const commits = store.commit.mock.calls.map((call) => call[0] as Commit);
  expect(commits.some((event) => event.name === "v1.WidgetInstanceCreated")).toBe(false);

  const rootFolderCreated = commits.find(
    (event) => event.name === "v1.FolderCreated" && event.args.reservedKind === "widgets",
  );
  expect(rootFolderCreated).toBeDefined();

  const definitionFolderEvents = commits.filter(
    (event) => event.name === "v1.FolderCreated" && event.args.reservedKind === "widgetDefinition",
  );
  expect(definitionFolderEvents).toHaveLength(3);

  expect(
    definitionFolderEvents
      .map((event) => String(event.args.name))
      .sort((left, right) => left.localeCompare(right)),
  ).toEqual(["Calendar", "Recent", "Todo"]);

  const settingsEvent = commits.find((event) => event.name === "settingsSet");
  expect(settingsEvent?.args.value).toMatchObject({ widgetFoldersSeeded: true });

  // The legacy rows' folderId is backfilled too, not just matched transiently by name — so a
  // later read (e.g. TodoPanel resolving its todoFolderId) doesn't need to re-derive the folder.
  const updateEvents = commits.filter((event) => event.name === "v1.WidgetDefinitionUpdated");
  expect(updateEvents).toHaveLength(3);
  expect(updateEvents.every((event) => typeof event.args.folderId === "string")).toBe(true);
  for (const definition of store.definitions) {
    const folder = store.folders.find(
      (candidate) =>
        candidate.reservedKind === "widgetDefinition" && candidate.name === definition.name,
    );
    expect(definition.folderId).toBe(folder?.id);
  }

  // Calling it again afterwards is a true no-op: everything is already in place.
  store.commit.mockClear();
  await seedHomeGrid({ store, legacyVisibility: {} });
  expect(store.commit).not.toHaveBeenCalled();
});

test("shares one in-flight run across concurrent calls (e.g. a React StrictMode double-invoked effect)", async () => {
  const store = createFakeStore();
  stubSaveFileToOpfs();

  const [firstResult, secondResult] = await Promise.allSettled([
    seedHomeGrid({ store, legacyVisibility: {} }),
    seedHomeGrid({ store, legacyVisibility: {} }),
  ]);

  expect(firstResult.status).toBe("fulfilled");
  expect(secondResult.status).toBe("fulfilled");

  const commits = store.commit.mock.calls.map((call) => call[0] as Commit);

  const rootFolderEvents = commits.filter(
    (event) => event.name === "v1.FolderCreated" && event.args.reservedKind === "widgets",
  );
  expect(rootFolderEvents).toHaveLength(1);

  const definitionFolderEvents = commits.filter(
    (event) => event.name === "v1.FolderCreated" && event.args.reservedKind === "widgetDefinition",
  );
  expect(definitionFolderEvents).toHaveLength(3);

  const definitionEvents = commits.filter((event) => event.name === "v1.WidgetDefinitionCreated");
  expect(definitionEvents).toHaveLength(3);

  const instanceEvents = commits.filter((event) => event.name === "v1.WidgetInstanceCreated");
  expect(instanceEvents).toHaveLength(3);

  const settingsEvents = commits.filter((event) => event.name === "settingsSet");
  expect(settingsEvents).toHaveLength(1);
});
