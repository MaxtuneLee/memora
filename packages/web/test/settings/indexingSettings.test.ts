import { readFileSync } from "node:fs";

import { expect, test } from "vite-plus/test";

test("indexing settings show real pipeline status and provide a manual start action", () => {
  const source = readFileSync(
    new URL("../../src/components/settings/SettingsIndexingSection.tsx", import.meta.url),
    "utf8",
  );
  const pipelineSource = readFileSync(
    new URL("../../src/lib/content/contentPipelineRoot.tsx", import.meta.url),
    "utf8",
  );

  expect(source).toContain('from "@/components/ui/Button"');
  expect(source).toContain('from "@/components/ui/Switch"');
  expect(source).toContain("<Switch");
  expect(source).toContain('variant="oliveGhost"');
  expect(source).toContain("Indexed files");
  expect(source).toContain("Awaiting index");
  expect(source).toContain("Index database");
  expect(source).toContain("Start indexing");
  expect(source).toContain("Reindex all");
  expect(source).toContain("All files indexed");
  expect(source).toContain("All files are already indexed.");
  expect(source).toContain("ArrowCounterClockwiseIcon");
  expect(source).toContain("Pipeline errors");
  expect(source).not.toContain("You can always start an index manually from a file's details");
  expect(source).not.toContain("The small icon on a Desktop file shows its current state.");
  expect(source).not.toContain("Extract text and run OCR when supported.");
  expect(pipelineSource).toContain("reindexAll");
  expect(pipelineSource).toContain("indexUnindexed");
});
