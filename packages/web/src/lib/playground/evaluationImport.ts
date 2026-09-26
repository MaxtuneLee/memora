import { parseEvaluationQuestions, type EvaluationQuestion } from "@memora/evaluation";
import * as v from "valibot";

import type { StoreQueryable } from "@/lib/chat/tools/shared";
import { saveRecording } from "@/lib/library/fileService";
import { fileEvents, fileTable } from "@/livestore/file";
import type { RecordingTranscript } from "@/types/library";

export interface EvaluationImportFile {
  name: string;
  bytes: Uint8Array;
}

export interface EvaluationRevisions {
  manifest: string;
  questions: string;
  transcriptVersion: string;
  converterVersion: string;
  /** SHA-256 per lecture ID. */
  transcripts: Record<string, string>;
  cues: Record<string, string>;
}

export interface EvaluationLecture {
  fileId: string;
  lectureId: string;
  name: string;
  durationSec: number;
  transcript: RecordingTranscript;
}

export interface EvaluationImport {
  questions: EvaluationQuestion[];
  lectures: EvaluationLecture[];
  /** fileId → lectureId */
  fileLectures: Record<string, string>;
  revisions: EvaluationRevisions;
}

const ManifestSchema = v.object({
  course: v.string(),
  transcriptVersion: v.string(),
  converterVersion: v.string(),
  lectures: v.pipe(
    v.array(
      v.object({
        lectureId: v.pipe(v.string(), v.regex(/^[\w-]+$/)),
        durationMs: v.pipe(v.number(), v.minValue(0)),
      }),
    ),
    v.minLength(1),
  ),
});

const TranscriptSchema = v.object({
  text: v.string(),
  words: v.array(v.object({ text: v.string(), timestamp: v.tuple([v.number(), v.number()]) })),
});

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function evaluationFileId(transcriptSha256: string, lectureId: string): string {
  return `eval-${transcriptSha256.slice(0, 12)}-${lectureId}`;
}

function parseJson<T>(schema: v.GenericSchema<unknown, T>, file: EvaluationImportFile): T {
  let data: unknown;
  try {
    data = JSON.parse(new TextDecoder().decode(file.bytes));
  } catch {
    throw new Error(`${file.name} is not valid JSON.`);
  }
  const result = v.safeParse(schema, data);
  if (!result.success) {
    const issue = result.issues[0];
    const path = v.getDotPath(issue);
    throw new Error(`${file.name} is invalid. ${path ? `${path}: ` : ""}${issue.message}`);
  }
  return result.output;
}

/**
 * Reads the files written by packages/evaluation/scripts/ocw-vtt-to-transcript.mjs
 * (`manifest.json`, `<lectureId>.transcript.json`, `<lectureId>.cues.json`) and a questions file.
 */
export async function parseEvaluationImport(
  dataFiles: readonly EvaluationImportFile[],
  questionsFile: EvaluationImportFile,
): Promise<EvaluationImport> {
  const byName = new Map(dataFiles.map((file) => [file.name, file]));
  const manifestFile = byName.get("manifest.json");
  if (!manifestFile) throw new Error("Select the manifest.json file.");

  const manifest = parseJson(ManifestSchema, manifestFile);
  let questions: EvaluationQuestion[];
  try {
    questions = parseEvaluationQuestions(JSON.parse(new TextDecoder().decode(questionsFile.bytes)));
  } catch (error) {
    throw new Error(
      `${questionsFile.name}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const lectureIds = new Set(manifest.lectures.map((lecture) => lecture.lectureId));
  for (const question of questions) {
    const unknown = question.lectureIds.filter((id) => !lectureIds.has(id));
    if (unknown.length > 0) {
      throw new Error(
        `${questionsFile.name}: ${question.questionId} cites lectures not in the manifest: ${unknown.join(", ")}.`,
      );
    }
  }

  const lectures: EvaluationLecture[] = [];
  const revisions: EvaluationRevisions = {
    manifest: await sha256Hex(manifestFile.bytes),
    questions: await sha256Hex(questionsFile.bytes),
    transcriptVersion: manifest.transcriptVersion,
    converterVersion: manifest.converterVersion,
    transcripts: {},
    cues: {},
  };
  for (const { lectureId, durationMs } of manifest.lectures) {
    const transcriptFile = byName.get(`${lectureId}.transcript.json`);
    const cuesFile = byName.get(`${lectureId}.cues.json`);
    if (!transcriptFile || !cuesFile) {
      throw new Error(`Select ${lectureId}.transcript.json and ${lectureId}.cues.json.`);
    }
    const transcript = parseJson(TranscriptSchema, transcriptFile);
    const transcriptSha = await sha256Hex(transcriptFile.bytes);
    revisions.transcripts[lectureId] = transcriptSha;
    revisions.cues[lectureId] = await sha256Hex(cuesFile.bytes);
    lectures.push({
      fileId: evaluationFileId(transcriptSha, lectureId),
      lectureId,
      name: `${manifest.course}, ${lectureId}`,
      durationSec: durationMs / 1000,
      transcript,
    });
  }

  return {
    questions,
    lectures,
    fileLectures: Object.fromEntries(
      lectures.map((lecture) => [lecture.fileId, lecture.lectureId]),
    ),
    revisions,
  };
}

interface EvaluationImportStore extends StoreQueryable {
  commit: (...events: unknown[]) => void;
}

type FileRowState = { deletedAt: Date | null; purgedAt: Date | null };

/**
 * Creates one transcript-only `video` file (0-byte media) per lecture. A lecture whose file ID
 * already exists is left as is, and restored if it is in the trash.
 */
export async function importEvaluationLectures(
  lectures: readonly EvaluationLecture[],
  store: EvaluationImportStore,
): Promise<{ created: string[]; existing: string[] }> {
  const created: string[] = [];
  const existing: string[] = [];
  for (const lecture of lectures) {
    const [row] = store.query(fileTable.where({ id: lecture.fileId })) as readonly FileRowState[];
    if (row) {
      if (row.purgedAt) {
        throw new Error(
          `${lecture.fileId} was permanently deleted and cannot be imported again with the same ID.`,
        );
      }
      if (row.deletedAt) {
        store.commit(fileEvents.fileRestored({ id: lecture.fileId, updatedAt: new Date() }));
      }
      existing.push(lecture.fileId);
      continue;
    }

    const { meta } = await saveRecording({
      id: lecture.fileId,
      blob: new Blob([], { type: "video/mp4" }),
      name: lecture.name,
      type: "video",
      mimeType: "video/mp4",
      durationSec: lecture.durationSec,
      transcriptText: lecture.transcript.text,
      transcriptWords: lecture.transcript.words,
    });
    const createdAt = new Date(meta.createdAt);
    store.commit(
      fileEvents.fileCreated({
        id: meta.id,
        name: meta.name,
        type: meta.type,
        mimeType: meta.mimeType,
        sizeBytes: meta.sizeBytes,
        storageType: meta.storageType,
        storagePath: meta.storagePath,
        parentId: null,
        durationSec: lecture.durationSec,
        createdAt,
      }),
      fileEvents.fileTranscribed({
        id: meta.id,
        transcriptPath: meta.transcriptPath ?? "",
        updatedAt: createdAt,
      }),
    );
    created.push(lecture.fileId);
  }
  return { created, existing };
}
