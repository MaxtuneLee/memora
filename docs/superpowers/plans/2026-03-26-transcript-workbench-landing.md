# Transcript Workbench Landing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `/transcript`'s generic recordings card grid with a restrained transcript workbench list that matches the upgraded Memora visual system and includes subtle page motion.

**Architecture:** Keep the current data flow in `useMediaFiles`, settings integration, and transcript navigation, but move the landing page to transcript-specific presentation components. Use one pure helper module for workbench summary and row-state derivation so row copy, quiet status cues, and fallback text are testable without DOM-heavy tests.

**Tech Stack:** React 19, react-router, motion/react, Base UI Button/Menu, vite-plus/test

---

### Task 1: Model Transcript Workbench Summary And Row State

**Files:**

- Create: `packages/web/src/components/transcript/transcriptLanding/transcriptLandingState.ts`
- Test: `packages/web/test/transcript/transcriptLandingState.test.ts`

- [ ] **Step 1: Write the failing tests**

Add pure-state tests for:

- language rail copy derived from the stored transcript language
- recording count copy derived from the currently loaded recordings list
- row preview preferring transcript text/preview and falling back to `No transcript yet.`
- row status preferring `Diagnostics available` when diagnostics exist, `Transcript ready` when transcript content exists, and `No transcript yet` otherwise
- row time using `updatedAt` when present and falling back to `createdAt`

- [ ] **Step 2: Run test to verify it fails**

Run from `packages/web`:
`vp test test/transcript/transcriptLandingState.test.ts`

Expected: FAIL because the landing-state helper module does not exist yet.

- [ ] **Step 3: Write minimal implementation**

Implement `transcriptLandingState.ts` with:

- a helper that returns the quiet utility rail items for language and loaded-recording count
- a helper that returns per-row display state including title, preview, status, type label, duration visibility, and timestamp source

Keep the output presentation-oriented only. Do not add new data fetching or a new store dependency for model status on the landing page.

- [ ] **Step 4: Run test to verify it passes**

Run from `packages/web`:
`vp test test/transcript/transcriptLandingState.test.ts`

Expected: PASS for all helper assertions.

### Task 2: Build Transcript Workbench Components

**Files:**

- Create: `packages/web/src/components/transcript/transcriptLanding/TranscriptWorkbench.tsx`
- Create: `packages/web/src/components/transcript/transcriptLanding/TranscriptHistoryRow.tsx`
- Test: `packages/web/test/transcript/transcriptWorkbenchPage.test.ts`

- [ ] **Step 1: Write the failing tests**

Add structure tests that assert:

- the workbench component renders a single dominant surface with a local `Recent transcripts` heading
- the row component links to `/transcript/file/:id`
- the row component exposes preview, status, type, duration, and timestamp areas
- the empty state keeps the primary action inside the same workbench surface
- the new landing components use `motion` for subtle fade/translate entry and keep hover feedback quiet instead of introducing decorative animation

- [ ] **Step 2: Run test to verify it fails**

Run from `packages/web`:
`vp test test/transcript/transcriptWorkbenchPage.test.ts`

Expected: FAIL because the workbench components do not exist yet.

- [ ] **Step 3: Write minimal implementation**

Implement the new landing components so they:

- render one large warm workbench surface instead of card tiles
- use restrained dashboard-aligned borders, surface tones, and spacing
- keep the row hierarchy tool-like and scan-friendly
- include subtle motion only through soft entrance fades/translates and small hover tone changes
- respect reduced motion preferences

- [ ] **Step 4: Run test to verify it passes**

Run from `packages/web`:
`vp test test/transcript/transcriptWorkbenchPage.test.ts`

Expected: PASS for the workbench structure and motion assertions.

### Task 3: Integrate The Workbench Into `TranscriptPage`

**Files:**

- Modify: `packages/web/src/components/transcript/TranscriptPage.tsx`
- Modify: `packages/web/src/components/transcript/transcriptLanding/TranscriptWorkbench.tsx`
- Modify: `packages/web/src/components/transcript/transcriptLanding/TranscriptHistoryRow.tsx`
- Test: `packages/web/test/transcript/transcriptWorkbenchPage.test.ts`
- Test: `packages/web/test/transcript/transcriptLandingState.test.ts`

- [ ] **Step 1: Write the failing tests**

Expand the landing-page tests so they assert:

- `TranscriptPage.tsx` no longer depends on `RecordingsGrid`
- the page keeps `New live transcript` and the settings menu entry points
- the page renders a compact title bar, a quiet utility rail, and a single primary workbench surface
- the page feeds recordings and delete behavior into the new transcript-specific components

- [ ] **Step 2: Run test to verify it fails**

Run from `packages/web`:
`vp test test/transcript/transcriptLandingState.test.ts test/transcript/transcriptWorkbenchPage.test.ts`

Expected: FAIL because `TranscriptPage.tsx` still renders the old header + grid layout.

- [ ] **Step 3: Write minimal implementation**

Update `TranscriptPage.tsx` to:

- keep the existing language persistence and settings dialog behavior
- replace the old white-card header plus `RecordingsGrid` layout with a compact title bar, quiet utility rail, and new workbench list
- use the new transcript landing helpers for rail copy and row-state derivation
- keep the visual direction aligned with dashboard materials while remaining more restrained and tool-like than the dashboard homepage

- [ ] **Step 4: Run test to verify it passes**

Run from `packages/web`:
`vp test test/transcript/transcriptLandingState.test.ts test/transcript/transcriptWorkbenchPage.test.ts`

Expected: PASS with the new page-shell assertions.

### Task 4: Verify The `/transcript` Slice

**Files:**

- Modify: `packages/web/src/components/transcript/TranscriptPage.tsx`
- Modify: `packages/web/src/components/transcript/transcriptLanding/TranscriptWorkbench.tsx`
- Modify: `packages/web/src/components/transcript/transcriptLanding/TranscriptHistoryRow.tsx`
- Modify: `packages/web/src/components/transcript/transcriptLanding/transcriptLandingState.ts`
- Test: `packages/web/test/transcript/transcriptLandingState.test.ts`
- Test: `packages/web/test/transcript/transcriptWorkbenchPage.test.ts`

- [ ] **Step 1: Run targeted test verification**

Run from `packages/web`:
`vp test test/transcript/transcriptLandingState.test.ts test/transcript/transcriptWorkbenchPage.test.ts`

Expected: PASS

- [ ] **Step 2: Run targeted lint verification**

Run from `packages/web`:
`vp lint src/components/transcript/TranscriptPage.tsx src/components/transcript/transcriptLanding/TranscriptWorkbench.tsx src/components/transcript/transcriptLanding/TranscriptHistoryRow.tsx src/components/transcript/transcriptLanding/transcriptLandingState.ts test/transcript/transcriptLandingState.test.ts test/transcript/transcriptWorkbenchPage.test.ts`

Expected: `Found 0 warnings and 0 errors.`

- [ ] **Step 3: Run package-level verification**

Run from `packages/web`:
`vp check .`

Expected: formatting, lint, and type checks pass for the web package.
