import { Schema } from "@livestore/livestore";
import { expect, test } from "vite-plus/test";

import {
  normalizeSettingsValue,
  settingsStoredValueSchema,
  settingsTable,
} from "@/livestore/setting";

test("settings schema default exposes empty personalization fields", () => {
  expect(settingsTable.default.value).toMatchObject({
    primaryUseCase: "",
    assistantStyle: "",
    customInstructions: "",
  });
});

test("legacy stored settings missing personalization fields decode and normalize safely", () => {
  const decodeStoredSettings = Schema.decodeUnknownSync(settingsStoredValueSchema);
  const legacyStoredSettings = decodeStoredSettings({
    theme: "system",
    language: "en-US",
    onboardingName: "Ada",
    onboardingCompleted: true,
  });

  expect(normalizeSettingsValue(legacyStoredSettings)).toMatchObject({
    onboardingName: "Ada",
    primaryUseCase: "",
    assistantStyle: "",
    customInstructions: "",
  });
});
