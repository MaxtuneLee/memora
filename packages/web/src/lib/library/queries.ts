import { queryDb } from "@livestore/livestore";

import { fileTable } from "@/livestore/file";

export const activeFilesQuery$ = queryDb(
  () => {
    return fileTable.where({ deletedAt: null }).orderBy("createdAt", "desc");
  },
  {
    label: "library:active-files",
  },
);
