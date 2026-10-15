import { queryDb } from "@livestore/livestore";

import { fileEvents, fileTable, type file as LiveStoreFile } from "@/livestore/file";
import { folderEvents, folderTable, type folder as LiveStoreFolder } from "@/livestore/folder";
import type { useAppStore } from "@/livestore/store";
import {
  BUILTIN_WIDGET_KEYS,
  widgetDefinitionTable,
  widgetEvents,
  widgetInstanceTable,
  type widgetDefinition,
  type widgetInstance,
} from "@/livestore/widget";

// Everything seedHomeGrid creates lands within a second or two of the Widgets root.
const SEED_WINDOW_MS = 10_000;
const SEEDED_FILE_NAMES = new Set(["widget.json", "Today Tasks"]);

export interface SeedDedupeInput {
  folders: readonly LiveStoreFolder[];
  files: readonly LiveStoreFile[];
  instances: readonly widgetInstance[];
  definitions: readonly widgetDefinition[];
}

type SeedDedupeEvent =
  | ReturnType<typeof folderEvents.folderUpdated>
  | ReturnType<typeof folderEvents.folderDeleted>
  | ReturnType<typeof fileEvents.fileUpdated>
  | ReturnType<typeof fileEvents.fileDeleted>
  | ReturnType<typeof widgetEvents.widgetInstanceDeleted>;

const time = (value: Date | number): number => new Date(value).getTime();

/**
 * Every device seeds its own Widgets folder and Home widgets on first run. A device that used
 * Memora before turning on sync brings that set along, so the shared workspace ends up with one
 * set per device. This keeps the set the built-in definitions point to and returns the events
 * that move the others to the trash. Anything the person added under a duplicate Widgets folder
 * moves to the kept one instead.
 */
export const planSeedDedupe = ({
  folders,
  files,
  instances,
  definitions,
}: SeedDedupeInput): SeedDedupeEvent[] => {
  const active = folders.filter((folder) => !folder.deletedAt && !folder.purgedAt);
  const roots = active.filter((folder) => folder.reservedKind === "widgets");
  if (roots.length < 2) return [];

  const builtinFolderIds = new Set(
    definitions.filter((row) => row.kind === "builtin").map((row) => row.folderId),
  );
  const keep =
    roots.find((root) =>
      active.some((folder) => folder.parentId === root.id && builtinFolderIds.has(folder.id)),
    ) ??
    roots.reduce((oldest, root) => (time(root.createdAt) < time(oldest.createdAt) ? root : oldest));

  const now = new Date();
  const events: SeedDedupeEvent[] = [];
  const builtinIds = new Set(BUILTIN_WIDGET_KEYS.map((key) => `builtin:${key}`));
  const isSeeded = (createdAt: Date | number, root: LiveStoreFolder): boolean => {
    const delta = time(createdAt) - time(root.createdAt);
    return delta >= 0 && delta <= SEED_WINDOW_MS;
  };

  for (const root of roots) {
    if (root.id === keep.id) continue;

    for (const child of active.filter((folder) => folder.parentId === root.id)) {
      const seeded = child.reservedKind === "widgetDefinition" && isSeeded(child.createdAt, root);
      if (!seeded) {
        events.push(
          folderEvents.folderUpdated({ id: child.id, parentId: keep.id, updatedAt: now }),
        );
        continue;
      }
      for (const file of files) {
        if (file.parentId !== child.id || file.deletedAt || file.purgedAt) continue;
        events.push(
          SEEDED_FILE_NAMES.has(file.name)
            ? fileEvents.fileDeleted({ id: file.id, deletedAt: now })
            : fileEvents.fileUpdated({ id: file.id, parentId: keep.id, updatedAt: now }),
        );
      }
      events.push(folderEvents.folderDeleted({ id: child.id, deletedAt: now }));
    }
    for (const file of files) {
      if (file.parentId === root.id && !file.deletedAt && !file.purgedAt) {
        events.push(fileEvents.fileUpdated({ id: file.id, parentId: keep.id, updatedAt: now }));
      }
    }
    events.push(folderEvents.folderDeleted({ id: root.id, deletedAt: now }));

    for (const instance of instances) {
      if (
        !instance.deletedAt &&
        builtinIds.has(instance.definitionId) &&
        isSeeded(instance.createdAt, root)
      ) {
        events.push(widgetEvents.widgetInstanceDeleted({ id: instance.id, deletedAt: now }));
      }
    }
  }
  return events;
};

const widgetRootIds$ = queryDb(
  () => folderTable.select("id").where({ reservedKind: "widgets", deletedAt: null }),
  { label: "widgets:root-ids" },
);
const allFolders$ = queryDb(() => folderTable, { label: "widgets:dedupe-folders" });
const allFiles$ = queryDb(() => fileTable, { label: "widgets:dedupe-files" });
const allInstances$ = queryDb(() => widgetInstanceTable, { label: "widgets:dedupe-instances" });
const allDefinitions$ = queryDb(() => widgetDefinitionTable, {
  label: "widgets:dedupe-definitions",
});

type DedupeStore = Pick<ReturnType<typeof useAppStore>, "query" | "commit" | "subscribe">;

// Synced events arrive in batches, so wait until no new Widgets folder has shown up for a while;
// otherwise a folder could be judged before the definitions that point to it have arrived.
const SETTLE_MS = 5000;

/** Watches for duplicate Widgets folders and cleans them up once synced data settles. */
export const watchSeededWidgetDuplicates = (store: DedupeStore): (() => void) => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const unsubscribe = store.subscribe(widgetRootIds$, (ids) => {
    clearTimeout(timer);
    if (ids.length < 2) return;
    timer = setTimeout(() => {
      const events = planSeedDedupe({
        folders: store.query(allFolders$),
        files: store.query(allFiles$),
        instances: store.query(allInstances$),
        definitions: store.query(allDefinitions$),
      });
      if (events.length > 0) store.commit(...events);
    }, SETTLE_MS);
  });
  return () => {
    clearTimeout(timer);
    unsubscribe();
  };
};
