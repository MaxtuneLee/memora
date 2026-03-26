# Transcription Save Rail Motion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a staged transcription rail animation where the waveform appears after the controls dock right, hides before finalize collapse, the controls return to center as a saving pill, then show a saved confirmation for 600ms before navigation.

**Architecture:** Keep the recording/finalization logic in `useTranscript`, but move visual sequencing into the live page and controls components via a small UI phase model plus shared-layout motion. Use pure helpers for timings and phase-derived layout so the sequencing is testable without DOM-heavy tests.

**Tech Stack:** React 19, motion/react, Base UI Button, vite-plus/test

---

### Task 1: Model The Rail Phases

**Files:**

- Modify: `packages/web/src/components/transcript/transcriptionControlMotion.ts`
- Test: `packages/web/test/transcript/transcriptionControlMotion.test.ts`

- [ ] **Step 1: Write the failing tests**

Add assertions for:

- `START_WAVEFORM_REVEAL_DELAY_MS`
- `FINALIZE_WAVEFORM_EXIT_MS`
- `SAVE_SUCCESS_REDIRECT_DELAY_MS`
- phase-derived rail state for `idle`, `recording`, `finalizing`, `saving`, `saved`

- [ ] **Step 2: Run test to verify it fails**

Run: `vp test test/transcript/transcriptionControlMotion.test.ts`
Expected: FAIL because the new constants and rail state helper do not exist yet

- [ ] **Step 3: Write minimal implementation**

Add:

- a `TranscriptionRailPhase` type
- exported timing constants
- a pure helper that maps a phase to `showVisualizer`, `dockedRight`, and controls mode

- [ ] **Step 4: Run test to verify it passes**

Run: `vp test test/transcript/transcriptionControlMotion.test.ts`
Expected: PASS for the new helper assertions

### Task 2: Sequence The Live Rail

**Files:**

- Modify: `packages/web/src/components/transcript/TranscriptLivePage.tsx`
- Modify: `packages/web/src/components/transcript/AudioVisualizer.tsx`
- Test: `packages/web/test/transcript/transcriptionControlMotion.test.ts`

- [ ] **Step 1: Write the failing tests**

Add assertions that the live page:

- uses the redirect delay constant instead of immediate navigate-on-success
- wraps the waveform in motion so it can hide independently
- passes a visual phase into `TranscriptionControls`

- [ ] **Step 2: Run test to verify it fails**

Run: `vp test test/transcript/transcriptionControlMotion.test.ts`
Expected: FAIL because the page still navigates immediately and the waveform has no staged animation wrapper

- [ ] **Step 3: Write minimal implementation**

Implement a local rail phase controller in `TranscriptLivePage.tsx` that:

- delays waveform reveal after start
- hides waveform immediately on finalize
- waits for the waveform exit duration before centering the controls as a saving pill
- waits 600ms after success before navigating

- [ ] **Step 4: Run test to verify it passes**

Run: `vp test test/transcript/transcriptionControlMotion.test.ts`
Expected: PASS for the live page sequencing assertions

### Task 3: Morph Controls Through Saving And Success

**Files:**

- Modify: `packages/web/src/components/transcript/TranscriptionControls.tsx`
- Test: `packages/web/test/transcript/transcriptionControlMotion.test.ts`

- [ ] **Step 1: Write the failing tests**

Add assertions that controls:

- accept a phase-driven mode instead of only `recording`
- keep shared `layoutId` morphing through saving/saved
- render a loading indicator state and a saved confirmation state

- [ ] **Step 2: Run test to verify it fails**

Run: `vp test test/transcript/transcriptionControlMotion.test.ts`
Expected: FAIL because the controls only support idle/recording and side-status text

- [ ] **Step 3: Write minimal implementation**

Update `TranscriptionControls.tsx` to:

- render `idle`, `recording`, `saving`, and `saved` control modes
- keep the primary control on a shared layout path
- animate the save button out, then center the saving pill
- reveal the saved text after the green check shifts left slightly

- [ ] **Step 4: Run test to verify it passes**

Run: `vp test test/transcript/transcriptionControlMotion.test.ts`
Expected: PASS with the new control-mode assertions

### Task 4: Verify The Slice

**Files:**

- Modify: `packages/web/src/components/transcript/TranscriptLivePage.tsx`
- Modify: `packages/web/src/components/transcript/TranscriptionControls.tsx`
- Modify: `packages/web/src/components/transcript/transcriptionControlMotion.ts`
- Test: `packages/web/test/transcript/transcriptionControlMotion.test.ts`

- [ ] **Step 1: Run targeted test verification**

Run: `vp test test/transcript/transcriptionControlMotion.test.ts`
Expected: PASS

- [ ] **Step 2: Run targeted lint verification**

Run: `vp lint src/components/transcript/TranscriptionControls.tsx src/components/transcript/TranscriptLivePage.tsx src/components/transcript/transcriptionControlMotion.ts test/transcript/transcriptionControlMotion.test.ts`
Expected: `Found 0 warnings and 0 errors.`
