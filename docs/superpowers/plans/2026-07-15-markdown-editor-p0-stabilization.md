# Markdown Editor P0 Stabilization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent stale saves and file switches from losing Markdown, reject lossy WYSIWYG entry, and replace editable Markdown markers with an accessible inline-format toolbar.

**Architecture:** Keep Markdown text canonical in `useDocumentEditorFile`, with session-local edit revisions and a serialized/coalescing persistence queue that snapshots the write target. Share one Lexical node/transformer configuration between the visible editor and a headless round-trip preflight. Keep the legacy marker-editing plugin unmounted and apply formatting to semantic Lexical selections through a focused toolbar plugin.

**Tech Stack:** React 19, TypeScript, Lexical 0.44, Vite+, Testing Library, JSDOM.

---

## File map

- `packages/web/src/hooks/editor/useDocumentEditorFile.ts`: canonical text, revisions, load sessions, save intents, persistence queue, upgrade/rename integration.
- `packages/web/src/components/editor/DocumentEditorPage.tsx`: keyed file sessions and guarded editor-mode transitions.
- `packages/web/src/components/editor/WysiwygDocumentEditor.tsx`: visible Lexical editor wiring; the old source-marker plugin stops mounting.
- `packages/web/src/components/editor/WysiwygFormattingToolbar.tsx`: selection state, focus/selection preservation, format/link commands, positioning, and URL validation.
- `packages/web/src/components/editor/lexical/MarkdownLinkNode.tsx`: give the custom node a distinct type so Lexical can safely replace base links created by commands.
- `packages/web/src/lib/editor/wysiwygMarkdownConfig.ts`: the single Lexical node registry, Markdown transformers, import, and export helpers.
- `packages/web/src/lib/editor/markdownRoundTripGuard.ts`: newline equivalence and isolated headless preflight.
- `packages/web/test/editor/useDocumentEditorFile.test.tsx`: deferred save/load/upgrade and queue regression coverage.
- `packages/web/test/editor/DocumentEditorPage.test.tsx`: keyed file isolation and safe/unsafe mode-entry integration.
- `packages/web/test/editor/markdownRoundTripGuard.test.ts`: normalization and real production-registry preflight tests.
- `packages/web/test/editor/WysiwygFormattingToolbar.test.tsx`: user-level selection, formatting, link, focus, and shortcut tests.
- `packages/web/test/editor/SourceDocumentEditor.test.tsx`: replace the old marker-mount source assertion with a regression assertion that it is not mounted.
- `packages/web/test/editor/markdownTransformers.test.ts`: consume the shared registry/export helper.

The repository is already on the isolated feature branch `codex/markdown-document-editor`. Target files are part of a larger uncommitted editor change, so task commits are intentionally omitted: do not stage or commit unrelated user work.

### Task 1: Shared WYSIWYG configuration and lossless-entry preflight

**Files:**

- Create: `packages/web/src/lib/editor/wysiwygMarkdownConfig.ts`
- Modify: `packages/web/src/lib/editor/markdownRoundTripGuard.ts`
- Modify: `packages/web/src/components/editor/WysiwygDocumentEditor.tsx`
- Modify: `packages/web/src/components/editor/lexical/MarkdownLinkNode.tsx`
- Modify: `packages/web/test/editor/markdownRoundTripGuard.test.ts`
- Modify: `packages/web/test/editor/markdownTransformers.test.ts`

- [ ] **Step 1: Write failing normalization and real-conversion tests**

Extend `markdownRoundTripGuard.test.ts` to prove:

```ts
expect(normalizeMarkdownRoundTripText("a\rb\r")).toBe("a\nb");
expect(isMarkdownRoundTripSafe("a\n\n", "a\n\n")).toBe(true);
expect(isMarkdownRoundTripSafe("a\n\n", "a\n")).toBe(false);
expect(isMarkdownRoundTripSafe("a ", "a")).toBe(false);
expect(preflightMarkdownForWysiwyg("# Safe\n").safe).toBe(true);
expect(preflightMarkdownForWysiwyg("lossy fixture from the test").safe).toBe(false);
```

