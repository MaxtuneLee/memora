import { Schema } from "@livestore/livestore";
import { expect, test } from "vite-plus/test";

import {
  normalizeSettingsValue,
  settingsStoredValueSchema,
  settingsTable,
} from "../../src/livestore/setting";
import * as storageExportModule from "../../src/lib/settings/storageExport";

test("normalizes imported editor settings with defaults for missing fields", () => {
  const normalizeImportedSettings = (
    storageExportModule as {
      normalizeImportedSettings?: (value: unknown) => unknown;
    }
  ).normalizeImportedSettings;

  expect(normalizeImportedSettings).toBeTypeOf("function");
  expect(normalizeImportedSettings?.({})).toMatchObject({
    defaultNoteLocationMode: "root",
    attachmentPlacementMode: "current-subfolder",
    attachmentSubfolderName: "images",
    editorFontSizePx: 16,
  });
});

test("settings schema default exposes editor fields", () => {
  expect(settingsTable.default.value).toMatchObject({
    defaultNoteLocationMode: "root",
    attachmentPlacementMode: "current-subfolder",
    attachmentSubfolderName: "images",
    editorFontSizePx: 16,
  });
});

test("legacy stored settings missing editor fields decode and normalize safely", () => {
  const decodeStoredSettings = Schema.decodeUnknownSync(settingsStoredValueSchema);
  const legacyStoredSettings = decodeStoredSettings({
    theme: "system",
    language: "en-US",
    defaultTranscriptionModel: "whisper-small",
    defaultSummarizationModel: "",
    autoTranscribe: true,
    autoIndex: true,
    sidebarCollapsed: false,
    selectedProviderId: "",
    selectedModel: "",
  });

  expect(normalizeSettingsValue(legacyStoredSettings)).toMatchObject({
    defaultNoteLocationMode: "root",
    defaultNoteFolderId: "",
    attachmentPlacementMode: "current-subfolder",
    attachmentFolderId: "",
    attachmentSubfolderName: "images",
    editorFontSizePx: 16,
  });
});
