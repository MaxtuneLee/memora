# Document Actions Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Replace the editor's minimal Actions menu with a compact Memora-styled document menu supporting file actions, global reading preferences, and document metadata.

**Architecture:** Keep deterministic document logic in a new editor helper module, persist reading preferences through the existing LiveStore settings document, and isolate menu presentation in DocumentActionsMenu. DocumentEditorPage coordinates saves, OPFS writes, LiveStore events, navigation, clipboard access, and browser downloads; MarkdownDocumentEditor remains focused on the editing surface.

**Tech Stack:** React 19, TypeScript, Vite+, LiveStore, OPFS via @memora/fs, Tailwind CSS v4, Phosphor Icons, Base UI Toast provider, existing AppMenu and NativeDialog components.

---

## Working-tree constraint

The current editor implementation exists in uncommitted workspace files on the existing
codex/markdown-document-editor branch. A new worktree would omit that state. Execute in the current
workspace, inspect git status before every commit, and stage only the exact files listed for the task.
Do not include unrelated existing changes.

## File map

- Create packages/web/src/lib/editor/documentActions.ts
  - Unicode-aware word counting, canonical editor link construction, duplicate-name policy,
    OPFS-backed duplicate creation, and export payload creation.
- Create packages/web/test/editor/documentActions.test.ts
  - Direct tests for deterministic action helpers and mocked OPFS creation.
- Modify packages/web/src/livestore/setting.ts
  - Add normalized global Small text and Full width settings.
- Modify packages/web/src/hooks/settings/useDocumentEditorSettings.ts
  - Expose typed switch handlers.
- Modify packages/web/src/lib/settings/storageExport.ts
  - Preserve the new settings through backup import/export.
- Modify packages/web/test/editor/documentEditorSettings.test.ts
  - Cover defaults, legacy settings, and explicit preference preservation.
- Create packages/web/src/components/editor/DocumentActionsMenu.tsx
  - Render grouped actions, persistent switches, move picker, confirmation dialog, metadata, and
    accessible busy/error feedback.
- Create packages/web/test/editor/DocumentActionsMenu.test.tsx
  - Exercise menu content, switches, metadata, move picker, async failures, and trash confirmation.
- Modify packages/web/src/components/editor/MarkdownDocumentEditor.tsx
  - Replace the existing menu and remove Attach image / Insert table menu wiring.
- Modify packages/web/src/components/editor/DocumentEditorPage.tsx
  - Apply global layout preferences and coordinate duplicate, move, export, trash, copy-link, and
    settings callbacks.
- Modify packages/web/src/hooks/editor/useDocumentEditorFile.ts
  - Route logical parent changes through the serialized persistence queue and update active metadata.
- Modify packages/web/test/editor/useDocumentEditorFile.test.tsx
  - Prove moves update OPFS metadata, active state, and subsequent saves without stale parents.
- Modify packages/web/test/editor/DocumentEditorPage.test.tsx
  - Verify integration order, LiveStore-facing callbacks, navigation, download behavior, and layout.
- Modify packages/web/src/components/dashboard/dashboardMenu.css only if viewport inspection proves
  the existing panel clipping cannot contain the approved scrollable menu. Prefer component-level
  Tailwind classes first.

### Task 1: Deterministic document action helpers

**Files:**

- Create: packages/web/src/lib/editor/documentActions.ts
- Create: packages/web/test/editor/documentActions.test.ts
- Reference: packages/web/src/lib/editor/logicalPaths.ts
- Reference: packages/web/src/lib/editor/editableTextDocument.ts
- Reference: packages/web/src/lib/library/fileStorage.ts

- [ ] **Step 1: Write failing word-count tests**

Add tests for empty input, Han, Hiragana, Katakana, Hangul, compatibility ideographs, Latin words,
digits, punctuation-only text, and mixed Markdown. The expected contract is:

    expect(countDocumentWords("")).toBe(0);
    expect(countDocumentWords("# 学习 notes 2026\nかな カナ 한글")).toBe(10);
    expect(countDocumentWords("，。 **__**")).toBe(0);

Import from the not-yet-created documentActions module.

- [ ] **Step 2: Run the word-count test and verify RED**

