# Markdown Document Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the Memora Markdown document editor so `.md` and `.txt` files can be edited on a dedicated page with source mode, guarded WYSIWYG, safe `.txt -> .md` upgrades, image embeds, and line-anchored document references.

**Architecture:** Keep Markdown text as the only persisted truth. The remaining work is split into four layers: helper contracts that enforce the final path/anchor/round-trip rules, an editor data layer that owns save state and attachment persistence, a route-level source-mode shell for loading and reference workflows, and a Lexical WYSIWYG surface that only admits documents it can round-trip safely. Existing settings, note-creation, persistence, and route-entry foundations are already in place and must be reused.

**Tech Stack:** React 19, React Router, Lexical, CodeMirror 6, TypeScript, LiveStore, `@memora/fs`, Vite+ test/lint/build commands.

---

## Current Status

Already completed and verified:

- editor settings schema/defaults plus `Settings > General` UI
- shared editable-text predicate and route helpers
- logical path helpers and reference helpers
- path uniqueness policy helpers and mutation-site wiring
- note creation and text-document persistence foundations
- dashboard/sidebar/library/search routing for editable text files
- dashboard `New note` creation flow
- DOM-capable editor test harness

Do not rebuild those foundations. Remaining work should extend them where the final spec now demands stricter behavior.

All commands below assume `cwd=/Users/maxtune/workspace/personal/memora/packages/web`.

## Reference Inputs

- Spec: `docs/superpowers/specs/2026-05-07-markdown-document-editor-design.md`
- Existing editor foundations: `src/lib/editor/*`
- Existing settings consumption: `src/hooks/settings/useDocumentEditorSettings.ts`
- Existing OPFS save flow: `src/lib/library/fileStorage.ts`
- Existing LiveStore events: `src/livestore/file.ts`, `src/livestore/folder.ts`
- Existing route wiring: `src/components/dashboard/DashboardPage.tsx`, `src/components/desktop/DesktopPreviewWindow.tsx`, `src/app/components/Sidebar.tsx`, `src/components/library/FilesPage.tsx`, `src/lib/search/searchItems.ts`

## File Structure

### Shared helper refinements

- `packages/web/src/lib/editor/editableTextDocument.ts`: editable-text predicates and logical extension helpers.
- `packages/web/src/lib/editor/logicalPaths.ts`: logical-name normalization, per-segment encoding, relative path generation, and relative-path resolution.
- `packages/web/src/lib/editor/referenceLinks.ts`: Markdown link building/parsing, line-anchor validation, and safe label/path escaping.
- `packages/web/src/lib/editor/documentPersistence.ts`: text load/save helpers, `.txt -> .md` upgrades, and lazy legacy-name backfill helpers.
- `packages/web/src/lib/editor/markdownRoundTripGuard.ts`: pure WYSIWYG-entry guard for newline normalization and lossy-round-trip detection.
- `packages/web/src/lib/editor/imageAttachments.ts`: attachment destination resolution, optional subfolder creation, image persistence, dedupe/path policy, and LiveStore event payload preparation.

### Editor data and route shell

- `packages/web/src/pages/editor/file/[id].tsx`: route export.
- `packages/web/src/hooks/editor/useDocumentEditorFile.ts`: file loading, dirty/save state, mode state, auto-save, manual save, first-open backfill, and upgrade actions.
- `packages/web/src/components/editor/DocumentEditorPage.tsx`: route-level loading, not-found/error states, store commits, and settings consumption.
- `packages/web/src/components/editor/MarkdownDocumentEditor.tsx`: top-level editor shell, mode switch, toolbar, save status, and shared CSS variable application.
- `packages/web/src/components/editor/SourceDocumentEditor.tsx`: line-numbered source editor wrapper, range selection, line highlight, and copy-reference actions.
- `packages/web/src/components/editor/TxtToMarkdownConfirmDialog.tsx`: `.txt` upgrade confirmation dialog.

### Lexical WYSIWYG

- `packages/web/src/components/editor/WysiwygDocumentEditor.tsx`: Lexical composer and Markdown round-trip surface.
- `packages/web/src/components/editor/lexical/ImageNode.tsx`: custom image node.
- `packages/web/src/components/editor/lexical/imageMarkdownTransformer.ts`: `![alt](path)` transformer and image-target encoding glue.

### Generated and existing files to update

