import * as v from "valibot";
import { describe, expect, test, vi } from "vite-plus/test";

import { createTranscriptTools } from "@/lib/chat/tools/transcriptTools";

const words = Array.from({ length: 400 }, (_, index) => ({
  text: index === 200 ? " needle" : " word",
  timestamp: [index, index + 1],
}));

vi.mock("@memora/fs", () => ({
  cat: async () => JSON.stringify({ text: "", words }),
}));

const row = {
  id: "f1",
  name: "Lecture",
  type: "video",
  transcriptPath: "/files/f1/f1.transcript.json",
};

const getTool = (name: string) => {
  const tool = createTranscriptTools({ query: () => [row] }, {}).find(
    (candidate) => candidate.name === name,
  );
  if (!tool) throw new Error(`${name} is missing.`);
  return tool;
};

describe("search_transcript", () => {
  test("caps context_chars at 200 instead of rejecting larger values", async () => {
    const tool = getTool("search_transcript");

    const params = v.parse(tool.parameters, { keyword: "needle", context_chars: 250 });
    const result = (await tool.execute(params)) as { matches: Array<{ context: string }> };

    expect(result.matches).toHaveLength(1);
    // The match, 200 characters on each side, and the two ellipses.
    expect(result.matches[0].context.length).toBeLessThanOrEqual(" needle".length + 400 + 6);
    expect(result.matches[0].context.length).toBeGreaterThan(" needle".length + 300);
  });
});

describe("read_transcript", () => {
  test("returns timed lines for the requested range", async () => {
    const tool = getTool("read_transcript");
    const params = v.parse(tool.parameters, { file_id: "f1", start_sec: 100, end_sec: 130 });
    const result = (await tool.execute(params)) as { lines: string[]; nextStartSec?: number };

    // Words without punctuation break every 20 s.
    expect(result.lines[0]).toMatch(/^\[100-120\] word word/);
    expect(result.lines.at(-1)).toMatch(/^\[120-130\] /);
    expect(result.nextStartSec).toBe(130);
  });

  test("returns at most 300 s per call", async () => {
    const tool = getTool("read_transcript");
    const params = v.parse(tool.parameters, { file_id: "f1", start_sec: 0, end_sec: 1000 });
    const result = (await tool.execute(params)) as { endSec: number };

    expect(result.endSec).toBe(300);
  });

  test("reports an unknown file", async () => {
    const tool = getTool("read_transcript");
    const result = (await tool.execute(v.parse(tool.parameters, { file_id: "nope" }))) as {
      error?: string;
    };

    expect(result.error).toContain("nope");
  });
});
