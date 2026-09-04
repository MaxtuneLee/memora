import { makeSchema, State } from "@livestore/livestore";

import { collectionEvents, collectionMaterializers, collectionTable } from "./collection";
import { fileEvents, fileMaterializers, fileTable } from "./file";
import { folderEvents, folderMaterializers, folderTable } from "./folder";
import {
  legacyProviderEvents,
  providerEvents,
  providerMaterializers,
  providerTable,
} from "./provider";
import {
  providerCredentialEvents,
  providerCredentialMaterializers,
  providerCredentialTable,
} from "./providerCredential";
import { settingEvents, settingsTable } from "./setting";
import { legacyModelRoutingEvents, legacyModelRoutingMaterializers } from "./legacyModelRouting";
import { localModelUsageEvents, localModelUsageMaterializers } from "./localModelUsage";
import { uiEvents, uiTable } from "./ui";

const tables = {
  files: fileTable,
  folders: folderTable,
  collections: collectionTable,
  providers: providerTable,
  providerCredentials: providerCredentialTable,
  settings: settingsTable,
  uiState: uiTable,
};

const events = {
  ...fileEvents,
  ...folderEvents,
  ...collectionEvents,
  ...providerEvents,
  ...legacyProviderEvents,
  ...providerCredentialEvents,
  ...settingEvents,
  ...legacyModelRoutingEvents,
  ...localModelUsageEvents,
  ...uiEvents,
};

const materializers = State.SQLite.materializers(events, {
  ...fileMaterializers,
  ...folderMaterializers,
  ...collectionMaterializers,
  ...providerMaterializers,
  ...providerCredentialMaterializers,
  ...legacyModelRoutingMaterializers,
  ...localModelUsageMaterializers,
});

const state = State.SQLite.makeState({ tables, materializers });

export const schema = makeSchema({ events, state });
