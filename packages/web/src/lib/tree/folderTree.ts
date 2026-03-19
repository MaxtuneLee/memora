interface TreeFolderLike {
  id: string;
  parentId?: string | null;
  name: string;
}

interface TreeFileLike {
  id: string;
  parentId?: string | null;
}

const toParentKey = (parentId: string | null | undefined): string | null => {
  return parentId ?? null;
};

export const buildChildrenByParent = <T extends { parentId?: string | null }>(
  items: readonly T[],
): Map<string | null, T[]> => {
  const childrenByParent = new Map<string | null, T[]>();

  for (const item of items) {
    const parentKey = toParentKey(item.parentId);
    const siblings = childrenByParent.get(parentKey) ?? [];
    siblings.push(item);
    childrenByParent.set(parentKey, siblings);
  }

  return childrenByParent;
};

export const buildFolderMap = <TFolder extends TreeFolderLike>(
  folders: readonly TFolder[],
): Map<string, TFolder> => {
  return new Map(folders.map((folder) => [folder.id, folder]));
};

export const collectDescendantFolderIds = <TFolder extends TreeFolderLike>(
  rootFolderId: string,
  folders: readonly TFolder[],
): string[] => {
  const foldersByParent = buildChildrenByParent(folders);
  const queue = [rootFolderId];
  const descendantFolderIds: string[] = [];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const currentFolderId = queue.shift();
    if (!currentFolderId || visited.has(currentFolderId)) {
      continue;
    }

    visited.add(currentFolderId);
    descendantFolderIds.push(currentFolderId);

    const childFolders = foldersByParent.get(currentFolderId) ?? [];
    for (const childFolder of childFolders) {
      if (!visited.has(childFolder.id)) {
        queue.push(childFolder.id);
      }
    }
  }

  return descendantFolderIds;
};

export const collectFolderDescendants = <
  TFolder extends TreeFolderLike,
  TFile extends TreeFileLike,
>(
  rootFolderId: string,
  folders: readonly TFolder[],
  files: readonly TFile[],
): { folders: TFolder[]; files: TFile[] } => {
  const foldersById = buildFolderMap(folders);
  const foldersByParent = buildChildrenByParent(folders);
  const filesByParent = buildChildrenByParent(files);
  const queue = [rootFolderId];
  const descendants = {
    folders: [] as TFolder[],
    files: [] as TFile[],
  };
  const visited = new Set<string>();

  while (queue.length > 0) {
    const currentFolderId = queue.shift();
    if (!currentFolderId || visited.has(currentFolderId)) {
      continue;
    }

    visited.add(currentFolderId);
    const folder = foldersById.get(currentFolderId);
    if (folder) {
      descendants.folders.push(folder);
    }

    const childFiles = filesByParent.get(currentFolderId) ?? [];
    descendants.files.push(...childFiles);

    const childFolders = foldersByParent.get(currentFolderId) ?? [];
    for (const childFolder of childFolders) {
      if (!visited.has(childFolder.id)) {
        queue.push(childFolder.id);
      }
    }
  }

  return descendants;
};

export const collectFolderFileIds = <
  TFolder extends TreeFolderLike,
  TFile extends TreeFileLike,
>(
  folderIds: readonly string[],
  folders: readonly TFolder[],
  files: readonly TFile[],
): string[] => {
  const descendantFolderIds = new Set<string>();

  for (const folderId of folderIds) {
    const nestedFolderIds = collectDescendantFolderIds(folderId, folders);
    nestedFolderIds.forEach((id) => descendantFolderIds.add(id));
  }

  return files
    .filter((file) => {
      const parentId = toParentKey(file.parentId);
      return parentId !== null && descendantFolderIds.has(parentId);
    })
    .map((file) => file.id);
};

export const buildFolderBreadcrumbs = <TFolder extends TreeFolderLike>(
  folders: readonly TFolder[],
  folderId: string | null,
  rootLabel: string,
): Array<{ id: string | null; name: string }> => {
  const breadcrumbs: Array<{ id: string | null; name: string }> = [
    { id: null, name: rootLabel },
  ];
  if (!folderId) {
    return breadcrumbs;
  }

  const foldersById = buildFolderMap(folders);
  const visited = new Set<string>();
  const chain: Array<{ id: string; name: string }> = [];
  let currentFolderId: string | null = folderId;

  while (currentFolderId) {
    if (visited.has(currentFolderId)) {
      break;
    }

    visited.add(currentFolderId);
    const folder = foldersById.get(currentFolderId);
    if (!folder) {
      break;
    }

    chain.unshift({
      id: folder.id,
      name: folder.name || "Untitled",
    });
    currentFolderId = folder.parentId ?? null;
  }

  return [...breadcrumbs, ...chain];
};
