export interface ReleaseNote {
  // The `## ` heading text, e.g. a release date. Unique within the file.
  id: string;
  items: string[];
}

export interface ReleaseNotesManifest {
  version: string;
  notes: ReleaseNote[];
}

// Reads RELEASE_NOTES.md: each `## ` heading starts a release (newest first) and each `- `
// bullet under it is one note. Other lines are ignored.
export const parseReleaseNotes = (markdown: string): ReleaseNote[] => {
  const notes: ReleaseNote[] = [];
  for (const line of markdown.split("\n")) {
    const heading = /^##\s+(.+?)\s*$/.exec(line);
    if (heading) {
      notes.push({ id: heading[1], items: [] });
      continue;
    }
    const item = /^[-*]\s+(.+?)\s*$/.exec(line);
    if (item && notes.length > 0) notes[notes.length - 1].items.push(item[1]);
  }
  return notes.filter((note) => note.items.length > 0);
};

// The releases a client on `knownId` has not seen. An unknown id shows only the latest release
// instead of the whole history.
export const releaseNotesSince = (notes: ReleaseNote[], knownId: string): ReleaseNote[] => {
  const index = notes.findIndex((note) => note.id === knownId);
  if (index === -1) return notes.slice(0, 1);
  return notes.slice(0, index);
};

export const isReleaseNotesManifest = (value: unknown): value is ReleaseNotesManifest => {
  if (typeof value !== "object" || value === null) return false;
  const { version, notes } = value as Partial<ReleaseNotesManifest>;
  return (
    typeof version === "string" &&
    Array.isArray(notes) &&
    notes.every(
      (note) =>
        typeof note?.id === "string" &&
        Array.isArray(note.items) &&
        note.items.every((item) => typeof item === "string"),
    )
  );
};
