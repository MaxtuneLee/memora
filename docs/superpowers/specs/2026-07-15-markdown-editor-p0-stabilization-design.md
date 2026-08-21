# Markdown Editor P0 Stabilization Design

## Summary

Stabilize the current Markdown editor before adding more editing features. The work fixes the four
P0 failure modes found in the architecture scan and replaces the unsafe “edit Markdown markers
inside WYSIWYG nodes” interaction with a selection formatting toolbar.

The existing product decision remains unchanged: Markdown text is the only persisted source of
truth. Lexical is an editing projection of that text, not a second persisted document model.

## Goals

- Never replace newer user input with the result of an older save.
- Prevent an asynchronous result for one file from changing another file's editor session.
- Refuse WYSIWYG entry when Markdown import/export would change the source beyond the approved
  newline normalization.
- Remove the transient editable Markdown-node state that can bypass normal change propagation.
- Preserve common formatting operations through an accessible selection toolbar.

## Non-Goals

- Replacing the source textarea with CodeMirror.
- Redesigning the complete editor shell or theme.
- Making OPFS content, metadata, and LiveStore updates fully transactional.
- Adding every possible rich-text command, slash commands, or block menus.
- Reworking all custom Markdown transformers in this pass.

## Approved Interaction Decision

The user approved replacing in-place Markdown marker editing with a formatting toolbar.

When the user selects text in WYSIWYG mode, a compact floating toolbar provides:

- bold
- italic
- strikethrough
- inline code
- link creation and removal

The toolbar reports active states with `aria-pressed`, keeps the selection intact when a button is
pressed, and supports the existing Lexical keyboard shortcuts such as `Cmd/Ctrl+B` and
`Cmd/Ctrl+I`. Exact Markdown editing remains available in source mode.

Block formatting such as headings, lists, and quotes is deliberately excluded from this first
toolbar. Existing Markdown shortcuts and imported block formatting continue to work.

## Canonical State Contract

The current Markdown string in `useDocumentEditorFile` is the canonical in-memory content.

Lexical must publish every semantic content change through `onTextChange`. WYSIWYG may keep normal
editor-local selection and history state, but it must not maintain a separate editable Markdown
representation whose content is hidden from `onTextChange`.

The current `CurrentBlockSourcePlugin` interaction is disabled. Its implementation may remain in
the file temporarily to keep this P0 change localized, but it must not mount or intercept changes.
The formatting toolbar uses Lexical commands against the semantic nodes instead.

## Save Request Contract

The queue records an immutable intent as soon as saving is requested:

```ts
interface DocumentSaveIntent {
  targetFileId: string;
  targetStoragePath: string;
  mode: "save" | "upgrade-markdown";
  sessionId: number;
  text: string;
  revision: number;
}
```

Immediately before persistence begins, the runner combines that intent with its session-local latest
persisted file snapshot to create an immutable request:

```ts
interface DocumentSaveRequest {
  file: Readonly<TextDocumentFileLike>;
  mode: "save" | "upgrade-markdown";
  sessionId: number;
  text: string;
  revision: number;
}
```

The target ID and storage path must match the intent, so a switched UI session can never redirect
the write. The request stores a shallow value snapshot of the latest metadata rather than retaining
the mutable ref used by the UI.

This materialization boundary is important for upgrades. If an edit is queued while an upgrade is
in flight, its intent captures the newer text and revision but not the old `.txt` name or MIME type.
After the upgrade succeeds, the runner updates its session-local persisted file snapshot even if the
UI session has unmounted, then creates the pending normal-save request from the accepted Markdown
metadata. The later save therefore cannot revert the upgraded name or MIME type.

Revisions are session-local edit generations. A successful load initializes `revision` and
`lastSavedRevision` to `0` with the loaded text as `lastSavedText`. An update increments `revision`
only when the canonical string actually changes. Dirty state is based on
`currentText !== lastSavedText`; the revision exists to order asynchronous work, not to force a
write when the user has returned to the already-persisted text.

