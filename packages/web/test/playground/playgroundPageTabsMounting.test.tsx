import { readFileSync } from "node:fs";

import { expect, test } from "vite-plus/test";

test("PlaygroundPage keeps the local-models panel mounted so tab switches cannot abort a running evaluation", () => {
  const source = readFileSync(
    new URL("../../src/components/playground/PlaygroundPage.tsx", import.meta.url),
    "utf8",
  );
  const localModelsPanel = source.slice(
    source.indexOf('value="local-models"'),
    source.indexOf("<AsrEvaluation"),
  );
  expect(localModelsPanel).toContain("keepMounted");
});
