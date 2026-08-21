import { expect, test } from "vite-plus/test";

import {
  filterSlashCommandDefinitions,
  SLASH_COMMAND_DEFINITIONS,
} from "@/components/editor/SlashCommandPlugin";

test("offers every supported block syntax through the slash menu", () => {
  expect(SLASH_COMMAND_DEFINITIONS.map((definition) => definition.kind)).toEqual([
    "paragraph",
    "heading",
    "heading",
    "heading",
    "heading",
    "heading",
    "heading",
    "quote",
    "bullet-list",
    "numbered-list",
    "check-list",
    "code",
    "math",
    "table",
    "divider",
  ]);
});

test("filters slash commands by English and Chinese keywords", () => {
  expect(filterSlashCommandDefinitions("math").map((definition) => definition.label)).toEqual([
    "Math formula",
  ]);
  expect(filterSlashCommandDefinitions("表格").map((definition) => definition.label)).toEqual([
    "Table",
  ]);
  expect(filterSlashCommandDefinitions("标题 2").map((definition) => definition.label)).toEqual([
    "Heading 2",
  ]);
});