Run from packages/web:

    vp test run test/editor/documentActions.test.ts

Expected: FAIL because documentActions.ts or countDocumentWords does not exist.

- [ ] **Step 3: Implement the minimal Unicode tokenizer**

Use one Unicode property regex and count matches:

    const DOCUMENT_WORD_PATTERN =
      /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]|[\p{Script=Latin}\p{Nd}]+/gu;

    export const countDocumentWords = (text: string): number =>
      Array.from(text.matchAll(DOCUMENT_WORD_PATTERN)).length;

Do not add a Markdown parser; punctuation naturally does not match.

- [ ] **Step 4: Run the word-count test and verify GREEN**

Run the same focused test. Expected: the word-count cases PASS.

- [ ] **Step 5: Write failing duplicate-name tests**

Cover these exact transitions in the same parent folder:

    Draft.md -> Draft copy.md
    Draft.md + existing Draft copy.md -> Draft copy 2.md
    Draft copy.md -> Draft copy 2.md
    Draft copy 2.md -> Draft copy 3.md
    Draft copy 2.md + existing Draft copy 3.md -> Draft copy 4.md
    Notes.txt -> Notes copy.txt

Also verify identical names in another parent do not conflict.

- [ ] **Step 6: Run the naming test and verify RED**

Run the focused test. Expected: FAIL because buildDuplicateDocumentName is missing.

- [ ] **Step 7: Implement extension-preserving copy naming**

Use getFileExtension and findSiblingFileNameConflict. Parse a trailing case-insensitive
" copy" or " copy N" suffix from the stem. Unsuffixed sources start at "copy"; suffixed sources
continue at the next integer. Check active files in the same parent and increment until free.

Export:

    export const buildDuplicateDocumentName = (
      file: Pick<TextDocumentFileLike, "id" | "name" | "parentId">,
      files: readonly Pick<TextDocumentFileLike, "id" | "name" | "parentId">[],
    ): string => {
      const extension = getFileExtension(file.name);
      const stem = extension ? file.name.slice(0, -extension.length) : file.name;
      const copyMatch = stem.match(/^(.*) copy(?: (\d+))?$/i);
      const baseStem = copyMatch?.[1] || stem || "Untitled";
      let copyNumber = copyMatch ? Number(copyMatch[2] ?? "1") + 1 : 1;

      while (true) {
        const suffix = copyNumber === 1 ? " copy" : ` copy ${copyNumber}`;
        const candidate = `${baseStem}${suffix}${extension}`;
        const conflict = findSiblingFileNameConflict(files, {
          name: candidate,
          parentId: file.parentId ?? null,
        });
        if (!conflict) {
          return candidate;
        }
        copyNumber += 1;
      }
    };

- [ ] **Step 8: Run the naming test and verify GREEN**

Expected: all naming cases PASS.

- [ ] **Step 9: Write failing duplicate and export payload tests**

Mock saveFileToOpfs. Verify duplicateTextDocument:

- receives latest text as a Blob
- preserves MIME type, extension, and parentId
- stores as document / opfs
- returns a fileCreated-compatible event and new file id

Verify createTextDocumentExport returns the current filename and a Blob whose type and text match.

- [ ] **Step 10: Run the helper test and verify RED**

Expected: FAIL because persistence helpers are missing.

- [ ] **Step 11: Implement minimal duplicate and export helpers**

