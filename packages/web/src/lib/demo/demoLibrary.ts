import type { useAppStore } from "@/livestore/store";
import { fileEvents } from "@/livestore/file";
import { normalizeSettingsValue, settingsTable, type setting } from "@/livestore/setting";
import { desktopFilesQuery$, desktopFoldersQuery$ } from "@/lib/desktop/queries";
import { createNewMarkdownNote } from "@/lib/editor/noteCreation";
import { settingsDocumentQuery$ } from "@/lib/settings/queries";

const DEMO_NOTE_NAME = "Week 3 lecture notes";

// Notes a student took in the same lecture the demo transcript plays, so search finds them too.
const DEMO_NOTE_MARKDOWN = `Bayes' theorem: how to update a belief when new evidence comes in.

- Prior: how likely something is before you see any evidence
- Likelihood: how likely the evidence is if the belief is true
- Posterior = prior × likelihood ÷ evidence

Example from class: a disease affects 1 in 100 people, the test catches 90% of cases, and flags 9% of healthy people. A positive test means only about 9% chance of being sick?? Why so low?

"The prior matters far more than most people expect." Ask about this before the exam.
`;

type DemoLibraryStore = Pick<ReturnType<typeof useAppStore>, "query" | "commit">;

let seeding: Promise<void> | null = null;

/** Adds the demo lecture notes to the library unless a note with that name is already there. */
export const seedDemoLibrary = (store: DemoLibraryStore): Promise<void> => {
  // Effects can run twice in development; seed once per page load.
  seeding ??= addDemoNote(store);
  return seeding;
};

const addDemoNote = async (store: DemoLibraryStore): Promise<void> => {
  const files = store.query(desktopFilesQuery$);
  if (files.some((file) => file.name.startsWith(DEMO_NOTE_NAME))) return;
  const settings = normalizeSettingsValue(
    (store.query(settingsDocumentQuery$) as Partial<setting> | undefined) ??
      settingsTable.default.value,
  );
  const result = await createNewMarkdownNote({
    settings: {
      defaultNoteLocationMode: settings.defaultNoteLocationMode,
      defaultNoteFolderId: settings.defaultNoteFolderId,
    },
    files,
    folders: store.query(desktopFoldersQuery$).map((folder) => ({
      id: folder.id,
      name: folder.name,
      parentId: folder.parentId ?? null,
    })),
    initialContent: DEMO_NOTE_MARKDOWN,
    name: DEMO_NOTE_NAME,
  });
  store.commit(fileEvents.fileCreated(result.createdEvent));
};