- `packages/web/src/generated-routes.ts`
- `packages/web/src/components/editor/DocumentEditorPage.tsx`
- `packages/web/src/components/editor/MarkdownDocumentEditor.tsx`
- `packages/web/src/hooks/editor/useDocumentEditorFile.ts`

### Tests

- `packages/web/test/editor/logicalPaths.test.ts`
- `packages/web/test/editor/referenceLinks.test.ts`
- `packages/web/test/editor/documentPersistence.test.ts`
- `packages/web/test/editor/markdownRoundTripGuard.test.ts`
- `packages/web/test/editor/imageAttachments.test.ts`
- `packages/web/test/editor/useDocumentEditorFile.test.tsx`
- `packages/web/test/editor/SourceDocumentEditor.test.tsx`
- `packages/web/test/editor/DocumentEditorPage.test.tsx`
- `packages/web/test/editor/referenceOpen.test.tsx`
- `packages/web/test/editor/WysiwygDocumentEditor.test.tsx`

---

## Task 1: Finalize Helper Contracts and the WYSIWYG Round-Trip Guard

**Files:**

- Modify: `packages/web/src/lib/editor/editableTextDocument.ts`
- Modify: `packages/web/src/lib/editor/logicalPaths.ts`
- Modify: `packages/web/src/lib/editor/referenceLinks.ts`
- Modify: `packages/web/src/lib/editor/documentPersistence.ts`
- Create: `packages/web/src/lib/editor/markdownRoundTripGuard.ts`
- Test: `packages/web/test/editor/logicalPaths.test.ts`
- Test: `packages/web/test/editor/referenceLinks.test.ts`
- Test: `packages/web/test/editor/documentPersistence.test.ts`
- Test: `packages/web/test/editor/markdownRoundTripGuard.test.ts`

- [ ] **Step 1: Write the failing helper tests**

Add coverage for the remaining spec-level contracts:

```ts
test("encodes path segments safely for markdown links and image targets", () => {
  expect(buildRelativeWorkspacePath(fromFile, targetFile, folders)).toBe(
    "./notes/API%20%231%20%28draft%29.md",
  );
  expect(resolveRelativeWorkspacePath("./notes/API%20%231%20%28draft%29.md", scope)).toEqual(
    targetFile,
  );
});

test("rejects invalid or reversed anchors", () => {
  expect(parseLineAnchor("#L0")).toBeNull();
  expect(parseLineAnchor("#L18-L12")).toBeNull();
});

test("normalizes CRLF and ignores a single trailing newline when guarding WYSIWYG entry", () => {
  expect(canRoundTripMarkdown({ source, exported })).toEqual({ allowed: true });
});

test("flags lossy markdown rewrites even when the syntax looks broadly supported", () => {
  expect(canRoundTripMarkdown({ source, exported })).toEqual({ allowed: false, reason: "lossy" });
});

test("backs up a legacy editable-text name without changing storagePath", async () => {
  const result = await backfillEditableTextDocumentName(input);
  expect(result.file.name).toBe("Draft.md");
  expect(result.file.storagePath).toBe(input.file.storagePath);
});
```

- [ ] **Step 2: Run the focused helper tests to verify they fail**

Run:

```bash
vp test test/editor/logicalPaths.test.ts test/editor/referenceLinks.test.ts test/editor/documentPersistence.test.ts test/editor/markdownRoundTripGuard.test.ts
```

Expected: FAIL because the encoding, anchor, backfill, and round-trip guard contracts are not fully implemented yet.

- [ ] **Step 3: Implement the helper refinements**

Implement:

- per-segment percent-encoding and decode-on-resolve behavior, including explicit
  encoding for `(` and `)`
