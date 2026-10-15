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
  providerCredentialEventDefs,
  providerCredentialMaterializers,
  providerCredentialTable,
} from "./providerCredential";
import {
  settingEventDefs,
  settingMaterializers,
  settingsTable,
  syncedSettingsTable,
} from "./setting";
import { legacyModelRoutingEvents, legacyModelRoutingMaterializers } from "./legacyModelRouting";
import { localModelUsageEvents, localModelUsageMaterializers } from "./localModelUsage";
import { uiEvents, uiTable } from "./ui";
import {
  widgetEvents,
  widgetMaterializers,
  widgetDefinitionTable,
  widgetInstanceTable,
} from "./widget";

const tables = {
  files: fileTable,
  folders: folderTable,
  collections: collectionTable,
  providers: providerTable,
  providerCredentials: providerCredentialTable,
  settings: settingsTable,
  syncedSettings: syncedSettingsTable,
  uiState: uiTable,
  widgetDefinitions: widgetDefinitionTable,
  widgetInstances: widgetInstanceTable,
};

const events = {
  ...fileEvents,
  ...folderEvents,
  ...collectionEvents,
  ...providerEvents,
  ...legacyProviderEvents,
  ...providerCredentialEventDefs,
  ...settingEventDefs,
  ...legacyModelRoutingEvents,
  ...localModelUsageEvents,
  ...uiEvents,
  ...widgetEvents,
};

const materializers = State.SQLite.materializers(events, {
  ...fileMaterializers,
  ...folderMaterializers,
  ...collectionMaterializers,
  ...providerMaterializers,
  ...providerCredentialMaterializers,
  ...settingMaterializers,
  ...legacyModelRoutingMaterializers,
  ...localModelUsageMaterializers,
  ...widgetMaterializers,
});

const state = State.SQLite.makeState({ tables, materializers });

export const schema = makeSchema({ events, state });
