import { describe, expect, test } from "vite-plus/test";

import { isPendingFileReadyForIndexing } from "@/lib/content/contentPipelineRoot";

describe("content pipeline scheduling", () => {
  test("waits for a transcript before indexing audio and video", () => {
    expect(
      isPendingFileReadyForIndexing({
        indexStatus: "pending",
        transcriptPath: null,
        type: "audio",
      }),
    ).toBe(false);
    expect(
      isPendingFileReadyForIndexing({
        indexStatus: "pending",
        transcriptPath: null,
        type: "video",
      }),
    ).toBe(false);
  });

  test("schedules indexable pending files", () => {
    expect(
      isPendingFileReadyForIndexing({
        indexStatus: "pending",
        transcriptPath: null,
        type: "document",
      }),
    ).toBe(true);
    expect(
      isPendingFileReadyForIndexing({
        indexStatus: "pending",
        transcriptPath: "/transcript.json",
        type: "audio",
      }),
    ).toBe(true);
    expect(
      isPendingFileReadyForIndexing({
        indexStatus: "processing",
        transcriptPath: null,
        type: "document",
      }),
    ).toBe(false);
  });
});
