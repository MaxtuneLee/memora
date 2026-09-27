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

describe("search_transcript", () => {
  test("caps context_chars at 200 instead of rejecting larger values", async () => {
    const row = {
      id: "f1",
      name: "Lecture",
      type: "video",
      transcriptPath: "/files/f1/f1.transcript.json",
    };
    const tool = createTranscriptTools({ query: () => [row] }, {}).find(
      (candidate) => candidate.name === "search_transcript",
    );
    if (!tool) throw new Error("search_transcript is missing.");

    const params = v.parse(tool.parameters, { keyword: "needle", context_chars: 250 });
    const result = (await tool.execute(params)) as { matches: Array<{ context: string }> };

    expect(result.matches).toHaveLength(1);
    // The match, 200 characters on each side, and the two ellipses.
    expect(result.matches[0].context.length).toBeLessThanOrEqual(" needle".length + 400 + 6);
    expect(result.matches[0].context.length).toBeGreaterThan(" needle".length + 300);
  });
});