Define focused types and use saveFileToOpfs:

    export interface DuplicateTextDocumentResult {
      id: string;
      file: FileMeta;
      createdEvent: {
        id: string;
        name: string;
        type: "document";
        mimeType: string;
        sizeBytes: number;
        storageType: FileMeta["storageType"];
        storagePath: string;
        parentId: string | null;
        positionX: number | null;
        positionY: number | null;
        createdAt: Date;
      };
    }

    export interface DuplicateTextDocumentInput {
      file: TextDocumentFileLike;
      text: string;
      files: readonly TextDocumentFileLike[];
    }

    export const duplicateTextDocument = async ({
      file,
      text,
      files,
    }: DuplicateTextDocumentInput): Promise<DuplicateTextDocumentResult> => {
      const name = buildDuplicateDocumentName(file, files);
      const result = await saveFileToOpfs({
        blob: new Blob([text], { type: file.mimeType }),
        name,
        type: "document",
        mimeType: file.mimeType,
        storageType: "opfs",
        parentId: file.parentId ?? null,
        positionX: null,
        positionY: null,
      });
      return {
        id: result.id,
        file: result.meta,
        createdEvent: {
          id: result.meta.id,
          name: result.meta.name,
          type: "document",
          mimeType: result.meta.mimeType,
          sizeBytes: result.meta.sizeBytes,
          storageType: result.meta.storageType,
          storagePath: result.meta.storagePath,
          parentId: result.meta.parentId ?? null,
          positionX: result.meta.positionX ?? null,
          positionY: result.meta.positionY ?? null,
          createdAt: new Date(result.meta.createdAt),
        },
      };
    };

    export const createTextDocumentExport = (
      file: Pick<TextDocumentFileLike, "name" | "mimeType">,
      text: string,
    ) => ({
      fileName: file.name,
      blob: new Blob([text], { type: file.mimeType || "text/plain" }),
    });

    export const buildDocumentEditorUrl = (fileId: string, origin: string): string =>
      new URL(getDocumentEditorHref(fileId), origin).href;

Also export buildDocumentEditorUrl(fileId, origin) using getDocumentEditorHref so copied links never
include transient query parameters.

- [ ] **Step 12: Run all helper tests**

Run:

    vp test run test/editor/documentActions.test.ts

Expected: PASS with no warnings.

- [ ] **Step 13: Commit Task 1 files**

Stage only the two Task 1 files and commit:

    git add packages/web/src/lib/editor/documentActions.ts packages/web/test/editor/documentActions.test.ts
    git commit -m "feat(editor): add document action helpers"

### Task 2: Persist global reading preferences

**Files:**

- Modify: packages/web/src/livestore/setting.ts
- Modify: packages/web/src/hooks/settings/useDocumentEditorSettings.ts
- Modify: packages/web/src/lib/settings/storageExport.ts
- Modify: packages/web/test/editor/documentEditorSettings.test.ts

- [ ] **Step 1: Write failing settings tests**

Extend documentEditorSettings.test.ts to expect:

    editorSmallText: false
    editorFullWidth: false

in default settings, normalized legacy settings, and normalized imported settings. Add an explicit
case proving true values survive normalization and backup import.

- [ ] **Step 2: Run the settings test and verify RED**

Run from packages/web:

    vp test run test/editor/documentEditorSettings.test.ts

Expected: FAIL because the fields do not exist.

- [ ] **Step 3: Add settings schema and defaults**

In setting.ts add both required fields to the setting interface and defaultSettings. Add them as
optional booleans in settingsStoredValueSchema so old stored values remain decodable:

    editorSmallText: boolean;
    editorFullWidth: boolean;

    editorSmallText: false,
    editorFullWidth: false,

    editorSmallText: Schema.optional(Schema.Boolean),
    editorFullWidth: Schema.optional(Schema.Boolean),

- [ ] **Step 4: Preserve settings in storage backup import**

Add both booleans to SettingsValue and normalizeImportedSettings:

    ...(typeof record.editorSmallText === "boolean"
      ? { editorSmallText: record.editorSmallText }
      : {}),
    ...(typeof record.editorFullWidth === "boolean"
      ? { editorFullWidth: record.editorFullWidth }
      : {}),

- [ ] **Step 5: Add typed hook handlers**

In useDocumentEditorSettings.ts add:

    const handleEditorSmallTextChange = useCallback(
      (enabled: boolean) => updateSettings({ editorSmallText: enabled }),
      [updateSettings],
    );

    const handleEditorFullWidthChange = useCallback(
      (enabled: boolean) => updateSettings({ editorFullWidth: enabled }),
      [updateSettings],
    );

Return both handlers without changing the existing numeric font-size behavior.

- [ ] **Step 6: Run settings tests and verify GREEN**

Run:

    vp test run test/editor/documentEditorSettings.test.ts test/settings/storageExport.test.ts

Expected: PASS.

- [ ] **Step 7: Commit Task 2 files**

