import { queryDb } from "@livestore/livestore";

import { providerTable } from "@/livestore/provider";

export const settingsProvidersQuery$ = queryDb(
  () => providerTable.where({ deletedAt: null }).orderBy("createdAt", "desc"),
  { label: "settings:providers" },
);