A save result may update `lastSavedText`, `lastSavedRevision`, active metadata, and visible save
state only when its `sessionId` and file ID still match the active session and its revision is not
older than the latest accepted saved revision. `lastSavedRevision` is monotonic within a session.
An older same-session completion is ignored instead of moving save state backward.

Neither save mode calls `setText(result.text)` on completion. If the current revision is newer than
the saved revision, the editor remains dirty and the newer text remains visible. The successful
request still becomes the latest persisted baseline if it passes the monotonic acceptance check,
and a follow-up request writes the newest dirty revision.

The queue has at most one in-flight request and one coalesced pending intent. While a request is
running, a newer save replaces the pending normal-save intent for that session; an explicit upgrade
intent retains its ordering while taking the newest canonical text/revision. When the in-flight
request settles, the runner:

1. handles success or failure without leaving the promise chain rejected;
2. runs the pending request, if present;
3. otherwise compares the active canonical snapshot with the request that just settled and queues
   the newest revision only when it is still dirty and newer than the settled request.

This guarantees that an edit made during a save is not stranded. A failed request leaves the
editor dirty with an error and can be retried by the next autosave or explicit save; it does not
poison later requests or retry forever by itself.

The persistence callback for a successfully written request is still emitted even if the component
has unmounted or the active session changed, so OPFS metadata and LiveStore are not intentionally
left out of sync.

## File Session Isolation

`DocumentEditorSession` is keyed by file ID. Navigating between file IDs creates a fresh React
session with independent refs, save state, editor mode, and load lifecycle.

Within the hook, each load cycle also owns a monotonically increasing session ID. Load and save
completions check that ID before changing active React state. A stale operation may finish its own
persistence work but cannot replace the active file or text.

The `.txt` to Markdown upgrade keeps the existing file ID and storage target; it changes the name,
MIME type, and metadata. Its completion never replaces canonical text. If edits occurred during the
upgrade, the upgraded metadata may be accepted for the matching session while the current text
remains dirty and is written by a follow-up normal save. The mode check then uses the current text,
not the text captured by the upgrade request. If that text is not round-trip safe, the file remains
successfully upgraded but stays in source mode with the safety explanation.

## WYSIWYG Entry Guard

Before WYSIWYG is selected, the editor performs an isolated Lexical conversion using the same node
set and transformer registry as the visible editor:

1. import the current Markdown into a headless Lexical editor;
2. export that editor state back to Markdown;
3. compare source and export with `isMarkdownRoundTripSafe`;
4. catch conversion failures and treat them as unsafe.

The production editor and preflight import the node list and transformer list from one shared
configuration module so they cannot drift through duplicated constants.

Preflight operates on an immutable `{ sessionId, fileId, revision, text }` snapshot. Immediately
before changing mode, the caller verifies that all four values still match the active editor. A
result for an older edit or file is discarded. The conversion can be synchronous internally, but
the snapshot check remains part of the public contract.

For comparison, each side first replaces every `\r\n` and bare `\r` with `\n`, then independently
removes one final `\n` if present. No other whitespace, marker, or content difference is ignored.

Unsafe documents remain in source mode and show a non-blocking explanation. This guard applies to:

- initial mode selection for Markdown files;
- explicit source-to-WYSIWYG switches;
- the result of a confirmed `.txt` to `.md` upgrade.

No lossy “open anyway” path is added.

## Formatting Toolbar Architecture

The toolbar is implemented as a Lexical plugin inside `LexicalComposer` so it can read selection
state and dispatch editor commands without exposing Lexical internals to the page or persistence
hook.

The plugin:

- subscribes to editor updates and selection changes;
- appears only for a non-collapsed range selection inside the editor;
- derives active inline formats from the selection;
- uses `FORMAT_TEXT_COMMAND` for bold, italic, strikethrough, and code;
- uses `TOGGLE_LINK_COMMAND` for link creation and removal;
- positions itself from the browser selection range while clamping to the viewport;
- treats the editor and toolbar as one interaction region and hides only when the selection is
  collapsed or focus leaves both regions.

The plugin stores the last valid Lexical range selection while the toolbar is open. Pointer presses
on a toolbar button prevent the browser's default focus/selection collapse. Keyboard activation
restores the stored selection inside `editor.update` before dispatching a command. Toolbar controls
are in the normal tab order; `Escape` returns focus to the editor and restores the selection.