Use a fixture whose production Lexical import/export actually changes content. Add an exception test by allowing the preflight helper to accept a test-only conversion callback or by mocking the isolated converter at the module boundary; the public result must be `{ safe: false, reason: "conversion-error" }` rather than throwing.

- [ ] **Step 2: Run the guard tests and verify RED**

Run from `packages/web`:

```bash
./node_modules/.bin/vp test run test/editor/markdownRoundTripGuard.test.ts
```

Expected: FAIL because bare-CR normalization, shared converter, and preflight result do not exist.

- [ ] **Step 3: Extract the production Lexical registry**

Move the node list, `WYSIWYG_TRANSFORMERS`, code-fence export transformers, sentinel cleanup, and import/export helpers out of `WysiwygDocumentEditor.tsx` into `wysiwygMarkdownConfig.ts`.

First change `MarkdownLinkNode.getType()` and its serialized `type` from `"link"` to `"markdown-link"`. Then register both the distinct custom class and Lexical's node replacement. This lets `TOGGLE_LINK_COMMAND` create a base `LinkNode` and have it replaced without colliding with the registered base `"link"` type:

```ts
const markdownLinkReplacement = {
  replace: LinkNode,
  with: (node: LinkNode) =>
    new MarkdownLinkNode(node.getURL(), {
      rel: node.getRel(),
      target: node.getTarget(),
      title: node.getTitle(),
    }),
  withKlass: MarkdownLinkNode,
};

export const WYSIWYG_NODES = [
  CodeFenceNode,
  CodeHighlightNode,
  CodeNode,
  MarkdownLinkNode,
  markdownLinkReplacement,
  /* remaining existing nodes */
];
export const WYSIWYG_TRANSFORMERS = [
  /* exact existing ordering */
];

export const importWysiwygMarkdown = (markdown: string): void => {
  $convertFromMarkdownString(markdown, WYSIWYG_TRANSFORMERS, $getRoot());
};

export const exportWysiwygMarkdown = (editorState: EditorState): string =>
  editorState
    .read(() => $convertToMarkdownString(WYSIWYG_TRANSFORMERS))
    .replaceAll(`${CODE_FENCE_EXPORT_SENTINEL}\n\n`, "")
    .replaceAll(`\n\n${CODE_FENCE_EXPORT_SENTINEL}`, "")
    .replaceAll(CODE_FENCE_EXPORT_SENTINEL, "");
```

Update the visible editor and transformer tests to import these exports. Preserve transformer ordering exactly.

- [ ] **Step 4: Implement newline equivalence and headless preflight**

Normalize line endings with `/\r\n?|\n/g`, then remove one final `\n` independently from each side. Create a headless editor with `WYSIWYG_NODES`, run a discrete import, export with the shared helper, and return a discriminated result:

```ts
export type MarkdownPreflightResult =
  | { safe: true; roundTrippedText: string }
  | { safe: false; reason: "content-changed" | "conversion-error"; roundTrippedText?: string };
```

Do not weaken equality beyond line-ending normalization and one trailing newline.

- [ ] **Step 5: Run focused tests and verify GREEN**

```bash
./node_modules/.bin/vp test run test/editor/markdownRoundTripGuard.test.ts test/editor/markdownTransformers.test.ts
```

Expected: both files pass, including the production-registry import/export tests.

### Task 2: Revisioned save queue and stale-session isolation

**Files:**

- Modify: `packages/web/src/hooks/editor/useDocumentEditorFile.ts`
- Modify: `packages/web/test/editor/useDocumentEditorFile.test.tsx`

- [ ] **Step 1: Add deferred regression tests for immutable saves**

Add a local helper:

```ts
const createDeferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, reject, resolve };
};
```

Write separate tests that prove:

- revision 1 completing after revision 2 was typed never replaces visible revision 2;
- an intent captured for file A writes file A after rerendering the hook with file B;
- a stale file A load/save completion cannot replace file B state;
- an edit made during an in-flight save is persisted by one follow-up request;
- a failed request leaves error/dirty state but a later explicit save succeeds;
- a stale successful write still calls `onFileUpdated` with the file actually written;
- identical `updateText` does not mark dirty or queue a save;
- an upgrade racing with a newer edit retains the newer text, and the follow-up normal save receives the upgraded `.md` name/MIME metadata.
- two `saveNow`/`flushPendingSave` calls coalesced into one pending intent both remain pending until the covering write settles.

