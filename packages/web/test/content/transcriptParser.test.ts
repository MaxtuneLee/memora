import { describe, expect, test } from "vite-plus/test";

import { transcriptContentParser } from "@/lib/content/parsers/transcript";
import type { RecordingTranscript } from "@/types/library";

const makeTranscript = (wordCount: number): RecordingTranscript => {
  const words = Array.from({ length: wordCount }, (_, i) => ({
    text: `word${i}`,
    timestamp: [i, i + 1] as [number, number],
  }));
  return { text: words.map((w) => w.text).join(" "), words };
};

describe("transcript content parser", () => {
  test("splits a long transcript into multiple timestamp-aligned segments", async () => {
    const transcript = makeTranscript(120);
    const file = new File([JSON.stringify(transcript)], "call.transcript.json", {
      type: "application/json",
    });
    const draft = await transcriptContentParser.parse({
      fileId: "file-1",
      sourceRevision: "rev-1",
      file,
    });

    expect(draft.segments.length).toBeGreaterThan(1);
    const first = draft.segments[0];
    const last = draft.segments[draft.segments.length - 1];
    expect(first.locator).toEqual({ kind: "transcript", startSeconds: 0, endSeconds: 50 });
    expect(last.locator).not.toEqual(first.locator);
    expect(last.locator).toMatchObject({ kind: "transcript", endSeconds: 120 });
  });

  test("keeps a single segment for a short transcript", async () => {
    const transcript = makeTranscript(3);
    const file = new File([JSON.stringify(transcript)], "short.transcript.json", {
      type: "application/json",
    });
    const draft = await transcriptContentParser.parse({
      fileId: "file-1",
      sourceRevision: "rev-1",
      file,
    });

    expect(draft.segments.length).toBe(1);
    expect(draft.segments[0].locator).toEqual({
      kind: "transcript",
      startSeconds: 0,
      endSeconds: 3,
    });
  });
});