- safe label escaping for `\`, `[` and `]`
- invalid-anchor rejection for non-positive and reversed ranges
- lazy metadata-only logical-name backfill for editable text docs without visible `.md` / `.txt`
- pure round-trip guard logic that normalizes line endings, tolerates one trailing newline, and rejects any other lossy delta

Keep these modules pure and testable. Do not bury the spec contract inside page components.

- [ ] **Step 4: Re-run the helper tests**

Run:

```bash
vp test test/editor/logicalPaths.test.ts test/editor/referenceLinks.test.ts test/editor/documentPersistence.test.ts test/editor/markdownRoundTripGuard.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/editor/editableTextDocument.ts src/lib/editor/logicalPaths.ts src/lib/editor/referenceLinks.ts src/lib/editor/documentPersistence.ts src/lib/editor/markdownRoundTripGuard.ts test/editor/logicalPaths.test.ts test/editor/referenceLinks.test.ts test/editor/documentPersistence.test.ts test/editor/markdownRoundTripGuard.test.ts
git commit -m "feat(editor): finalize helper contracts and round-trip guard"
```

---

## Task 2: Implement the Editor Data Layer, Save Pipeline, and Attachment Workflow

**Files:**

- Create: `packages/web/src/hooks/editor/useDocumentEditorFile.ts`
- Create: `packages/web/src/lib/editor/imageAttachments.ts`
- Test: `packages/web/test/editor/useDocumentEditorFile.test.tsx`
- Test: `packages/web/test/editor/imageAttachments.test.ts`

- [ ] **Step 1: Write the failing state and attachment tests**

Add coverage for the behavior that can silently drift out of sync with LiveStore:

```tsx
test("auto-save and Cmd/Ctrl+S use the same persistence path and commit fileUpdated", async () => {
  renderHook(() => useDocumentEditorFile(...));
  await act(async () => updateText("draft"));
  expect(store.commit).toHaveBeenCalledWith(fileEvents.fileUpdated(expect.anything()));
});

test("confirming txt upgrade commits the markdown rename while cancelling leaves metadata unchanged", async () => {
  renderHook(() => useDocumentEditorFile(...));
  expect(confirmUpgrade).toChangeMetadata();
  expect(cancelUpgrade).not.toChangeMetadata();
});
```

Add attachment coverage:

```ts
test("resolves all four attachment placement modes with missing-folder fallback", async () => {
  expect(await saveImageAttachment(input)).toMatchObject({
    markdownPath: "./images/diagram%20%281%29.png",
  });
});

test("creates the current-subfolder on demand and returns folderCreated + fileCreated events", async () => {
  expect(result.createdFolderEvent).toBeDefined();
  expect(result.createdFileEvent).toBeDefined();
  expect(store.commit).toHaveBeenCalledWith(folderEvents.folderCreated(expect.anything()));
  expect(store.commit).toHaveBeenCalledWith(fileEvents.fileCreated(expect.anything()));
});
```

- [ ] **Step 2: Run the focused state and attachment tests to verify they fail**

Run:

```bash
vp test test/editor/useDocumentEditorFile.test.tsx test/editor/imageAttachments.test.ts
```

Expected: FAIL because the hook and attachment helper do not exist yet.

- [ ] **Step 3: Implement the editor data hook**

Implement `useDocumentEditorFile.ts` so it owns:

- file loading and first-open logical-name backfill
- dirty tracking vs last successful save
- debounced auto-save
- `Cmd/Ctrl+S` manual save
- flush of pending saves before mode switches and route leave when possible
- shared persistence path for normal saves and `.txt -> .md` upgrades
- `store.commit(fileEvents.fileUpdated(...))` after every successful save/backfill/upgrade
- upgrade confirmation state that the page can render through a modal

- [ ] **Step 4: Implement the attachment helper**

Implement `imageAttachments.ts` so it handles:

- `root`, `fixed-folder`, `current-folder`, and `current-subfolder` placement modes
- missing-folder fallback to desktop root
- automatic `current-subfolder` creation with `folderCreated`
- image-name dedupe and path policy enforcement
- OPFS image save plus `fileCreated` payload generation
- `store.commit(folderEvents.folderCreated(...))` and
  `store.commit(fileEvents.fileCreated(...))` after successful attachment saves
- failure behavior that prevents broken Markdown insertion

- [ ] **Step 5: Re-run the state and attachment tests**

Run:

```bash
vp test test/editor/useDocumentEditorFile.test.tsx test/editor/imageAttachments.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/editor/useDocumentEditorFile.ts src/lib/editor/imageAttachments.ts test/editor/useDocumentEditorFile.test.tsx test/editor/imageAttachments.test.ts
git commit -m "feat(editor): add editor data and attachment workflows"
```

---

## Task 3: Build the Route Page and Source-Mode Reference Workflow

**Files:**

- Create: `packages/web/src/pages/editor/file/[id].tsx`
- Create: `packages/web/src/components/editor/DocumentEditorPage.tsx`
- Create: `packages/web/src/components/editor/MarkdownDocumentEditor.tsx`
- Create: `packages/web/src/components/editor/SourceDocumentEditor.tsx`
- Create: `packages/web/src/components/editor/TxtToMarkdownConfirmDialog.tsx`
- Modify: `packages/web/src/generated-routes.ts`
- Test: `packages/web/test/editor/SourceDocumentEditor.test.tsx`
- Test: `packages/web/test/editor/DocumentEditorPage.test.tsx`
- Test: `packages/web/test/editor/referenceOpen.test.tsx`

- [ ] **Step 1: Write the failing page and source-mode tests**

Add route-shell coverage:

```tsx
test("loads markdown files into WYSIWYG when the guard passes and source mode when it fails", async () => {
  render(<DocumentEditorPage ... />);
});