An inline-format button is pressed when the whole selection has that format, unpressed when none of
it does, and `aria-pressed="mixed"` for a partial selection. Activating an unpressed or mixed button
applies the format across the selection; activating a fully pressed button removes it.

For links, a selection entirely inside one link reports pressed, an unlinked selection reports
unpressed, and partial or multiple-link selections report mixed. Activating a fully linked
selection removes its link. Otherwise the action asks for a destination and applies one link across
the selection. A destination is accepted only when it is a non-empty HTTP(S), `mailto:`, relative,
root-relative, or hash URL without control characters; dangerous schemes such as `javascript:`,
`data:`, and `vbscript:` are rejected. Cancelling or rejecting the prompt restores the selection and
leaves content unchanged.

The link action uses a small prompt in this pass because link destination entry is required but a
full link popover is outside the P0 scope. Cancelling the prompt leaves content unchanged.

## Error Handling

- Failed saves preserve canonical text and the dirty/error state.
- Stale save or load results do not modify the active session.
- WYSIWYG preflight exceptions keep the editor in source mode.
- Formatting commands that no longer have a valid selection are ignored safely.
- Link prompt cancellation does not remove an existing link.

## Testing Strategy

Tests are added before production changes and must fail for the expected current behavior.

Required regression coverage:

- loaded content starts at the saved revision baseline and identical updates do not create work;
- a deferred save of revision 1 cannot overwrite visible revision 2;
- same-session save completions cannot move the accepted saved revision backward;
- editing during an in-flight save schedules the newest dirty revision after it settles;
- a failed save does not block a later successful request;
- a save queued for file A always writes file A even after file B becomes active;
- a stale file A completion cannot replace file B state;
- a stale persistence success still emits the callback for the file actually written;
- an upgrade race preserves newer text, keeps the same file ID and final Markdown name/MIME
  metadata, and saves that newer revision;
- unsafe Markdown defaults to source mode and cannot be switched into WYSIWYG;
- safe Markdown enters WYSIWYG through the production preflight path;
- preflight exceptions and stale preflight snapshots cannot change editor mode;
- the visible editor and preflight use the same exported node/transformer registry;
- CRLF, bare CR, and one trailing newline remain allowed by the guard;
- adding or removing more than the one ignored trailing newline is unsafe, while identical multiple
  trailing newlines remain equal; differences in spaces, Markdown markers, or content remain unsafe;
- an unsafe post-upgrade document is upgraded successfully but remains in source mode;
- WYSIWYG changes always publish while the replacement marker-editing feature is disabled;
- selecting text exposes the formatting toolbar;
- pointer and keyboard toolbar activation preserve or restore the selected range;
- toolbar commands apply and remove uniform or mixed inline formats and publish the resulting
  Markdown through `onTextChange`;
- format and link controls expose unpressed, pressed, and mixed `aria-pressed` states;
- valid links can be created and a fully linked selection can be unlinked;
- partial and multiple-link selections report mixed state;
- link cancellation and invalid URLs are non-destructive;
- `Escape` restores editor focus, and existing `Cmd/Ctrl+B` and `Cmd/Ctrl+I` shortcuts continue to
  publish canonical Markdown.

Existing editor tests and targeted lint must remain clean.

## Expected File Changes

- `packages/web/src/hooks/editor/useDocumentEditorFile.ts`
- `packages/web/src/components/editor/DocumentEditorPage.tsx`
- `packages/web/src/components/editor/WysiwygDocumentEditor.tsx`
- `packages/web/src/lib/editor/wysiwygMarkdownConfig.ts`
- `packages/web/src/lib/editor/markdownRoundTripGuard.ts`
- `packages/web/test/editor/useDocumentEditorFile.test.tsx`
- `packages/web/test/editor/DocumentEditorPage.test.tsx`
- `packages/web/test/editor/markdownRoundTripGuard.test.ts`
- a focused WYSIWYG toolbar component test file

No generated route or storage schema change is required.
