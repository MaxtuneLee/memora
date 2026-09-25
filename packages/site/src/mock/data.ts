import {
  ChatCircleDotsIcon,
  FileTextIcon,
  MicrophoneIcon,
  VideoCameraIcon,
} from "@phosphor-icons/react";

import type { ChatMessageData } from "@web/components/chat/chatMessage/types";
import type { RecentItem } from "@web/components/dashboard/recentItems";
import type { DesktopFileItem, DesktopFolderItem } from "@web/types/desktop";
import type { FileMeta, FileType, RecordingWord } from "@web/types/library";

// Everything here is sample content for the marketing site. Nothing is read from or written to
// a real library.

const NOW = Date.UTC(2026, 8, 23, 9, 30);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function fileMeta(
  id: string,
  name: string,
  type: FileType,
  mimeType: string,
  sizeBytes: number,
  extra: Partial<FileMeta> = {},
): FileMeta {
  return {
    id,
    name,
    type,
    mimeType,
    sizeBytes,
    storageType: "opfs",
    storagePath: `/files/${id}`,
    metaPath: `/files/${id}.json`,
    createdAt: NOW - 3 * DAY,
    updatedAt: NOW - 2 * HOUR,
    ...extra,
  };
}

const indexed = { status: "indexed" as const, indexedAt: NOW - HOUR, summary: null };

export const DESKTOP_FOLDERS: DesktopFolderItem[] = [
  ["lectures", "Lectures"],
  ["papers", "Papers"],
  ["photos", "Photos"],
  ["notes", "Notes"],
].map(([id, name], i) => ({
  id,
  name,
  type: "folder",
  position: { x: 16, y: 16 + i * 110 },
  parentId: null,
  hasStoredPosition: true,
  reservedKind: null,
}));

export const FOLDER_FILES: Record<string, DesktopFileItem[]> = {
  lectures: [
    fileMeta("lec3", "Lecture 03.m4a", "audio", "audio/mp4", 41_000_000, { durationSec: 2460 }),
    fileMeta("lec4", "Lecture 04.m4a", "audio", "audio/mp4", 48_000_000, { durationSec: 2880 }),
    fileMeta("lab", "Lab demo.mp4", "video", "video/mp4", 212_000_000, { durationSec: 372 }),
  ].map(toFileItem),
  papers: [
    fileMeta("ch3", "Chapter 3.pdf", "document", "application/pdf", 4_200_000),
    fileMeta("attn", "Attention paper.pdf", "document", "application/pdf", 2_100_000),
    fileMeta(
      "wk6",
      "Week 6.pptx",
      "document",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      9_800_000,
    ),
  ].map(toFileItem),
  photos: [
    fileMeta("wb", "Whiteboard.jpg", "image", "image/jpeg", 3_100_000),
    fileMeta("quiz", "Quiz 2 scan.jpg", "image", "image/jpeg", 2_400_000),
  ].map(toFileItem),
  notes: [
    fileMeta("rn", "Reading notes.md", "document", "text/markdown", 8_200),
    fileMeta("todo", "Todo.md", "document", "text/markdown", 1_100),
    fileMeta("gloss", "Glossary.md", "document", "text/markdown", 5_300),
  ].map(toFileItem),
};

function toFileItem(meta: FileMeta, i: number): DesktopFileItem {
  return {
    id: meta.id,
    name: meta.name,
    type: "file",
    position: { x: 12 + (i % 4) * 110, y: 12 + Math.floor(i / 4) * 110 },
    fileMeta: meta,
    indexState: indexed,
  };
}

export const RECENT_ITEMS: RecentItem[] = [
  {
    id: "r1",
    title: "Lecture 04",
    subtitle: "Recording · 48 min",
    href: "#",
    updatedAt: NOW - 2 * HOUR,
    icon: MicrophoneIcon,
    tone: "recording",
  },
  {
    id: "r2",
    title: "Key points from Lecture 04",
    subtitle: "Chat",
    href: "#",
    updatedAt: NOW - 3 * HOUR,
    icon: ChatCircleDotsIcon,
    tone: "chat",
  },
  {
    id: "r3",
    title: "Chapter 3.pdf",
    subtitle: "Document · 4.2 MB",
    href: "#",
    updatedAt: NOW - 5 * HOUR,
    icon: FileTextIcon,
    tone: "file",
  },
  {
    id: "r4",
    title: "Lab demo.mp4",
    subtitle: "Video · 6 min",
    href: "#",
    updatedAt: NOW - DAY,
    icon: VideoCameraIcon,
    tone: "recording",
  },
];

// A few study days spread across this month and last.
export const ACTIVITY: number[] = [
  0, 1, 1, 2, 4, 5, 5, 5, 7, 8, 11, 12, 12, 15, 19, 20, 22, 26,
].map((d) => Date.now() - d * DAY);

// Cues from the sample recording's SRT (public/sample-recording.wav, exported from Memora).
const TRANSCRIPT_CUES: Array<[number, number, string]> = [
  [1.68, 3.84, "When you call someone who is thousands of miles"],
  [3.84, 4.56, "away,"],
  [4.56, 6.54, "you're using a satellite."],
];

// Word timings inside each cue, split in proportion to word length, with the leading space the
// ASR output carries.
export const TRANSCRIPT_DURATION = 6.54;
export const TRANSCRIPT_WORDS: RecordingWord[] = TRANSCRIPT_CUES.flatMap(
  ([start, end, text], cue) => {
    const words = text.split(" ");
    const total = words.reduce((n, w) => n + w.length, 0);
    let at = start;
    return words.map((word, i) => {
      const span = ((end - start) * word.length) / total;
      const timing: [number, number] = [+at.toFixed(2), +(at + span - 0.02).toFixed(2)];
      at += span;
      return { text: (cue === 0 && i === 0 ? "" : " ") + word, timestamp: timing };
    });
  },
);

export const LIVE_SEGMENTS = [
  "Retrieval quality depends less on the model than on how you chunk the source.",
  "Keep a timestamp with every chunk, so an answer can point back to the moment.",
  "Then test on questions you didn't write the chunks for.",
];

export const AGENT_QUESTION: ChatMessageData = {
  id: "q1",
  role: "user",
  content: "What were the key points in Lecture 04? I have a quiz on Friday.",
};

// Uses the app's jump tag format, so ChatMessage renders its real recording jump cards.
export const AGENT_ANSWER = [
  "Here are the three moments worth revisiting before Friday's quiz:",
  '<memora-jump fileId="lec4" fileName="Lecture 04.m4a" mediaType="audio" startSec="768" endSec="812" context="Keep a timestamp on every chunk. The lecturer says this twice." />',
  '<memora-jump fileId="lec4" fileName="Lecture 04.m4a" mediaType="audio" startSec="1390" endSec="1452" context="Overlap between chunks: when it helps, and what it costs." />',
  '<memora-jump fileId="lec4" fileName="Lecture 04.m4a" mediaType="audio" startSec="2462" endSec="2501" context="“This will be on the quiz”: recall@k, defined in one sentence." />',
  "Chapter 3.pdf covers the same ideas on pages 38 to 44.",
].join("\n\n");