Stage only the four Task 2 files and commit:

    git add packages/web/src/livestore/setting.ts packages/web/src/hooks/settings/useDocumentEditorSettings.ts packages/web/src/lib/settings/storageExport.ts packages/web/test/editor/documentEditorSettings.test.ts
    git commit -m "feat(editor): persist document reading preferences"

### Task 3: Build the grouped DocumentActionsMenu

**Files:**

- Create: packages/web/src/components/editor/DocumentActionsMenu.tsx
- Create: packages/web/test/editor/DocumentActionsMenu.test.tsx
- Reference: packages/web/src/components/menu/AppMenu.tsx
- Reference: packages/web/src/components/ui/NativeDialog.tsx
- Reference: packages/web/src/components/settings/SettingsDialog.tsx

- [ ] **Step 1: Create test DOM helpers and write a failing menu-structure test**

In DocumentActionsMenu.test.tsx create JSDOM and polyfill ResizeObserver, showPopover, hidePopover,
matches(":popover-open"), showModal, and close. Wrap the component in Base UI Toast.Provider.

Render a representative document and assert menu items exist in this order:

    Save
    Copy link
    Duplicate
    Move to
    Small text
    Full width
    Export
    Move to trash

Assert Attach image and Insert table are absent. Assert Word count, Created, and Last edited render.

- [ ] **Step 2: Run the component test and verify RED**

Run:

    vp test run test/editor/DocumentActionsMenu.test.tsx

Expected: FAIL because DocumentActionsMenu does not exist.

- [ ] **Step 3: Implement the component shell and compact visual primitives**

Create typed props:

    interface DocumentActionsMenuProps {
      file: TextDocumentFileLike;
      text: string;
      folders: readonly WorkspaceFolderLike[];
      saveState: "idle" | "dirty" | "saving" | "error";
      smallText: boolean;
      fullWidth: boolean;
      onSave: () => Promise<void>;
      onCopyLink: () => Promise<void>;
      onDuplicate: () => Promise<void>;
      onMove: (parentId: string | null) => Promise<void>;
      onSmallTextChange: (enabled: boolean) => void;
      onFullWidthChange: (enabled: boolean) => void;
      onExport: () => Promise<void>;
      onMoveToTrash: () => Promise<void>;
    }

Build local CompactMenuItem, MenuSwitchItem, MenuSeparator, and MetadataRow helpers using semantic
Memora tokens. Use AppMenuItem for actions that should close. For Move to and switch rows call
event.preventDefault() so the existing AppMenu does not close. Use role=menuitemcheckbox and
aria-checked on switches.

Use countDocumentWords and Intl.DateTimeFormat. Give the scrollable panel a 272 px width and a max
height based on 100dvh.

- [ ] **Step 4: Run the structure test and verify GREEN**

Expected: structure and omission assertions PASS.

- [ ] **Step 5: Write failing interaction tests**

Add independent tests that verify:

- Small text calls onSmallTextChange(true), keeps aria-expanded=true, and exposes aria-checked.
- Full width behaves the same.
- Move to switches to a destination picker with Back, Desktop root, breadcrumb labels, and the current
  destination disabled/marked.
- Back restores the main action list.
- Changing text updates Word count.
- Rejected copy, duplicate, move, export, and trash promises surface concise role=status content.
- Copy and export success announce completion.
- Move to trash first opens a NativeDialog; Cancel does not call the destructive callback; Confirm
  calls it once.
- Busy actions disable conflicting rows and update their accessible label.

- [ ] **Step 6: Run interaction tests and verify RED**

Expected: FAIL on the first missing interaction behavior, not on test setup.

- [ ] **Step 7: Implement menu state, async guards, picker, and dialog**

Use:

    type PendingAction = "save" | "copy" | "duplicate" | "move" | "export" | "trash" | null;

Keep a single pending action, a "main" | "move" view, trash dialog state, and an aria-live message.
Wrap promise callbacks in one runAction helper that prevents duplicate calls, maps errors to safe
messages, and returns to the correct menu state. Add Base UI toast notifications for copy/export
success and async failures; rely on the app's existing ToastStack.

Use buildFolderBreadcrumbs to label active folder destinations and keep the current parent disabled.
Use the existing NativeDialog directly with Memora semantic tokens for the destructive confirmation.

