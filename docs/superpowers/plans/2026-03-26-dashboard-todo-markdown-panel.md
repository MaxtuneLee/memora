# Dashboard TODO Markdown Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static dashboard task card with a live TODO panel backed by a real OPFS Markdown document that also appears in existing file surfaces.

**Architecture:** Extract the dashboard TODO feature into a dedicated panel component plus a small dashboard-owned document module. Keep Markdown parsing and serialization pure and separately tested. Put OPFS writes and LiveStore event commits behind a focused repository API so the UI only manages loading, optimistic updates, and error display.

**Tech Stack:** React 19, TypeScript, @memora/fs OPFS helpers, LiveStore file events, Vite+ test runner

---

### Task 1: Add Pure Markdown Parsing And Serialization

**Files:**
- Create: `packages/web/src/components/dashboard/todoMarkdown.ts`
- Test: `packages/web/test/dashboard/todoMarkdown.test.ts`

- [ ] **Step 1: Write the failing parser and serializer tests**

Add tests for:
- canonical empty document serialization
- parsing open and done items
- preserving multiline task text
- ignoring content outside the `Open` and `Done` sections

- [ ] **Step 2: Run the targeted test to verify it fails**

Run: `vp test packages/web/test/dashboard/todoMarkdown.test.ts`
Expected: FAIL because the module does not exist yet.

- [ ] **Step 3: Implement the minimal markdown helpers**

Add:
- a canonical document title and section constants
- a `TodoTask` type for in-memory tasks
- `parseTodoMarkdown(markdown: string): TodoTask[]`
- `serializeTodoMarkdown(tasks: TodoTask[]): string`
- simple task id generation for parsed rows if needed

- [ ] **Step 4: Run the targeted test to verify it passes**

Run: `vp test packages/web/test/dashboard/todoMarkdown.test.ts`
Expected: PASS

### Task 2: Add The OPFS + LiveStore TODO Document Repository

**Files:**
- Create: `packages/web/src/components/dashboard/todoDocument.ts`
- Modify: `packages/web/src/lib/library/fileStorage.ts`
- Test: `packages/web/test/dashboard/todoDocument.test.ts`

- [ ] **Step 1: Write the failing repository tests**

Add tests for:
- creating the backing Markdown document when it does not exist
- reusing an existing active `Today Tasks` file row
- overwriting document content and metadata on save
- emitting the correct `fileCreated` or `fileUpdated` event payloads through a stub store

- [ ] **Step 2: Run the targeted repository test to verify it fails**

Run: `vp test packages/web/test/dashboard/todoDocument.test.ts`
Expected: FAIL because the repository module does not exist yet.

- [ ] **Step 3: Extend file storage with a generic document save helper only if needed**

If the current `saveFileToOpfs` API already supports markdown documents cleanly, keep changes minimal. Otherwise add the smallest shared helper needed to:
- write a text blob into `/files/<id>/...`
- preserve the standard metadata layout

- [ ] **Step 4: Implement the dashboard-owned document repository**

Add repository functions to:
- locate the active `Today Tasks` document from live file rows
- create the document with canonical markdown when missing
- read and parse its markdown body
- save updated markdown content back to OPFS
- rewrite the meta file with updated `sizeBytes` and `updatedAt`
- commit `fileCreated` and `fileUpdated` through a narrow store-like interface

- [ ] **Step 5: Run the targeted repository test to verify it passes**

Run: `vp test packages/web/test/dashboard/todoDocument.test.ts`
Expected: PASS

### Task 3: Build And Test The Dashboard TODO Panel UI

**Files:**
- Create: `packages/web/src/components/dashboard/TodoPanel.tsx`
- Test: `packages/web/test/dashboard/TodoPanel.test.tsx`

- [ ] **Step 1: Write the failing panel tests**

Cover:
- loading the initial TODO document into `Open` and `Done` sections
- adding a multiline task
- toggling a task between open and done
- disabling add for empty input
- showing an error state when load fails

- [ ] **Step 2: Run the panel test to verify it fails**

Run: `vp test packages/web/test/dashboard/TodoPanel.test.tsx`
Expected: FAIL because the component does not exist yet.

- [ ] **Step 3: Implement the minimal panel component**

Build a focused component that:
- loads the TODO document on mount
- shows a textarea and `Add` button
- renders open and done task sections
- preserves line breaks in task text
- performs optimistic updates through a serialized save chain
- reverts to the last confirmed state on write failure
- surfaces compact error copy inside the card

- [ ] **Step 4: Run the panel test to verify it passes**

Run: `vp test packages/web/test/dashboard/TodoPanel.test.tsx`
Expected: PASS

### Task 4: Replace The Static Dashboard Card And Verify

**Files:**
- Modify: `packages/web/src/components/dashboard/DashboardPage.tsx`
- Modify: `packages/web/src/components/dashboard/TodoPanel.tsx`
- Test: `packages/web/test/dashboard/todoMarkdown.test.ts`
- Test: `packages/web/test/dashboard/todoDocument.test.ts`
- Test: `packages/web/test/dashboard/TodoPanel.test.tsx`

- [ ] **Step 1: Remove the old static todo card path from `DashboardPage.tsx`**

Delete the hard-coded task list builder and row renderer if they become unused. Replace the existing dashboard card block with `TodoPanel`.

- [ ] **Step 2: Keep the visual treatment aligned with the existing dashboard**

Reuse the current card shell, spacing rhythm, muted palette, and restrained controls so the panel still feels native to Memora.

- [ ] **Step 3: Run the dashboard-focused tests**

Run: `vp test packages/web/test/dashboard`
Expected: PASS

- [ ] **Step 4: Run broader verification for the touched package**

Run: `vp lint packages/web/src/components/dashboard packages/web/test/dashboard`
Expected: PASS

Run: `vp test packages/web/test/dashboard`
Expected: PASS

- [ ] **Step 5: Review the final diff for accidental scope creep**

Confirm there is:
- no new delete flow
- no extra task metadata
- no unintended changes to recent or calendar widgets
