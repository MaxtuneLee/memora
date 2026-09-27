import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const saveRecording = vi.hoisted(() => vi.fn());
vi.mock("@/lib/library/fileService", () => ({ saveRecording }));

import {
  importEvaluationLectures,
  parseEvaluationImport,
  type EvaluationImportFile,
} from "@/lib/playground/evaluationImport";

const file = (name: string, data: unknown): EvaluationImportFile => ({
  name,
  bytes: new TextEncoder().encode(JSON.stringify(data)),
});
const sha = (item: EvaluationImportFile) => createHash("sha256").update(item.bytes).digest("hex");

const manifest = file("manifest.json", {
  course: "MIT 6.7960",
  transcriptVersion: "2",
  converterVersion: "2",
  lectures: [
    { lectureId: "lec11", durationMs: 20000 },
    { lectureId: "lec12", durationMs: 30000 },
  ],
});
const transcript = (lectureId: string) =>
  file(`${lectureId}.transcript.json`, {
    text: `So why are we all here? Next part ${lectureId}.`,
    words: [
      { text: " So why are we", timestamp: [1, 2] },
      { text: " all here?", timestamp: [2, 3] },
      { text: ` Next part ${lectureId}.`, timestamp: [3, 4] },
    ],
  });
const cues = (lectureId: string) =>
  file(`${lectureId}.cues.json`, [
    { cueId: `${lectureId}-0001`, startMs: 1000, endMs: 2000, speaker: "A", text: "So why" },
  ]);
const question = {
  questionId: "q01",
  question: "Why are we here?",
  lectureIds: ["lec11"],
  evidence: [
    [
      {
        lectureId: "lec11",
        startCueId: "lec11-0001",
        endCueId: "lec11-0002",
        startMs: 1000,
        endMs: 3000,
      },
    ],
  ],
  requiredPoints: ["We are here"],
  kind: "localized",
};
const questions = file("questions-draft-v1.json", { revision: "v1", questions: [question] });
const dataFiles = [
  manifest,
  transcript("lec11"),
  cues("lec11"),
  transcript("lec12"),
  cues("lec12"),
];

describe("parseEvaluationImport", () => {
  it("derives file IDs, the lecture mapping, and revisions from file content", async () => {
    const result = await parseEvaluationImport(dataFiles, questions);

    const lec11Sha = sha(transcript("lec11"));
    const lec11Id = `eval-${lec11Sha.slice(0, 12)}-lec11`;
    const lec12Id = `eval-${sha(transcript("lec12")).slice(0, 12)}-lec12`;
    expect(result.fileLectures).toEqual({ [lec11Id]: "lec11", [lec12Id]: "lec12" });
    expect(result.revisions).toEqual({
      manifest: sha(manifest),
      questions: sha(questions),
      transcriptVersion: "2",
      converterVersion: "2",
      transcripts: { lec11: lec11Sha, lec12: sha(transcript("lec12")) },
      cues: { lec11: sha(cues("lec11")), lec12: sha(cues("lec12")) },
    });
    expect(result.questions).toEqual([question]);
    expect(result.cues.lec11).toEqual([
      { cueId: "lec11-0001", startMs: 1000, endMs: 2000, speaker: "A", text: "So why" },
    ]);
    expect(result.lectures[0]).toMatchObject({ fileId: lec11Id, durationSec: 20 });
    // Entries keep their leading space, so search_transcript's joined text reads across cues.
    const joined = result.lectures[0].transcript.words.map((word) => word.text).join("");
    expect(joined).toContain("we all here? Next");
  });

  it("rejects an invalid questions file with a readable error", async () => {
    const bad = file("questions.json", { questions: [{ ...question, requiredPoints: [] }] });

    await expect(parseEvaluationImport(dataFiles, bad)).rejects.toThrow(
      /questions\.json: Invalid questions file\. questions\.0\.requiredPoints/,
    );
  });

  it("rejects questions that cite lectures missing from the manifest", async () => {
    const other = {
      ...question,
      lectureIds: ["lec99"],
      evidence: [[{ ...question.evidence[0][0], lectureId: "lec99" }]],
    };

    await expect(
      parseEvaluationImport(dataFiles, file("q.json", { questions: [other] })),
    ).rejects.toThrow(/q01 cites lectures not in the manifest: lec99/);
  });

  it("asks for missing lecture files", async () => {
    await expect(
      parseEvaluationImport(
        dataFiles.filter((item) => item.name !== "lec12.cues.json"),
        questions,
      ),
    ).rejects.toThrow("Select lec12.transcript.json and lec12.cues.json.");
  });
});

describe("importEvaluationLectures", () => {
  beforeEach(() => {
    saveRecording.mockReset();
    saveRecording.mockImplementation(async (input: { id: string; name: string; blob: Blob }) => ({
      id: input.id,
      meta: {
        id: input.id,
        name: input.name,
        type: "video",
        mimeType: "video/mp4",
        sizeBytes: input.blob.size,
        storageType: "opfs",
        storagePath: `/files/${input.id}/${input.id}.mp4`,
        transcriptPath: `/files/${input.id}/transcript.json`,
        createdAt: 1,
      },
    }));
  });

  const fakeStore = () => {
    const rows = new Map<string, { deletedAt: Date | null; purgedAt: Date | null }>();
    const events: Array<{ name: string; args: { id: string } }> = [];
    return {
      rows,
      events,
      query: (query: unknown) => {
        const [id] = (query as { asSql: () => { bindValues: string[] } }).asSql().bindValues;
        const row = rows.get(id);
        return row ? [row] : [];
      },
      commit: (...committed: unknown[]) => {
        for (const event of committed as Array<{ name: string; args: { id: string } }>) {
          events.push(event);
          if (event.name === "v1.FileCreated")
            rows.set(event.args.id, { deletedAt: null, purgedAt: null });
        }
      },
    };
  };

  it("creates transcript-only video files once, even when imported again", async () => {
    const { lectures } = await parseEvaluationImport(dataFiles, questions);
    const store = fakeStore();

    const first = await importEvaluationLectures(lectures, store);
    const second = await importEvaluationLectures(lectures, store);

    expect(first.created).toEqual(lectures.map((lecture) => lecture.fileId));
    expect(second).toEqual({ created: [], existing: first.created });
    expect(saveRecording).toHaveBeenCalledTimes(2);
    const [input] = saveRecording.mock.calls[0];
    expect(input).toMatchObject({
      id: lectures[0].fileId,
      type: "video",
      transcriptWords: lectures[0].transcript.words,
    });
    expect(input.blob.size).toBe(0);
    expect(store.events.map((event) => event.name)).toEqual([
      "v1.FileCreated",
      "v1.FileTranscribed",
      "v1.FileCreated",
      "v1.FileTranscribed",
    ]);
  });

  it("restores a lecture file that is in the trash instead of duplicating it", async () => {
    const { lectures } = await parseEvaluationImport(dataFiles, questions);
    const store = fakeStore();
    for (const lecture of lectures)
      store.rows.set(lecture.fileId, { deletedAt: new Date(), purgedAt: null });

    const result = await importEvaluationLectures(lectures, store);

    expect(result.created).toEqual([]);
    expect(saveRecording).not.toHaveBeenCalled();
    expect(store.events.map((event) => event.name)).toEqual(["v1.FileRestored", "v1.FileRestored"]);
  });
});