test("shows confirmation before allowing txt to enter WYSIWYG", async () => {
  render(<DocumentEditorPage ... />);
  await user.click(screen.getByRole("button", { name: /wysiwyg/i }));
  expect(screen.getByText(/reformatted as markdown/i)).toBeInTheDocument();
});
```

Add source-mode reference coverage:

```tsx
test("copies a range reference from the current selection", async () => {
  render(<SourceDocumentEditor ... />);
  await user.click(screen.getByRole("button", { name: /copy reference/i }));
  expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
    "[Parser notes](../notes/parser.md#L12-L18)",
  );
});

test("falls back to cursor line or #L1 when no explicit range is selected", async () => {
  render(<SourceDocumentEditor ... />);
});
```

Add reference-open coverage:

```tsx
test("opens line-anchored references in source mode and highlights the requested range", async () => {
  render(<DocumentEditorPage initialReferenceTarget="../notes/parser.md#L12-L18" ... />);
});

test("treats invalid anchors as unanchored references and shows unresolved/conflict notices when needed", async () => {
  render(<DocumentEditorPage initialReferenceTarget="../notes/parser.md#L18-L12" ... />);
});
```

- [ ] **Step 2: Run the focused page and source-mode tests to verify they fail**

Run:

```bash
vp test test/editor/SourceDocumentEditor.test.tsx test/editor/DocumentEditorPage.test.tsx test/editor/referenceOpen.test.tsx
```

Expected: FAIL because the page and source editor do not exist yet.

- [ ] **Step 3: Implement the route shell and source editor**

Implement:

- the `/editor/file/:id` route export
- route-level loading, not-found/error states, and retry/back navigation
- settings consumption from `useDocumentEditorSettings`
- shared font-size CSS variable application from `editorFontSizePx`
- source-mode range selection, highlight, and copy-reference actions
- line-anchor handling for invalid anchors, out-of-range starts, and end-line clamping
- clear unresolved and ambiguous reference notices
- the `.txt` upgrade confirmation dialog wired to the hook

- [ ] **Step 4: Regenerate route output**

Run:

```bash
vp build
```

Expected outcome: `src/generated-routes.ts` includes `/editor/file/:id` and the new page compiles.

- [ ] **Step 5: Re-run the focused page and source-mode tests**

Run:

```bash
vp test test/editor/SourceDocumentEditor.test.tsx test/editor/DocumentEditorPage.test.tsx test/editor/referenceOpen.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/pages/editor/file/[id].tsx src/components/editor/DocumentEditorPage.tsx src/components/editor/MarkdownDocumentEditor.tsx src/components/editor/SourceDocumentEditor.tsx src/components/editor/TxtToMarkdownConfirmDialog.tsx src/generated-routes.ts test/editor/SourceDocumentEditor.test.tsx test/editor/DocumentEditorPage.test.tsx test/editor/referenceOpen.test.tsx
git commit -m "feat(editor): add route page and source reference workflow"
```

---

## Task 4: Add Lexical WYSIWYG and Integrate Image Embeds

**Files:**

- Create: `packages/web/src/components/editor/WysiwygDocumentEditor.tsx`
- Create: `packages/web/src/components/editor/lexical/ImageNode.tsx`
- Create: `packages/web/src/components/editor/lexical/imageMarkdownTransformer.ts`
- Modify: `packages/web/src/components/editor/MarkdownDocumentEditor.tsx`
- Modify: `packages/web/src/components/editor/DocumentEditorPage.tsx`
- Modify: `packages/web/src/hooks/editor/useDocumentEditorFile.ts`
- Test: `packages/web/test/editor/WysiwygDocumentEditor.test.tsx`
- Test: `packages/web/test/editor/DocumentEditorPage.test.tsx`

- [ ] **Step 1: Write the failing WYSIWYG tests**

Add coverage for the approved Markdown subset plus attachment integration:

```tsx
test("round-trips headings, lists, tables, links, code blocks, and images through Lexical", async () => {
  render(<WysiwygDocumentEditor value={markdown} ... />);
  expect(onChange).toHaveBeenCalledWith(expect.stringContaining("| Name | Value |"));
});

