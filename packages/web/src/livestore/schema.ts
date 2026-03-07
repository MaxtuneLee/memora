import { makeSchema, State } from "@livestore/livestore";

import { collectionEvents, collectionMaterializers, collectionTable } from "./collection";
import { fileEvents, fileMaterializers, fileTable } from "./file";
import { folderEvents, folderMaterializers, folderTable } from "./folder";
import { settingEvents, settingsTable } from "./setting";
import { uiEvents, uiTable } from "./ui";

const tables = {
  files: fileTable,
  folders: folderTable,
  collections: collectionTable,
  settings: settingsTable,
  uiState: uiTable,
};

const events = {
  ...fileEvents,
  ...folderEvents,
  ...collectionEvents,
  ...settingEvents,
  ...uiEvents,
};

const materializers = State.SQLite.materializers(events, {
  ...fileMaterializers,
  ...folderMaterializers,
  ...collectionMaterializers,
});

const state = State.SQLite.makeState({ tables, materializers });

export const schema = makeSchema({ events, state });
