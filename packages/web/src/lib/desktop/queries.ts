import { queryDb } from "@livestore/livestore";

import { fileTable } from "@/livestore/file";
import { folderTable } from "@/livestore/folder";

export const desktopFilesQuery$ = queryDb(
  () => fileTable.where({ deletedAt: null, purgedAt: null }).orderBy("updatedAt", "desc"),
  {
    label: "desktop:files",
  },
);

export const desktopFoldersQuery$ = queryDb(
  () => folderTable.where({ deletedAt: null, purgedAt: null }).orderBy("updatedAt", "desc"),
  {
    label: "desktop:folders",
  },
);

export const desktopAllFilesQuery$ = queryDb(() => fileTable.orderBy("updatedAt", "desc"), {
  label: "desktop:files-all",
});

export const desktopAllFoldersQuery$ = queryDb(() => folderTable.orderBy("updatedAt", "desc"), {
  label: "desktop:folders-all",
});