test("blocks lossy round-trips while allowing CRLF normalization and one trailing newline", async () => {
  render(<DocumentEditorPage ... />);
});

test("inserts a saved image using the attachment helper and encoded relative markdown path", async () => {
  render(<MarkdownDocumentEditor ... />);
  await user.click(screen.getByRole("button", { name: /insert image/i }));
});
```

- [ ] **Step 2: Run the focused WYSIWYG tests to verify they fail**

Run:

```bash
vp test test/editor/WysiwygDocumentEditor.test.tsx test/editor/DocumentEditorPage.test.tsx
```

Expected: FAIL because the Lexical surface and image integration do not exist yet.

- [ ] **Step 3: Implement the WYSIWYG surface**

Implement:

- `LexicalComposer`, `RichTextPlugin`, `HistoryPlugin`, `OnChangePlugin`, and `MarkdownShortcutPlugin`
- Markdown import/export using the approved transformer set
- custom image node and Markdown transformer
- guard-aware WYSIWYG entry so unsupported or lossy Markdown stays in source mode
- image insertion wired through `imageAttachments.ts`
- shared font-size application so WYSIWYG prose uses the same base size as source mode

- [ ] **Step 4: Re-run the focused WYSIWYG tests**

Run:

```bash
vp test test/editor/WysiwygDocumentEditor.test.tsx test/editor/DocumentEditorPage.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/editor/WysiwygDocumentEditor.tsx src/components/editor/lexical/ImageNode.tsx src/components/editor/lexical/imageMarkdownTransformer.ts src/components/editor/MarkdownDocumentEditor.tsx src/components/editor/DocumentEditorPage.tsx src/hooks/editor/useDocumentEditorFile.ts test/editor/WysiwygDocumentEditor.test.tsx test/editor/DocumentEditorPage.test.tsx
git commit -m "feat(editor): add lexical wysiwyg and image embeds"
```

---

## Task 5: Final Integration Verification

**Files:**

- No new feature files; verify the integrated editor stack

- [ ] **Step 1: Run the full editor-focused suite**

Run:

```bash
vp test test/editor/documentEditorSettings.test.ts test/editor/logicalPaths.test.ts test/editor/referenceLinks.test.ts test/editor/documentPersistence.test.ts test/editor/markdownRoundTripGuard.test.ts test/editor/pathMutations.test.ts test/editor/noteCreation.test.ts test/editor/imageAttachments.test.ts test/editor/useDocumentEditorFile.test.tsx test/editor/SourceDocumentEditor.test.tsx test/editor/DocumentEditorPage.test.tsx test/editor/referenceOpen.test.tsx test/editor/WysiwygDocumentEditor.test.tsx test/editor/editableTextRouting.test.tsx
```

Expected: PASS with zero failing editor tests.

- [ ] **Step 2: Run targeted lint**

Run:

```bash
vp lint src/components/editor src/hooks/editor src/pages/editor src/lib/editor src/components/settings/SettingsGeneralSection.tsx src/hooks/settings/useDocumentEditorSettings.ts src/components/dashboard/DashboardPage.tsx src/components/desktop/DesktopPreviewWindow.tsx src/app/components/Sidebar.tsx src/components/library/FilesPage.tsx src/lib/search/searchItems.ts src/livestore/setting.ts src/lib/settings/storageExport.ts test/editor
```

Expected: PASS for the touched editor-related files.

- [ ] **Step 3: Run a final build**

Run:

```bash
vp build
```

Expected: PASS and keep generated routes current.

- [ ] **Step 4: Commit**

```bash
git add src/components/editor src/hooks/editor src/pages/editor src/lib/editor src/generated-routes.ts src/components/settings/SettingsGeneralSection.tsx src/hooks/settings/useDocumentEditorSettings.ts src/components/dashboard/DashboardPage.tsx src/components/desktop/DesktopPreviewWindow.tsx src/app/components/Sidebar.tsx src/components/library/FilesPage.tsx src/lib/search/searchItems.ts src/livestore/setting.ts src/lib/settings/storageExport.ts test/editor
git commit -m "feat(editor): ship markdown document editing workflow"
```
