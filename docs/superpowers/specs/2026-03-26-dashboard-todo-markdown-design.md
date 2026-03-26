# Dashboard TODO Markdown Panel Design

## Summary

Replace the static "Today's Tasks" card in the dashboard with a simple TODO panel that reads and writes a real Markdown document stored in OPFS. The document must live under the existing `/files` storage model and also appear as a normal document in the existing `Files` and desktop file surfaces.

The dashboard panel is the primary editing surface for this document. It will parse a constrained Markdown format into TODO items, render open and completed sections, and serialize changes back into the same file. The feature is intentionally narrow: add tasks, display multiline content, and toggle completion state.

## Goals

- Replace the hard-coded task list with a live TODO panel.
- Persist data in OPFS as Markdown, not `localStorage`.
- Register the Markdown file as a real document in the existing file system model so it appears in `Files` and desktop surfaces.
- Support multiline TODO content.
- Keep the editing interaction lightweight inside the dashboard.

## Non-Goals

- No drag-and-drop sorting.
- No delete action.
- No task categories, labels, due dates, or filtering.
- No rich Markdown editing UI.
- No sync across devices or remote storage.
- No support for arbitrary Markdown formats beyond the constrained dashboard format.

## User Experience

### Panel layout

The dashboard card currently occupied by the static task block becomes a TODO panel with:

- A title and a short explanatory line.
- A multiline textarea for entering a new TODO item.
- An `Add` button.
- An `Open` list section.
- A `Done` list section.

### Task behavior

- Users can enter multiline task text in the textarea.
- Empty or whitespace-only input cannot be added.
- New tasks are inserted into the top of the `Open` section.
- Clicking a task checkbox toggles it between `Open` and `Done`.
- Multiline text remains multiline when displayed in the panel.
- Empty sections show a restrained empty-state message instead of blank space.

### First-run behavior

- On first load, if the backing document does not exist, the app creates it automatically and registers it as a real document file.
- The initial document contains the expected heading and empty `Open` / `Done` sections.

## Backing Document

### File identity

The feature uses a single dedicated document file:

- Display name: `Today Tasks`
- File type: `document`
- MIME type: `text/markdown`
- Storage type: `opfs`

The document must be stored using the same `/files/<id>/...` directory shape already used by existing file storage so it works with current file metadata and listing logic.

### Registration requirements

Creating the backing document requires both of these operations:

1. Write the Markdown file and its metadata into OPFS.
2. Commit the matching LiveStore file event so the file appears in desktop and library queries.

This dual write is required because the app does not discover `/files` entries by scanning OPFS at render time; visible file lists come from LiveStore state.

## Markdown Format

The dashboard owns a constrained document format and always rewrites the file into canonical form.

### Canonical structure

```md
# Today Tasks

## Open

- [ ] Draft the storage parser
- [ ] Multi-line item
      continues on a second line

## Done

- [x] Replace the static dashboard card
```

### Format rules

- The top-level heading is always `# Today Tasks`.
- The document contains exactly two task sections: `## Open` and `## Done`.
- `Open` items use `- [ ]`.
- `Done` items use `- [x]`.
- Continuation lines for multiline items are indented by two spaces.
- Serialization always emits a single blank line between major sections.
- Serialization trims trailing whitespace and ends with a newline.

### Parsing rules

- Only task list items inside the `## Open` and `## Done` sections are interpreted as dashboard tasks.
- Continuation lines directly following a task are appended to that task body with newline separators.
- Blank continuation lines inside a task are preserved as paragraph breaks when possible.
- Unknown content outside the recognized structure is ignored by the parser.
- If the file cannot be parsed into the expected structure, the UI falls back to an empty task state rather than crashing.

### Ownership model

The dashboard is the canonical writer for this file. External edits are not forbidden, but the next successful dashboard save will normalize the file back into canonical structure.

## Data Model

In memory, the dashboard works with a simple task shape:

- `id`: stable string identifier
- `text`: full multiline task content
- `done`: boolean
- `createdAt`: timestamp
- `updatedAt`: timestamp

The Markdown file does not need to expose all metadata explicitly. The implementation may store stable task identifiers in a constrained, dashboard-owned way if needed for React key stability, but the on-disk representation should remain human-readable first.

If stable per-task identifiers are not needed after implementation exploration, they should be omitted rather than introducing hidden syntax without a direct benefit.

## File Lifecycle

### Discovery

On panel load:

1. Query active files for a document named `Today Tasks`.
2. Prefer an existing active document if one exists.
3. If no such file exists, create one.

If multiple active `Today Tasks` documents exist, the panel should use the most recently updated one and ignore the rest for now. Duplicate cleanup is out of scope.

### Creation

When creating the document:

1. Generate a file id.
2. Write canonical Markdown content into the `/files/<id>/...` storage layout.
3. Write matching file metadata.
4. Commit `fileCreated` so the document appears in file queries.

### Updates

When mutating tasks:

1. Build the next task state in memory.
2. Serialize it to canonical Markdown.
3. Overwrite the OPFS Markdown file.
4. Update file metadata such as `updatedAt` and `sizeBytes`.
5. Commit `fileUpdated` with the new metadata-relevant fields.

## Synchronization and Concurrency

- The panel should serialize writes through a single in-flight chain so rapid user actions do not race and overwrite one another out of order.
- Optimistic UI is acceptable, but only if failed writes can revert to the last confirmed state.
- The component should keep a last-known-good parsed state for recovery.
- If an external edit changes the backing file while the panel is open, the panel does not need live conflict resolution. The current session may overwrite that change on the next save.

## Error Handling

- Initial load failure should show a compact error message in the card instead of crashing the dashboard.
- If file creation fails, the panel remains unavailable and offers a retry path.
- If an update write fails, revert the optimistic change and show a compact failure message.
- If parsing fails because the document content is malformed, show an empty-state view plus an explanatory note that the file could not be interpreted.
- Failures should be logged to the console for debugging.

## Performance

- The document is expected to stay small, so full-file rewrite on each change is acceptable.
- No incremental patching is required.
- Parsing and serialization should remain synchronous and cheap for typical TODO list sizes.

## Testing Requirements

Implementation planning must include tests for:

- Markdown parser handling open items, done items, and multiline items.
- Markdown serializer emitting canonical structure.
- First-run creation of the backing file.
- Re-loading an existing file from OPFS.
- Updating tasks and writing the new Markdown content.
- Toggling completion state.
- Error handling on failed reads and failed writes.
- File registration behavior so the document appears through existing file-query paths.

## Open Implementation Decisions Already Resolved

- Persistence is OPFS-backed, not `localStorage`.
- The stored representation is Markdown.
- The Markdown file must exist under the `/files` storage model.
- The file must appear as a real document in existing file surfaces.
- The feature scope stays minimal: add, display multiline text, toggle done state.
