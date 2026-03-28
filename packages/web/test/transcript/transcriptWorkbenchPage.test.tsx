import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { expect, test } from "vite-plus/test";

import { TranscriptHistoryRow } from "@/components/transcript/transcriptLanding/TranscriptHistoryRow";
import { TranscriptWorkbench } from "@/components/transcript/transcriptLanding/TranscriptWorkbench";
import { getTranscriptHistoryRowState } from "@/components/transcript/transcriptLanding/transcriptLandingState";
import type { RecordingItem } from "@/types/library";

const createRecording = (overrides: Partial<RecordingItem> = {}): RecordingItem => ({
  id: "recording-1",
  name: "Weekly research sync",
  type: "audio",
  mimeType: "audio/webm",
  sizeBytes: 1024,
  storageType: "opfs",
  storagePath: "/files/recording-1/recording-1.webm",
  metaPath: "/files/recording-1/recording-1.meta.json",
  createdAt: 1_710_000_000_000,
  updatedAt: 1_710_000_300_000,
  durationSec: 245,
  transcriptPreview: "A compact preview excerpt from the transcript.",
  transcriptPath: "/files/recording-1/recording-1.transcript.json",
  transcript: {
    text: "A compact preview excerpt from the transcript.",
    words: [],
  },
  ...overrides,
});

test("renders a single dominant transcript workbench surface with a recent heading", () => {
  const recording = createRecording();
  const html = renderToStaticMarkup(
    <MemoryRouter>
      <TranscriptWorkbench
        items={[{ recording, state: getTranscriptHistoryRowState(recording) }]}
        onDelete={() => {}}
        emptyAction={<button type="button">New live transcript</button>}
      />
    </MemoryRouter>,
  );

  expect(html).toContain('data-surface="transcript-workbench"');
  expect(html).toContain("Recent transcripts");
  expect(html).toContain("Continue from saved recordings on this device.");
});

test("renders transcript history rows with detail links and structured content slots", () => {
  const recording = createRecording();
  const html = renderToStaticMarkup(
    <MemoryRouter>
      <TranscriptHistoryRow
        recording={recording}
        state={getTranscriptHistoryRowState(recording)}
        onDelete={() => {}}
      />
    </MemoryRouter>,
  );

  expect(html).toContain('href="/transcript/file/recording-1"');
  expect(html).toContain('data-slot="preview"');
  expect(html).toContain('data-slot="status"');
  expect(html).toContain('data-slot="type"');
  expect(html).toContain('data-slot="duration"');
  expect(html).toContain('data-slot="timestamp"');
  expect(html).toContain("A compact preview excerpt from the transcript.");
});

test("keeps the empty-state action inside the same workbench surface", () => {
  const html = renderToStaticMarkup(
    <MemoryRouter>
      <TranscriptWorkbench
        items={[]}
        onDelete={() => {}}
        emptyAction={<button type="button">New live transcript</button>}
      />
    </MemoryRouter>,
  );

  expect(html).toContain('data-surface="transcript-workbench"');
  expect(html).toContain("No transcripts yet.");
  expect(html).toContain("New live transcript");
});

test("uses subtle motion primitives and quiet hover treatment instead of decorative hover animation", () => {
  const workbenchSource = readFileSync(
    new URL("../../src/components/transcript/transcriptLanding/TranscriptWorkbench.tsx", import.meta.url),
    "utf8",
  );
  const rowSource = readFileSync(
    new URL("../../src/components/transcript/transcriptLanding/TranscriptHistoryRow.tsx", import.meta.url),
    "utf8",
  );

  expect(workbenchSource).toContain('from "motion/react"');
  expect(workbenchSource).toContain("useReducedMotion");
  expect(workbenchSource).toContain("<motion.section");
  expect(rowSource).toContain("transition-colors");
  expect(rowSource).not.toContain("whileHover");
});

test("integrates TranscriptPage around a compact title bar, quiet utility rail, and the new workbench", () => {
  const pageSource = readFileSync(
    new URL("../../src/components/transcript/TranscriptPage.tsx", import.meta.url),
    "utf8",
  );

  expect(pageSource).toContain("TranscriptWorkbench");
  expect(pageSource).toContain("getTranscriptWorkbenchRailItems");
  expect(pageSource).toContain('data-surface="transcript-utility-rail"');
  expect(pageSource).toContain("New live transcript");
  expect(pageSource).not.toContain("RecordingsGrid");
});