- [ ] **Step 8: Run component tests and verify GREEN**

Run:

    vp test run test/editor/DocumentActionsMenu.test.tsx

Expected: PASS without act warnings or console errors.

- [ ] **Step 9: Commit Task 3 files**

Stage only the component and test:

    git add packages/web/src/components/editor/DocumentActionsMenu.tsx packages/web/test/editor/DocumentActionsMenu.test.tsx
    git commit -m "feat(editor): add grouped document actions menu"

### Task 4: Wire actions and reading preferences into the editor page

**Files:**

- Modify: packages/web/src/components/editor/MarkdownDocumentEditor.tsx
- Modify: packages/web/src/components/editor/DocumentEditorPage.tsx
- Modify: packages/web/src/hooks/editor/useDocumentEditorFile.ts
- Modify: packages/web/src/lib/editor/documentPersistence.ts
- Modify: packages/web/test/editor/useDocumentEditorFile.test.tsx
- Modify: packages/web/test/editor/DocumentEditorPage.test.tsx

- [ ] **Step 1: Write failing page layout and menu replacement tests**

Extend DocumentEditorPage.test.tsx. Add optional props with safe defaults so existing cases need no
bulk edits. Assert:

- editorSmallText=true sets --document-editor-font-size to 14px.
- editorSmallText=false uses editorFontSizePx.
- editorFullWidth=false keeps the max-w-[58rem] container.
- editorFullWidth=true uses the full-width container class/data attribute.
- The editor renders the new menu and no Attach image or Insert table entries.

Expected new props:

    editorSmallText?: boolean;
    editorFullWidth?: boolean;
    onEditorSmallTextChange?: (enabled: boolean) => void;
    onEditorFullWidthChange?: (enabled: boolean) => void;

- [ ] **Step 2: Run focused page tests and verify RED**

Run:

    vp test run test/editor/DocumentEditorPage.test.tsx -t "document actions|reading preference"

Expected: FAIL because layout preferences and the new menu are not wired.

- [ ] **Step 3: Apply layout preferences and replace the old menu**

In DocumentEditorPage, resolve the font variable as:

    "--document-editor-font-size": String(editorSmallText ? 14 : editorFontSizePx) + "px"

Pass editorFullWidth to DocumentEditorSession and choose between max-w-[58rem] and max-w-none with
cn. Forward switch values and callbacks.

In MarkdownDocumentEditor:

- render DocumentActionsMenu in the current header position
- remove Attach image and Insert table menu rows
- remove fileInputRef, onAttachImage, isAttachingImage, WysiwygDocumentEditorHandle, and wysiwygRef
  wiring that becomes unused
- keep Save behavior and its source-editor mouse-down focus guarantee

- [ ] **Step 4: Run page layout tests and verify GREEN**

Expected: the new targeted layout/menu tests PASS and the existing save-focus test remains green.

- [ ] **Step 5: Write failing integration tests for each async action**

Use hoisted mocks for documentActions helpers and browser APIs. Add separate tests:

1. Copy link receives an absolute canonical editor route without reference query parameters.
2. Duplicate calls flushPendingSave before duplicateTextDocument, forwards the created event, then
   navigates to /editor/file/:newId. If save fails, duplicate is not called.
3. Move uses the editor persistence queue to save current text and the new parent together. After
   success, the active file, OPFS metadata, Last edited value, and LiveStore-facing updated event all
   contain the new parent and timestamp. If saving fails, the parent does not change.
4. Export flushes before createTextDocumentExport, clicks a temporary anchor, and revokes the object
   URL. If save fails, no download begins.
5. Trash requires confirmation, flushes before the delete callback, and navigates only after success.
   If in-app history is unavailable, the route callback targets /desktop.
6. Small text and Full width callbacks commit only their respective global settings patches.

Do not combine these into one broad test; each should fail for one missing behavior.

- [ ] **Step 6: Run integration tests and verify RED**

Run each new test name with -t while implementing. Confirm each fails because its action is missing,
not because of a DOM polyfill or mock error.

- [ ] **Step 7: Write a failing hook test for metadata-preserving moves**

In useDocumentEditorFile.test.tsx, render the hook with a document in folder-a, edit its text, call
moveTo("folder-b"), and assert this order and state:

