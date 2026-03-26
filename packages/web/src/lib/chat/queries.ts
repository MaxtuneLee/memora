import { queryDb } from "@livestore/livestore";

import { fileTable } from "@/livestore/file";
import { folderTable } from "@/livestore/folder";
import { providerTable } from "@/livestore/provider";

export const chatProvidersQuery$ = queryDb(
  () => providerTable.where({ deletedAt: null }).orderBy("createdAt", "desc"),
  { label: "chat:providers" },
);

export const chatActiveFilesQuery$ = queryDb(
  () => fileTable.where({ deletedAt: null, purgedAt: null }).orderBy("updatedAt", "desc"),
  { label: "chat:active-files" },
);

export const chatActiveFoldersQuery$ = queryDb(
  () => folderTable.where({ deletedAt: null, purgedAt: null }).orderBy("updatedAt", "desc"),
  { label: "chat:active-folders" },
);