- [ ] **Step 2: Run the hook test and verify RED**

```bash
./node_modules/.bin/vp test run test/editor/useDocumentEditorFile.test.tsx
```

Expected: the new concurrency tests fail because saves read mutable refs at execution time and completions call `setText(result.text)`.

- [ ] **Step 3: Add session-local revisions and immutable intents**

Inside the hook, introduce refs for `sessionId`, `revision`, `lastSavedRevision`, `persistedFile`, and `lastSavedText`. Increment revision only when the canonical string changes. Initialize loaded text and last-saved state at revision `0` for each load session.

Expose a stable read callback for page-level preflight without making callers assemble a stale render snapshot:

```ts
getCanonicalSnapshot(): {
  fileId: string | null;
  revision: number;
  sessionId: number;
  text: string;
}
```

Capture this shape synchronously in `queuePersist`:

```ts
interface SaveIntent {
  targetFileId: string;
  targetStoragePath: string;
  mode: "save" | "upgrade-markdown";
  name?: string;
  revision: number;
  sessionId: number;
  text: string;
}
```

The optional name carries a title rename through the same queue. Do not retain `activeFileRef` as the write target.

- [ ] **Step 4: Implement one-in-flight/one-pending queue semantics**

Keep one running entry and one coalesced pending entry. Each entry owns all deferred callers whose request it supersedes so `saveNow`, `flushPendingSave`, rename, and upgrade promises resolve only after the covering write settles.

At execution time, materialize the persistence call from the session-local `persistedFileRef` after verifying the captured target ID/storage path. Preserve an explicit pending upgrade mode while replacing its text/revision with newer edits. After an upgrade succeeds, update `persistedFileRef` before starting the pending normal save, even if the React session unmounted.

The runner must continue after rejection. Only enqueue an automatic follow-up when the active canonical revision is newer than the settled request and remains dirty; never immediately retry the same failed revision.

- [ ] **Step 5: Gate UI acceptance without gating persistence callbacks**

For every successful actual write:

```ts
onFileUpdatedRef.current?.(result.updatedEvent);
```

Emit this even if unmounted or stale. Update React file/save state only when session ID and file ID still match and `intent.revision >= lastSavedRevisionRef.current`. Never call `setText` from any save, rename, or upgrade completion. If current text differs from the accepted request text, leave the visible state dirty.

Use a monotonically increasing load session ID in addition to the component key so stale reloads cannot apply. Cleanup must capture the outgoing file/text intent before props can redirect refs.

- [ ] **Step 6: Preserve attachment, rename, and shortcut behavior**

Route `renameTitle` through the same queue using `name`, preserving newer text. Keep `attachImage` ordering: flush, store attachment, append Markdown, queue latest save. Keep only one Cmd/Ctrl+S listener (the hook listener); the page-level duplicate is removed in Task 3.

- [ ] **Step 7: Run the hook tests and verify GREEN**

```bash
./node_modules/.bin/vp test run test/editor/useDocumentEditorFile.test.tsx test/editor/documentPersistence.test.ts
```

Expected: all hook concurrency tests and existing persistence tests pass with no unhandled rejection warnings.

### Task 3: Keyed file sessions and guarded mode transitions

**Files:**

- Modify: `packages/web/src/components/editor/DocumentEditorPage.tsx`
- Modify: `packages/web/test/editor/DocumentEditorPage.test.tsx`

- [ ] **Step 1: Write failing page integration tests**

Add tests that prove:

- rerendering from file A to file B creates a fresh session, shows B, and ignores deferred A load/save state;
- same-file metadata updates still do not remount or move source selection;
- safe Markdown enters Preview by default and through the Preview button;
- unsafe Markdown opens and remains in Code mode with a non-blocking explanation;
- an unsafe `.txt` upgrade succeeds and emits Markdown metadata but remains in Code mode;
- a preflight exception remains in Code mode;
- a stale preflight snapshot cannot switch a newer file/edit to Preview.