- saveTextDocument receives the latest text and a file whose parentId is folder-b
- onFileUpdated receives parentId folder-b and a fresh updatedAt
- result.current.file has parentId folder-b and the fresh updatedAt
- a later save and attachment/duplicate consumer reads folder-b, never folder-a
- a rejected save leaves result.current.file.parentId as folder-a

- [ ] **Step 8: Run the hook move test and verify RED**

Run:

    vp test run test/editor/useDocumentEditorFile.test.tsx -t "moves document metadata"

Expected: FAIL because moveTo and parentId propagation do not exist.

- [ ] **Step 9: Extend the serialized save intent with a parent update**

In documentPersistence.ts, include parentId in FileUpdatedEventInput and buildUpdatedEvent so the
same successful OPFS write produces a complete LiveStore event.

In useDocumentEditorFile.ts:

- add optional parentId to SaveIntent
- update redundant-save detection so a parent change is never skipped
- update doesIntentCover and pending-intent merging, treating null as a real root destination and
  undefined as "no parent change"
- pass a patched persisted file into saveTextDocument when parentId is present
- rely on the existing successful persistence path to update session.persistedFile,
  persistedFileRef, activeFileRef, setActiveFile, last-saved state, and onFileUpdated
- export moveTo(parentId), implemented through queuePersist rather than a second direct OPFS write

The key behavior is:

    const moveTo = useCallback(
      async (parentId: string | null): Promise<void> => {
        await queuePersist("save", { parentId });
      },
      [queuePersist],
    );

Refactor queuePersist to accept a typed options object so rename and move cannot confuse positional
arguments.

- [ ] **Step 10: Run the hook move test and verify GREEN**

Run:

    vp test run test/editor/useDocumentEditorFile.test.tsx -t "moves document metadata"

Expected: PASS, including rejected-save state preservation.

- [ ] **Step 11: Add action callback boundaries to DocumentEditorPage**

Add typed optional callbacks for file creation, soft deletion, setting updates, and post-delete
navigation. Logical movement continues through the existing onFileUpdated callback emitted by the
editor persistence hook. Implement session handlers:

    const handleDuplicate = async () => {
      await editorFile.flushPendingSave();
      const result = await duplicateTextDocument({
        file: editorFile.file,
        text: editorFile.text,
        files,
      });
      onFileCreated?.(result.createdEvent);
      onNavigateToHref?.(getDocumentEditorHref(result.id));
    };

    const handleMove = async (parentId: string | null) => {
      if (parentId && !folders.some((folder) => folder.id === parentId)) {
        throw new Error("That folder is no longer available.");
      }
      await editorFile.moveTo(parentId);
    };

Implement copy, export, and trash with the same save/error order from the spec. Use try/finally for
temporary anchors and URL revocation.

- [ ] **Step 12: Bind route callbacks to LiveStore and navigation**

In the route Component:

- commit fileEvents.fileCreated for duplicates
- keep the existing onFileUpdated binding; the queued move emits fileEvents.fileUpdated with id,
  parentId, full persisted metadata, and updatedAt
- commit fileEvents.fileDeleted for trash
- commit settingEvents.settingsSet for each global preference
- navigate to duplicate routes
- after trash, use browser history only when an in-app entry exists; otherwise navigate to /desktop

Destructure both setting handlers from useDocumentEditorSettings and pass normalized values into the
page.

- [ ] **Step 13: Add stale-parent integration regressions**

After a successful move, assert the menu's Last edited value changes and a subsequent Duplicate uses
the moved active file with parentId folder-b. This guards the internal hook synchronization that the
route-level event alone cannot provide.

- [ ] **Step 14: Run each action test and then the complete page test**

Run:

    vp test run test/editor/DocumentEditorPage.test.tsx

Expected: all existing and new page tests PASS without reload, focus, or autosave regressions.

- [ ] **Step 15: Run the editor regression group**

Run:

    vp test run test/editor/documentActions.test.ts test/editor/DocumentActionsMenu.test.tsx test/editor/DocumentEditorPage.test.tsx test/editor/useDocumentEditorFile.test.tsx test/editor/documentEditorSettings.test.ts

