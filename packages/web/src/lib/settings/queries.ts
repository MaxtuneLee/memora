import { queryDb } from "@livestore/livestore";

import { providerTable } from "@/livestore/provider";
import { settingsTable } from "@/livestore/setting";

export const settingsProvidersQuery$ = queryDb(
  () => providerTable.where({ deletedAt: null }).orderBy("createdAt", "desc"),
  { label: "settings:providers" },
);

export const settingsDocumentQuery$ = queryDb(() => settingsTable.get("user-settings"), {
  label: "settings:document",
});
