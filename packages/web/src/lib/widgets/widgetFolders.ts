import { queryDb } from "@livestore/livestore";

import { folderEvents, folderTable, type folder as LiveStoreFolder } from "@/livestore/folder";

export const WIDGETS_ROOT_FOLDER_NAME = "Widgets";

export const widgetFoldersQuery$ = queryDb(() => folderTable.orderBy("updatedAt", "desc"), {
  label: "widgets:folders",
});

export interface WidgetFolderStoreLike {
  commit: (...events: unknown[]) => void;
}

export const findWidgetsRootFolder = (
  folders: readonly LiveStoreFolder[],
): LiveStoreFolder | null => folders.find((folder) => folder.reservedKind === "widgets") ?? null;

export const findWidgetDefinitionFolder = (
  folders: readonly LiveStoreFolder[],
  folderId: string,
): LiveStoreFolder | null =>
  folders.find((folder) => folder.id === folderId && folder.reservedKind === "widgetDefinition") ??
  null;

const uniqueFolderName = (
  folders: readonly LiveStoreFolder[],
  parentId: string,
  desiredName: string,
): string => {
  const siblingNames = new Set(
    folders
      .filter((folder) => folder.parentId === parentId && !folder.deletedAt && !folder.purgedAt)
      .map((folder) => folder.name),
  );

  if (!siblingNames.has(desiredName)) {
    return desiredName;
  }

  let suffix = 2;
  while (siblingNames.has(`${desiredName} ${suffix}`)) {
    suffix += 1;
  }

  return `${desiredName} ${suffix}`;
};

// Builds the same row shape the materializer would produce for a just-committed folderCreated
// event, so callers can extend their local folder list without a round trip through the store.
const buildFolderRow = (input: {
  id: string;
  name: string;
  parentId: string | null;
  reservedKind: LiveStoreFolder["reservedKind"];
  createdAt: Date;
}): LiveStoreFolder =>
  ({
    id: input.id,
    name: input.name,
    parentId: input.parentId,
    reservedKind: input.reservedKind,
    positionX: null,
    positionY: null,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    deletedAt: null,
    purgedAt: null,
  }) as LiveStoreFolder;

// Idempotent: returns the existing Widgets root folder, or creates it (once) when none of the
// folders passed in carry the "widgets" reservedKind yet.
export const ensureWidgetsRootFolder = ({
  store,
  folders,
}: {
  store: WidgetFolderStoreLike;
  folders: readonly LiveStoreFolder[];
}): { folder: LiveStoreFolder; created: boolean } => {
  const existing = findWidgetsRootFolder(folders);
  if (existing) {
    return { folder: existing, created: false };
  }

  const createdAt = new Date();
  const folder = buildFolderRow({
    id: crypto.randomUUID(),
    name: WIDGETS_ROOT_FOLDER_NAME,
    parentId: null,
    reservedKind: "widgets",
    createdAt,
  });

  store.commit(
    folderEvents.folderCreated({
      id: folder.id,
      name: folder.name,
      parentId: null,
      reservedKind: "widgets",
      createdAt,
    }),
  );

  return { folder, created: true };
};

// Names are unique within Widgets: a collision gets a numeric suffix.
export const createWidgetDefinitionFolder = ({
  store,
  folders,
  rootId,
  name,
}: {
  store: WidgetFolderStoreLike;
  folders: readonly LiveStoreFolder[];
  rootId: string;
  name: string;
}): { folder: LiveStoreFolder } => {
  const uniqueName = uniqueFolderName(folders, rootId, name);
  const createdAt = new Date();
  const folder = buildFolderRow({
    id: crypto.randomUUID(),
    name: uniqueName,
    parentId: rootId,
    reservedKind: "widgetDefinition",
    createdAt,
  });

  store.commit(
    folderEvents.folderCreated({
      id: folder.id,
      name: uniqueName,
      parentId: rootId,
      reservedKind: "widgetDefinition",
      createdAt,
    }),
  );

  return { folder };
};
