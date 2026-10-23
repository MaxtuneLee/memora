import type { TranscriptWord } from "@/types/library";

export const DEMO_LECTURE_NAME = "Bayes' theorem lecture";
export const DEMO_LECTURE_AUDIO_URL = "/demo/bayes-lecture.mp3";
export const DEMO_LECTURE_MIME = "audio/mpeg";

interface LectureLine {
  start: number;
  end: number;
  text: string;
}

// Times are seconds into public/demo/bayes-lecture.mp3.
const LECTURE_LINES: readonly LectureLine[] = [
  { start: 0.5, end: 2.81, text: "Today we're looking at Bayes' theorem." },
  {
    start: 4.21,
    end: 8.14,
    text: "It tells you how to update a belief when new evidence comes in.",
  },
  {
    start: 9.54,
    end: 14.08,
    text: "Start with the prior: how likely something is before you see any evidence.",
  },
  {
    start: 15.48,
    end: 20.9,
    text: "Then weigh it by the likelihood: how likely that evidence is if the belief is true.",
  },
  {
    start: 22.3,
    end: 26.95,
    text: "Divide by how likely the evidence is overall, and you get the posterior.",
  },
  {
    start: 28.36,
    end: 35.77,
    text: "Here's the classic trap. A disease affects one in a hundred people, and a test catches ninety percent of cases.",
  },
  { start: 37.17, end: 40.35, text: "But it also flags nine percent of healthy people." },
  {
    start: 41.75,
    end: 47.26,
    text: "So if you test positive, the chance you're actually sick is only about nine percent.",
  },
  { start: 48.66, end: 51.92, text: "The prior matters far more than most people expect." },
];

export interface DemoLectureSegment {
  /** When the segment is "heard", in seconds into the audio. */
  readyAt: number;
  text: string;
  words: TranscriptWord[];
}

// Spreads each line's words over its span by length, then groups them into short segments
// the way live transcription returns a phrase after each pause.
const buildSegments = (): DemoLectureSegment[] =>
  LECTURE_LINES.flatMap((line) => {
    const parts = line.text.split(/\s+/).filter(Boolean);
    const total = parts.reduce((sum, word) => sum + word.length + 1, 0);
    let cursor = line.start;
    const words: TranscriptWord[] = parts.map((word) => {
      const span = ((word.length + 1) / total) * (line.end - line.start);
      const entry: TranscriptWord = { text: ` ${word}`, timestamp: [cursor, cursor + span] };
      cursor += span;
      return entry;
    });
    const groups: TranscriptWord[][] = [];
    let current: TranscriptWord[] = [];
    for (const word of words) {
      current.push(word);
      if (current.length >= 6 || /[,.:?]$/.test(word.text)) {
        groups.push(current);
        current = [];
      }
    }
    if (current.length > 0) groups.push(current);
    return groups.map((group) => ({
      readyAt: (group.at(-1)?.timestamp[1] ?? line.end) + 0.35,
      text: group
        .map((word) => word.text)
        .join("")
        .trim(),
      words: group,
    }));
  });

export const DEMO_LECTURE_SEGMENTS: readonly DemoLectureSegment[] = buildSegments();