- [ ] **Step 2: Run page/guard tests and verify RED**

```bash
./node_modules/.bin/vp test run test/editor/DocumentEditorPage.test.tsx test/editor/markdownRoundTripGuard.test.ts
```

Expected: unsafe documents currently enter WYSIWYG and file IDs reuse one session.

- [ ] **Step 3: Key the React session and remove duplicate save shortcut**

Render:

```tsx
<DocumentEditorSession key={currentFile.id} file={currentFile} ... />
```

Do not key by name, MIME, storage path, size, or `updatedAt`. Remove the `DocumentEditorSession` Cmd/Ctrl+S effect because the hook already registers the shortcut.

- [ ] **Step 4: Guard every WYSIWYG entry path**

Add a small local helper that calls `editorFile.getCanonicalSnapshot()`, runs `preflightMarkdownForWysiwyg(snapshot.text)`, calls `getCanonicalSnapshot()` again, and requires exact equality of `{ sessionId, fileId, revision, text }` before setting mode. Use it for:

- initial Markdown mode selection;
- explicit Code-to-Preview requests after `flushPendingSave`;
- confirmed `.txt` upgrade using the latest canonical text after the upgrade promise resolves.

On `content-changed` or `conversion-error`, set a dedicated WYSIWYG safety notice and stay in source mode. Do not add an “open anyway” path. Keep reference notices independent so one notice does not silently erase the other.

- [ ] **Step 5: Run page tests and verify GREEN**

```bash
./node_modules/.bin/vp test run test/editor/DocumentEditorPage.test.tsx test/editor/useDocumentEditorFile.test.tsx test/editor/markdownRoundTripGuard.test.ts
```

Expected: all mode, upgrade, and session-isolation tests pass.

### Task 4: Accessible selection formatting toolbar

**Files:**

- Create: `packages/web/src/components/editor/WysiwygFormattingToolbar.tsx`
- Create: `packages/web/test/editor/WysiwygFormattingToolbar.test.tsx`
- Modify: `packages/web/src/components/editor/WysiwygDocumentEditor.tsx`
- Modify: `packages/web/test/editor/SourceDocumentEditor.test.tsx`

- [ ] **Step 1: Write failing user-level formatting tests**

Render the real `WysiwygDocumentEditor`, select DOM text with `Range`/`window.getSelection`, and dispatch `selectionchange`. Test separately:

- a non-collapsed selection shows Bold, Italic, Strikethrough, Inline code, and Link controls;
- `aria-pressed` is `false`, `true`, or `mixed` for unformatted, uniformly formatted, and mixed selections;
- pointer activation does not collapse the selected range;
- keyboard activation applies/removes bold and italic and publishes Markdown via `onTextChange`;
- existing Cmd/Ctrl+B and Cmd/Ctrl+I shortcuts publish Markdown;
- valid HTTP(S), `mailto:`, relative, root-relative, and hash links can be created;
- a fully linked selection is unlinked without prompting;
- partial/multiple links report mixed;
- cancel and `javascript:`, `data:`, `vbscript:`, empty, or control-character URLs are non-destructive;
- `Escape` restores the editor selection and focus.

Stub `window.prompt` and DOM range rectangles only where JSDOM lacks browser layout; assert emitted Markdown and accessible state, not private Lexical fields.

- [ ] **Step 2: Run toolbar/source tests and verify RED**

```bash
./node_modules/.bin/vp test run test/editor/WysiwygFormattingToolbar.test.tsx test/editor/SourceDocumentEditor.test.tsx
```

Expected: toolbar queries fail and the existing source assertion still expects the old plugin to mount.

- [ ] **Step 3: Implement selection state and safe URL helpers**

In `WysiwygFormattingToolbar.tsx`, export focused helpers for testability:

```ts
type PressedState = boolean | "mixed";
type InlineFormat = "bold" | "italic" | "strikethrough" | "code";

export const isSafeMarkdownLinkUrl = (value: string): boolean => {
  /* explicit allowlist */
};
```

Derive format state across selected text nodes: all formatted is `true`, none is `false`, otherwise `mixed`. Derive link state by walking selected nodes to `MarkdownLinkNode`: one shared link is pressed, none is unpressed, partial or multiple links are mixed.

