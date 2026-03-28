import { expect, test } from "vite-plus/test";

import {
  getTranscriptHistoryRowState,
  getTranscriptWorkbenchRailItems,
} from "@/components/transcript/transcriptLanding/transcriptLandingState";
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
  transcriptPath: null,
  transcriptPreview: null,
  ...overrides,
});

test("builds quiet utility rail items from language and loaded recordings", () => {
  expect(
    getTranscriptWorkbenchRailItems({
      language: "zh",
      recordings: [createRecording(), createRecording({ id: "recording-2" })],
    }),
  ).toEqual([
    { id: "language", label: "Language", value: "Chinese" },
    { id: "recordings", label: "Loaded", value: "2 recordings" },
  ]);
});

test("prefers transcript text for row preview and marks diagnostics when available", () => {
  expect(
    getTranscriptHistoryRowState(
      createRecording({
        transcriptPreview: "Older preview copy",
        transcript: {
          text: "A much more useful transcript excerpt.",
          words: [],
          diagnostics: {
            source: "heuristic-v1",
            audioDurationSec: 245,
            audioRms: 0.4,
            audioPeak: 0.8,
            activeFrameRatio: 0.6,
            textLength: 34,
            wordCount: 6,
            wordsPerSecond: 1.2,
            uniqueWordRatio: 0.92,
            repetitionRatio: 0.1,
            trailingRepeatPhraseWords: 0,
            trailingRepeatPhraseCycles: 0,
            blankAudioMarkerCount: 0,
            hallucinationScore: 0.08,
            qualityScore: 0.72,
            dropped: false,
            dropReason: null,
            issues: [],
          },
        },
      }),
    ),
  ).toMatchObject({
    title: "Weekly research sync",
    preview: "A much more useful transcript excerpt.",
    status: "Diagnostics available",
    typeLabel: "Audio",
    timestamp: 1_710_000_300_000,
    timestampSource: "updatedAt",
    durationSec: 245,
    showDuration: true,
  });
});

test("uses transcript preview when the loaded transcript text is absent", () => {
  expect(
    getTranscriptHistoryRowState(
      createRecording({
        transcriptPreview: "Saved transcript preview from metadata.",
        transcript: null,
      }),
    ),
  ).toMatchObject({
    preview: "Saved transcript preview from metadata.",
    status: "Transcript ready",
  });
});

test("falls back to no transcript copy and created time when no transcript exists", () => {
  expect(
    getTranscriptHistoryRowState(
      createRecording({
        updatedAt: Number.NaN,
        durationSec: null,
      }),
    ),
  ).toMatchObject({
    preview: "No transcript yet.",
    status: "No transcript yet",
    timestamp: 1_710_000_000_000,
    timestampSource: "createdAt",
    showDuration: false,
  });
});
