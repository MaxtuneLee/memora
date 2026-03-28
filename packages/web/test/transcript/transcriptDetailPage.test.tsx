import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vite-plus/test";

import { TranscriptSection } from "@/components/transcript/transcriptDetail/TranscriptSection";
import { RecordingHeader } from "@/components/transcript/transcriptDetail/RecordingHeader";
import { RecordingPreviewSurface } from "@/components/transcript/transcriptDetail/RecordingPreviewSurface";
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

test("renders a warm transcript detail hero with summary copy and detail rail", () => {
  const html = renderToStaticMarkup(
    <RecordingHeader
      recording={createRecording()}
      isRenaming={false}
      renameValue="Weekly research sync"
      metaPills={["Audio recording", "4:05", "Word-timed transcript", "312 words"]}
      isMedia={true}
      showTranscript={true}
      hasTranscript={true}
      isTranscribing={false}
      createdAtLabel="Mar 9, 2024"
      onRenameChange={() => {}}
      onRenameSubmit={() => {}}
      onRenameCancel={() => {}}
      onStartRename={() => {}}
      onToggleTranscript={() => {}}
      onDelete={() => {}}
    />,
  );

  expect(html).toContain('data-surface="transcript-detail-header"');
  expect(html).toContain("Weekly research sync");
  expect(html).toContain("Hide transcript");
  expect(html).toContain("312 words");
});

test("renders an image preview surface instead of falling back to the audio player", () => {
  const html = renderToStaticMarkup(
    <RecordingPreviewSurface
      recording={createRecording({
        audioUrl: "/preview/example.png",
        mimeType: "image/png",
        type: "image",
      })}
      mediaReadyToken={0}
      transcriptWords={[]}
      currentTimeRef={{ current: 0 }}
      seekRef={{ current: null }}
      onMediaReady={() => {}}
    />,
  );

  expect(html).toContain('data-surface="transcript-detail-preview"');
  expect(html).toContain("Source");
  expect(html).toContain('src="/preview/example.png"');
  expect(html).toContain("image");
});

test("renders the transcript workspace with search and export controls in one surface", () => {
  const html = renderToStaticMarkup(
    <TranscriptSection
      showTranscript={true}
      hasSearchableTranscript={true}
      hasTranscript={true}
      isTranscribing={false}
      canExportSrt={true}
      canSearch={true}
      transcriptText="A compact preview excerpt from the transcript."
      transcriptWords={[]}
      transcriptionStatus="idle"
      transcriptionProgress={0}
      currentTimeRef={{ current: 0 }}
      searchQuery="preview"
      activeMatchIndex={0}
      searchMatches={[
        {
          id: "match-1",
          snippet: "A compact preview excerpt from the transcript.",
          startChar: 0,
          endChar: 12,
          startSec: null,
          endSec: null,
        },
      ]}
      manualTranscript=""
      isSavingManual={false}
      onSearchQueryChange={() => {}}
      onJumpToMatch={() => {}}
      onManualTranscriptChange={() => {}}
      onExportTxt={() => {}}
      onExportSrt={() => {}}
      onTranscriptToggle={() => {}}
      onSaveManualTranscript={() => {}}
      onSeek={() => {}}
    />,
  );

  expect(html).toContain('data-surface="transcript-detail-panel"');
  expect(html).toContain("Search transcript...");
  expect(html).toContain("TXT");
  expect(html).toContain("1/1 matches");
});

test("keeps the detail page as a split-view workbench with a dedicated preview surface", () => {
  const pageSource = readFileSync(
    new URL("../../src/components/transcript/TranscriptDetailPage.tsx", import.meta.url),
    "utf8",
  );

  expect(pageSource).toContain("RecordingPreviewSurface");
  expect(pageSource).toContain('data-surface="transcript-detail-workbench"');
  expect(pageSource).toContain("setShowTranscript(true)");
  expect(pageSource).toContain("xl:grid-cols-[minmax(0,1.05fr)_minmax(22rem,0.95fr)]");
});