- [ ] **Step 4: Implement focus, selection, and positioning behavior**

Build the toolbar as a Lexical plugin using `useLexicalComposerContext`. Store `selection.clone()` for the last valid non-collapsed range. Keep the toolbar visible while focus is in the editor or toolbar. On pointer down, call `preventDefault`; before keyboard/click commands, restore a clone with `$setSelection`.

Place controls in normal tab order. `Escape` restores the selection and focuses `editor.getRootElement()`. Position from the native range rect and clamp coordinates to the viewport, with a safe no-layout fallback for JSDOM.

- [ ] **Step 5: Dispatch semantic format and link commands**

Use `FORMAT_TEXT_COMMAND` for four inline formats and `TOGGLE_LINK_COMMAND` for links. The shared node replacement from Task 1 must ensure toggle-created links are `MarkdownLinkNode` instances and continue exporting through `MARKDOWN_LINK_TRANSFORMER`. Mixed/unpressed format buttons apply across the range; pressed buttons remove. A pressed link removes without prompt; otherwise prompt, validate, restore selection, and apply the URL. Cancellation/rejection restores selection without dispatching a content command.

- [ ] **Step 6: Disable marker editing and mount the toolbar**

Leave `CurrentBlockSourcePlugin` implementation in place for this localized P0 pass, but remove its JSX mount. Remove `editableMarkdownSourceRef` gating from `OnChangePlugin`; every semantic editor update exports with `exportWysiwygMarkdown` and reaches `commitMarkdown`. Mount `WysiwygFormattingToolbar` inside `LexicalComposer` next to the editable region.

Update `SourceDocumentEditor.test.tsx` to assert the JSX source does not contain `<CurrentBlockSourcePlugin` and does contain `<WysiwygFormattingToolbar`, instead of asserting current-block marker editing is active.

- [ ] **Step 7: Run toolbar and WYSIWYG regressions and verify GREEN**

```bash
./node_modules/.bin/vp test run test/editor/WysiwygFormattingToolbar.test.tsx test/editor/SourceDocumentEditor.test.tsx test/editor/markdownTransformers.test.ts
```

Expected: selection formatting, links, focus restoration, keyboard shortcuts, published Markdown, and legacy transformer tests all pass.

### Task 5: Full verification and scope audit

**Files:**

- Verify all files above; make only test-driven corrections.

- [ ] **Step 1: Run the complete editor test suite**

```bash
./node_modules/.bin/vp test run test/editor
```

Expected: all editor test files pass with zero failures and no unhandled errors.

- [ ] **Step 2: Run targeted lint**

```bash
./node_modules/.bin/vp lint \
  src/hooks/editor/useDocumentEditorFile.ts \
  src/components/editor/DocumentEditorPage.tsx \
  src/components/editor/WysiwygDocumentEditor.tsx \
  src/components/editor/WysiwygFormattingToolbar.tsx \
  src/lib/editor/wysiwygMarkdownConfig.ts \
  src/lib/editor/markdownRoundTripGuard.ts \
  test/editor/useDocumentEditorFile.test.tsx \
  test/editor/DocumentEditorPage.test.tsx \
  test/editor/WysiwygFormattingToolbar.test.tsx \
  test/editor/markdownRoundTripGuard.test.ts
```

Expected: zero lint errors in touched files.

- [ ] **Step 3: Run the web type/build check available in this repository**

```bash
./node_modules/.bin/vp check .
```

Expected: exit code `0`. If the repository-wide check reports a pre-existing unrelated failure, record the exact output and still run the narrow editor tests/lint above.

- [ ] **Step 4: Audit the implementation against the spec**

Confirm from code and tests that:

- no persistence completion writes canonical text;
- file/session/revision gates are monotonic;
- successful stale writes still emit their actual metadata callback;
- an upgrade-followed save retains Markdown metadata;
- every WYSIWYG entry path preflights the current snapshot;
- `CurrentBlockSourcePlugin` is not mounted;
- toolbar actions publish Markdown and remain keyboard accessible;
- no CodeMirror, storage transaction, block toolbar, or unrelated redesign was added.