Expected: PASS.

- [ ] **Step 16: Commit Task 4 files**

Stage only the three integration files:

    git add packages/web/src/components/editor/MarkdownDocumentEditor.tsx packages/web/src/components/editor/DocumentEditorPage.tsx packages/web/src/hooks/editor/useDocumentEditorFile.ts packages/web/src/lib/editor/documentPersistence.ts packages/web/test/editor/useDocumentEditorFile.test.tsx packages/web/test/editor/DocumentEditorPage.test.tsx
    git commit -m "feat(editor): wire document menu actions"

### Task 5: Memora visual and accessibility refinement

**Files:**

- Modify: packages/web/src/components/editor/DocumentActionsMenu.tsx
- Modify: packages/web/test/editor/DocumentActionsMenu.test.tsx
- Modify only if required: packages/web/src/components/dashboard/dashboardMenu.css

- [ ] **Step 1: Invoke the required UI refinement skill**

Read and apply @polish together with the already selected @memora-web-design guidance. Focus on
alignment, density, responsive containment, light/dark parity, keyboard focus, and reduced motion.
Do not add decorative effects or new dependencies.

- [ ] **Step 2: Start the web development server**

Run from packages/web:

    vp dev --port 9001

Keep the process in an interactive session. Expected: the editor route loads without runtime errors.

- [ ] **Step 3: Inspect standard and constrained viewports**

Open an existing Markdown document and verify:

- trigger-to-panel morph remains anchored at the top right
- all four groups are visually distinct without card-like nesting
- rows align to a consistent icon, label, shortcut/switch grid
- metadata values do not collide or truncate ambiguously
- a short viewport scrolls inside the panel rather than off-screen
- the move picker handles long breadcrumb labels
- destructive color is reserved for Move to trash

- [ ] **Step 4: Inspect keyboard, motion, and theme behavior**

Verify arrow keys, Home/End, Enter/Space, Escape, dialog focus return, and disabled destinations.
Repeat with reduced motion and both light and dark themes. Use semantic tokens for any correction.

- [ ] **Step 5: Write a failing regression test for every correction that affects behavior**

Examples include max-height/scroll hooks, aria roles, long metadata text, focus restoration, or menu
open state. Purely visual token/spacing changes do not require brittle class snapshots.

- [ ] **Step 6: Apply the smallest visual corrections and rerun component tests**

Run:

    vp test run test/editor/DocumentActionsMenu.test.tsx test/editor/DocumentEditorPage.test.tsx

Expected: PASS.

- [ ] **Step 7: Commit Task 5 files**

Stage only files actually changed in this task and commit:

    git add packages/web/src/components/editor/DocumentActionsMenu.tsx packages/web/test/editor/DocumentActionsMenu.test.tsx
    git commit -m "style(editor): polish document actions menu"

If dashboardMenu.css was required, add that exact file to the command.

### Task 6: Full verification

**Files:**

- No planned production changes
- Update only the tests or implementation responsible for a discovered regression

- [ ] **Step 1: Invoke verification-before-completion**

Read and apply @superpowers:verification-before-completion before making any completion claim.

- [ ] **Step 2: Check formatting, lint, and TypeScript**

Run from packages/web:

    vp check .

Expected: exit 0. Do not use --fix until the diff is inspected; if formatting is required, run the
smallest scoped fix and re-check the affected files.

- [ ] **Step 3: Run the full web test suite**

Run from packages/web:

    vp test run test

Expected: all tests PASS with no unhandled errors.

- [ ] **Step 4: Build the web app**

Run from packages/web:

    vp build

Expected: TypeScript and Vite production build exit 0.

- [ ] **Step 5: Inspect final diff and working tree**

Run:

    git diff --check
    git status --short
    git diff --stat

Confirm no generated route file, dependency file, or unrelated user change was accidentally staged
or modified by this feature.

- [ ] **Step 6: Record verification evidence**

Report the exact commands and outcomes. If a pre-existing unrelated check fails, identify it
precisely and keep the feature status honest.

- [ ] **Step 7: Use finishing-a-development-branch**

Read and apply @superpowers:finishing-a-development-branch to present integration options after all
checks pass. Do not push or open a pull request without explicit user direction.
