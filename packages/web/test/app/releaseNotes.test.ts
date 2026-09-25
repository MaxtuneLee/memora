import { readFileSync } from "node:fs";

import { expect, test } from "vite-plus/test";

import {
  isReleaseNotesManifest,
  parseReleaseNotes,
  releaseNotesSince,
} from "@/lib/app/releaseNotes";

const MARKDOWN = `# Release notes

Intro text is not a note.

## 2026-10-02

- Search finds text inside images.
* Faster startup.

## 2026-09-30

## 2026-09-25

- First tracked release.
`;

test("parses each release heading and its bullets, skipping releases without notes", () => {
  expect(parseReleaseNotes(MARKDOWN)).toEqual([
    { id: "2026-10-02", items: ["Search finds text inside images.", "Faster startup."] },
    { id: "2026-09-25", items: ["First tracked release."] },
  ]);
});

test("returns the releases newer than the one the client shipped with", () => {
  const notes = parseReleaseNotes(MARKDOWN);

  expect(releaseNotesSince(notes, "2026-09-25").map((note) => note.id)).toEqual(["2026-10-02"]);
  expect(releaseNotesSince(notes, "2026-10-02")).toEqual([]);
});

test("shows only the latest release when the client's release is unknown", () => {
  const notes = parseReleaseNotes(MARKDOWN);

  expect(releaseNotesSince(notes, "").map((note) => note.id)).toEqual(["2026-10-02"]);
});

test("the shipped release notes parse into at least one release", () => {
  const notes = parseReleaseNotes(
    readFileSync(new URL("../../RELEASE_NOTES.md", import.meta.url), "utf8"),
  );

  expect(notes.length).toBeGreaterThan(0);
  expect(new Set(notes.map((note) => note.id)).size).toBe(notes.length);
});

test("rejects a malformed release notes manifest", () => {
  expect(isReleaseNotesManifest({ version: "abc1234", notes: [{ id: "x", items: ["y"] }] })).toBe(
    true,
  );
  expect(isReleaseNotesManifest({ version: "abc1234", notes: [{ id: "x", items: [1] }] })).toBe(
    false,
  );
  expect(isReleaseNotesManifest(null)).toBe(false);
});
