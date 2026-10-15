import { computed, queryDb } from "@livestore/livestore";

import { providerTable } from "@/livestore/provider";
import { deviceSettingsQuery$, mergeSettings, syncedSettingsQuery$ } from "@/livestore/setting";

export const settingsProvidersQuery$ = queryDb(
  () => providerTable.where({ deletedAt: null }).orderBy("createdAt", "desc"),
  { label: "settings:providers" },
);

export const settingsDocumentQuery$ = computed(
  (get) => mergeSettings(get(deviceSettingsQuery$), get(syncedSettingsQuery$)),
  { label: "settings:document" },
);
