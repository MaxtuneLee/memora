#!/usr/bin/env node
// Converts MIT OCW 6.7960 WebVTT captions into Memora's transcript format for the agent
// evaluation corpus. The data itself stays outside this public repo (CC BY-NC-SA 4.0).
//
//   node packages/evaluation/scripts/ocw-vtt-to-transcript.mjs <source dir> <out dir>
//   node packages/evaluation/scripts/ocw-vtt-to-transcript.mjs --check
//
// Each caption cue becomes one transcript entry with its own start and end time. The
// captions have no word timings, and Memora never invents seek positions, so an entry is a
// cue, not a word.

import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import assert from "node:assert/strict";

const CONVERTER_VERSION = "2";
const TRANSCRIPT_VERSION = "2";
// Reviewed caption errors, keyed by lecture and cue start. Adding one bumps TRANSCRIPT_VERSION.
const CORRECTIONS = {
  lec11: [{ startMs: 4740890, from: "mass prediction", to: "masked prediction" }],
};
const COURSE_URL = "https://ocw.mit.edu/courses/6-7960-deep-learning-fall-2024/";
const TIMING = /^(\d{2}):(\d{2}):(\d{2})\.(\d{3})\s+-->\s+(\d{2}):(\d{2}):(\d{2})\.(\d{3})/;
const SPEAKER = /^([A-Z][A-Z .'-]*[A-Z]):\s*/;
const SOUND_TAG = /\[[A-Z][A-Z ,'-]*\]/g;

const toMs = (h, m, s, ms) => ((+h * 60 + +m) * 60 + +s) * 1000 + +ms;

/** Parses VTT text into cleaned cues; speakers carry forward until the next label. */
export const parseVtt = (vtt) => {
  const cues = [];
  let speaker = null;
  for (const block of vtt.replace(/\r/g, "").split(/\n{2,}/)) {
    const lines = block.split("\n");
    const at = lines.findIndex((line) => TIMING.test(line));
    if (at < 0) continue;
    const t = TIMING.exec(lines[at]);
    let text = lines
      .slice(at + 1)
      .join(" ")
      .replace(SOUND_TAG, " ")
      .replace(/\s+/g, " ")
      .trim();
    const label = SPEAKER.exec(text);
    if (label) {
      speaker = label[1];
      text = text.slice(label[0].length).trim();
    }
    if (!text) continue;
    cues.push({
      startMs: toMs(t[1], t[2], t[3], t[4]),
      endMs: toMs(t[5], t[6], t[7], t[8]),
      speaker,
      text,
    });
  }
  return cues;
};

export const toTranscript = (cues) => ({
  text: cues.map((cue) => cue.text).join(" "),
  // Each entry starts with a space, like Whisper output: search_transcript joins entries
  // without a separator.
  words: cues.map((cue) => ({
    text: ` ${cue.text}`,
    timestamp: [cue.startMs / 1000, cue.endMs / 1000],
  })),
});

const check = () => {
  const cues = parseVtt(
    "WEBVTT\n\n00:00:00.000 --> 00:00:00.490 align:middle\n\n\n00:00:00.490 --> 00:00:00.990\n[SQUEAKING]\n\n" +
      "00:00:13.180 --> 00:00:15.600 align:middle line:84%\nSARA BEERY: So why\nare we all here?\n\n" +
      "00:01:02.005 --> 00:01:04.000\n[LAUGHS] Next part.\n\n01:00:00.000 --> 01:00:01.500\nAUDIENCE: A question?\n",
  );
  assert.deepEqual(cues, [
    { startMs: 13180, endMs: 15600, speaker: "SARA BEERY", text: "So why are we all here?" },
    { startMs: 62005, endMs: 64000, speaker: "SARA BEERY", text: "Next part." },
    { startMs: 3600000, endMs: 3601500, speaker: "AUDIENCE", text: "A question?" },
  ]);
  const transcript = toTranscript(cues);
  assert.equal(transcript.text, "So why are we all here? Next part. A question?");
  assert.equal(transcript.words.map((word) => word.text).join(""), ` ${transcript.text}`);
  assert.deepEqual(transcript.words[1], { text: " Next part.", timestamp: [62.005, 64] });
  console.log("ok");
};

const convert = async (sourceDir, outDir) => {
  await mkdir(outDir, { recursive: true });
  const lectures = [];
  for (const file of (await readdir(sourceDir)).filter((name) => name.endsWith(".vtt")).sort()) {
    const match = /lec(\d+)/.exec(file);
    if (!match) continue;
    const lectureId = `lec${match[1]}`;
    const raw = await readFile(join(sourceDir, file));
    const cues = parseVtt(raw.toString("utf8"));
    for (const fix of CORRECTIONS[lectureId] ?? []) {
      const cue = cues.find((item) => item.startMs === fix.startMs && item.text.includes(fix.from));
      if (!cue) throw new Error(`${lectureId}: correction at ${fix.startMs} ms no longer matches`);
      cue.text = cue.text.replace(fix.from, fix.to);
    }
    await writeFile(
      join(outDir, `${lectureId}.transcript.json`),
      JSON.stringify(toTranscript(cues)),
    );
    await writeFile(
      join(outDir, `${lectureId}.cues.json`),
      JSON.stringify(
        cues.map((cue, i) => ({ cueId: `${lectureId}-${String(i + 1).padStart(4, "0")}`, ...cue })),
      ),
    );
    lectures.push({
      lectureId,
      source: basename(file),
      sourceUrl: `${COURSE_URL}${basename(file)}`,
      sourceSha256: createHash("sha256").update(raw).digest("hex"),
      cues: cues.length,
      durationMs: cues.at(-1)?.endMs ?? 0,
      corrections: CORRECTIONS[lectureId] ?? [],
    });
    console.log(`${lectureId}: ${cues.length} cues`);
  }
  await writeFile(
    join(outDir, "manifest.json"),
    JSON.stringify(
      {
        course: "MIT 6.7960 Deep Learning, Fall 2024",
        courseUrl: COURSE_URL,
        license: "CC BY-NC-SA 4.0 (https://creativecommons.org/licenses/by-nc-sa/4.0/)",
        changes:
          "Parsed from the official WebVTT captions: sound tags and empty cues removed, speaker labels moved out of the text; reviewed caption errors corrected (listed per lecture).",
        transcriptVersion: TRANSCRIPT_VERSION,
        converterVersion: CONVERTER_VERSION,
        lectures,
      },
      null,
      2,
    ),
  );
};

if (process.argv[2] === "--check") check();
else if (process.argv.length === 4) await convert(process.argv[2], process.argv[3]);
else {
  console.error("usage: ocw-vtt-to-transcript.mjs <source dir> <out dir> | --check");
  process.exit(1);
}
