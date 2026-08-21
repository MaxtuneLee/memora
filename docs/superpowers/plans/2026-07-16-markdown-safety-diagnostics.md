# Markdown Safety Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show exact Markdown source ranges and before/after explanations when WYSIWYG preflight blocks Preview.

**Architecture:** The round-trip guard produces immutable source diagnostics from original and exported Markdown. `DocumentEditorPage` owns only diagnostics from the current canonical snapshot and passes them through `MarkdownDocumentEditor` to a CodeMirror-backed `SourceDocumentEditor`, where CodeMirror state effects render warning ranges and focus the first issue.

**Tech Stack:** React 19, TypeScript, `@uiw/react-codemirror`, CodeMirror 6 state/view/Markdown extensions, Vite+ tests.

## Global Constraints

- The source document remains authoritative and diagnostics never rewrite it.
- No new runtime dependency; use the CodeMirror packages already installed.
- Preserve the existing `SourceDocumentEditor` component boundary, reference actions, controlled value, external line selection, read-only behavior, and imperative focus.
- Diagnostics must be rejected or cleared when file, session, revision, or text changes.
- Use Memora warning tokens and accessible text; do not rely on color alone.
- Do not commit or stage because the shared worktree already contains unrelated user changes.

---

### Task 1: Round-trip source diagnostics

**Files:**

- Modify: `packages/web/src/lib/editor/markdownRoundTripGuard.ts`
- Test: `packages/web/test/editor/markdownRoundTripGuard.test.ts`

**Interfaces:**

- Produces `MarkdownSafetyDiagnostic` with `from`, `to`, `line`, `column`, `sourceText`, `replacementText`, and `message`.
- Extends only the `content-changed` branch of `MarkdownPreflightResult` with `diagnostics`.

- [ ] **Step 1: Write failing unit tests**

Add tests that require `createMarkdownSafetyDiagnostics` to locate insertion, deletion, replacement, and two non-adjacent line changes. Add a production preflight assertion for `- [] item` whose diagnostic points at the checklist marker and says it would become `- [ ] item`.

- [ ] **Step 2: Run the guard test and verify RED**

Run: `./node_modules/.bin/vp test run test/editor/markdownRoundTripGuard.test.ts`

Expected: FAIL because `createMarkdownSafetyDiagnostics` and `diagnostics` do not exist.

- [ ] **Step 3: Implement deterministic diagnostics**

Split both texts into newline-preserving lines, align unchanged lines with a longest-common-subsequence table, and convert each contiguous changed block into an original-source offset range. Within one replacement line, trim shared prefix/suffix for character precision. Clamp insertions to a visible adjacent source token. Build the message from line number and compact JSON-escaped before/after snippets.

- [ ] **Step 4: Run the guard tests and verify GREEN**

Run: `./node_modules/.bin/vp test run test/editor/markdownRoundTripGuard.test.ts`

Expected: all tests pass.

### Task 2: CodeMirror source editor and diagnostic decorations

**Files:**

- Modify: `packages/web/src/components/editor/SourceDocumentEditor.tsx`
- Modify: `packages/web/test/editor/SourceDocumentEditor.test.tsx`

**Interfaces:**

- Consumes `diagnostics?: readonly MarkdownSafetyDiagnostic[]`.
- Preserves `SourceDocumentEditorHandle.focusEditor()`.
- Adds `SourceDocumentEditorHandle.revealDiagnostic(index?: number)` for automatic issue focus.

- [ ] **Step 1: Write failing component tests**

Replace textarea-specific assertions with CodeMirror DOM and `EditorView` assertions. Require controlled changes, external line selection, imperative focus, read-only mode, reference actions, a visible diagnostic range, accessible diagnostic text, and clearing diagnostics after rerender.

- [ ] **Step 2: Run the source editor test and verify RED**

Run: `./node_modules/.bin/vp test run test/editor/SourceDocumentEditor.test.tsx`

Expected: FAIL because the source editor is still a textarea and has no diagnostic API.

- [ ] **Step 3: Implement the CodeMirror surface**

Render `@uiw/react-codemirror` with `markdown()`, controlled `value`/`onChange`, `editable={!readOnly}`, line numbers, wrapping disabled, and a theme using Memora tokens. Define a `StateEffect` and `StateField<DecorationSet>` that map diagnostics through document changes and render warning marks plus line decorations. Use `hoverTooltip` for the exact message and a visually persistent compact issue list below the editor for keyboard and screen-reader access.

- [ ] **Step 4: Preserve selection and focus behavior**

Use the retained `EditorView` to dispatch external line selections with `scrollIntoView`, implement `focusEditor`, and implement `revealDiagnostic`. Keep reference buttons outside the CodeMirror surface.

- [ ] **Step 5: Run the source editor tests and verify GREEN**

Run: `./node_modules/.bin/vp test run test/editor/SourceDocumentEditor.test.tsx`

Expected: all tests pass.

### Task 3: Page integration and stale-result protection

**Files:**

- Modify: `packages/web/src/components/editor/DocumentEditorPage.tsx`
- Modify: `packages/web/src/components/editor/MarkdownDocumentEditor.tsx`
- Test: `packages/web/test/editor/DocumentEditorPage.test.tsx`

**Interfaces:**

- `DocumentEditorPage` stores `readonly MarkdownSafetyDiagnostic[]` only after snapshot equality succeeds.
- `MarkdownDocumentEditor` consumes `wysiwygSafetyDiagnostics` and clears them through the existing text-change path.

- [ ] **Step 1: Write failing page tests**

Add an unsafe checklist test that clicks Preview, remains in Code mode, shows the exact line message, and exposes a marked source range. Add tests that an edit clears the diagnostic immediately, a successful preflight clears it, conversion errors have no source range, and a stale preflight never publishes diagnostics.

- [ ] **Step 2: Run the page test and verify RED**

Run: `./node_modules/.bin/vp test run test/editor/DocumentEditorPage.test.tsx`

Expected: FAIL because diagnostics are not stored or passed to the source editor.

- [ ] **Step 3: Implement diagnostic lifecycle**

Store diagnostics next to `wysiwygSafetyNotice` only after the canonical before/after snapshots match. Clear them before applying any source edit, on safe preflight, on conversion error, and when the keyed file session changes. Pass them through `MarkdownDocumentEditor` and focus the first diagnostic when an unsafe Preview request is rejected.

- [ ] **Step 4: Run integration and complete editor tests**

Run: `./node_modules/.bin/vp test run test/editor/DocumentEditorPage.test.tsx test/editor/SourceDocumentEditor.test.tsx test/editor/markdownRoundTripGuard.test.ts`

Then run: `./node_modules/.bin/vp test run test/editor`

Expected: all editor tests pass.

### Task 4: Static verification

**Files:**

- Check all files modified by Tasks 1–3.

- [ ] **Step 1: Check formatting**

Run direct Oxfmt with `--check` and `.oxfmtrc.json` on the modified source, tests, spec, and plan.

- [ ] **Step 2: Check lint**

Run direct Oxlint with `packages/web/.oxlintrc.json` on the modified TypeScript files. Expected: zero errors.

- [ ] **Step 3: Check TypeScript**

Run a targeted temporary TypeScript project that includes the modified editor files and tests. Expected: zero errors; remove the temporary config afterward.

- [ ] **Step 4: Review requirements**

Confirm source fidelity, snapshot isolation, automatic first-issue focus, diagnostic clearing, light/dark token use, keyboard focus, and accessible diagnostic text against the design spec.
