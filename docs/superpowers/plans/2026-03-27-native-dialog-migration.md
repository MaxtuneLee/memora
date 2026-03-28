# Native Dialog Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Base UI dialog usage with a project-owned native `<dialog>` wrapper and migrate the current dialog surfaces onto the browser top layer.

**Architecture:** Introduce one thin controlled `NativeDialog` wrapper around `HTMLDialogElement.showModal()` plus a small shared stylesheet for top-layer-safe motion and backdrop styling. Migrate existing dialog consumers in two passes: first the settings and confirm flows to validate layering and API shape, then the remaining modal surfaces once the wrapper proves stable.

**Tech Stack:** React 19, TypeScript, native `<dialog>`, Tailwind CSS v4, Vitest via `vp test`

---

## File Map

### Create

- `packages/web/src/components/ui/NativeDialog.tsx`
  Controlled native dialog wrapper with top-layer lifecycle, close handling, and focus management.
- `packages/web/src/components/ui/nativeDialog.css`
  Shared native dialog layout, backdrop, and panel motion styles.
- `packages/web/test/ui/NativeDialog.test.tsx`
  Wrapper behavior tests for open/close, Escape, backdrop clicks, and focus restoration.

### Modify

- `packages/web/src/components/settings/SettingsDialog.tsx`
  Replace Base UI dialog primitives with the native wrapper while preserving current settings layout and animation feel.
- `packages/web/src/components/desktop/ConfirmDialog.tsx`
  Replace Base UI dialog primitives with the native wrapper in the simplest confirmation flow.
- `packages/web/src/components/desktop/UploadDialog.tsx`
  Replace Base UI dialog primitives with the native wrapper.
- `packages/web/src/components/chat/ToolWriteApprovalDialog.tsx`
  Replace Base UI dialog primitives with the native wrapper.
- `packages/web/src/components/search/SearchPalette.tsx`
  Replace Base UI dialog primitives with the native wrapper and preserve input autofocus plus keyboard workflow.
- `packages/web/src/components/ui/index.ts` or existing barrel if present
  Export the new wrapper if this folder already exposes shared UI components.

### Verify

- `packages/web/src/components/dashboard/DashboardMenu.tsx`
  No functional changes expected initially, but verify the settings launch bug is resolved without changing menu behavior.

## Task 1: Build and Prove the Native Wrapper

**Files:**

- Create: `packages/web/src/components/ui/NativeDialog.tsx`
- Create: `packages/web/src/components/ui/nativeDialog.css`
- Create: `packages/web/test/ui/NativeDialog.test.tsx`

- [ ] **Step 1: Write the failing tests for wrapper behavior**

Write tests that cover:

- rendering the dialog panel when `open` becomes `true`
- calling `onOpenChange(false)` on Escape when Escape closing is enabled
- not calling `onOpenChange(false)` on Escape when disabled
- closing on backdrop click when enabled
- restoring focus to the trigger after close

Use a minimal harness component inside `packages/web/test/ui/NativeDialog.test.tsx`.

- [ ] **Step 2: Run the wrapper tests to verify they fail**

Run: `pnpm --filter @memora/web test -- test/ui/NativeDialog.test.tsx`

Expected: FAIL because `NativeDialog` does not exist yet and the tested behavior is unimplemented.

- [ ] **Step 3: Implement the minimal wrapper and shared CSS**

Build `NativeDialog` with:

- a native `<dialog>` ref
- controlled `open` synchronization via `showModal()`
- a close lifecycle that delays `close()` until exit animation finishes
- native `cancel` event handling
- backdrop click detection on the dialog root
- focus capture and focus restoration
- support for `labelledBy`, `describedBy`, `initialFocusRef`, and `finalFocusRef`

Implement CSS classes for:

- full-screen modal layout
- warm Memora backdrop using `dialog::backdrop`
- centered panel motion using opacity, scale, and translate
- `data-state="open"` and `data-state="closing"` transitions
- reduced motion fallback

- [ ] **Step 4: Run the wrapper tests to verify they pass**

Run: `pnpm --filter @memora/web test -- test/ui/NativeDialog.test.tsx`

Expected: PASS

- [ ] **Step 5: Run formatting and lint checks for the wrapper**

Run:

- `vp fmt packages/web/src/components/ui/NativeDialog.tsx packages/web/src/components/ui/nativeDialog.css packages/web/test/ui/NativeDialog.test.tsx`
- `pnpm --filter @memora/web lint`

Expected: no formatting or lint errors attributable to the new wrapper.

- [ ] **Step 6: Commit the wrapper foundation**

```bash
git add packages/web/src/components/ui/NativeDialog.tsx \
  packages/web/src/components/ui/nativeDialog.css \
  packages/web/test/ui/NativeDialog.test.tsx
git commit -m "feat(web): add native dialog wrapper"
```

## Task 2: Migrate SettingsDialog and Validate the Layering Fix

**Files:**

- Modify: `packages/web/src/components/settings/SettingsDialog.tsx`
- Test: `packages/web/test/ui/NativeDialog.test.tsx`

- [ ] **Step 1: Write a failing settings dialog regression test**

Add a focused test that verifies:

- the settings dialog uses the native dialog wrapper
- opening the dialog exposes the title and description correctly
- close actions still call `onOpenChange(false)`

If practical, assert that the rendered tree now includes a native `<dialog>`.

- [ ] **Step 2: Run the targeted settings test to verify it fails**

Run: `pnpm --filter @memora/web test -- test/ui/NativeDialog.test.tsx`

Expected: FAIL because `SettingsDialog` still depends on Base UI dialog primitives.

- [ ] **Step 3: Replace Base UI primitives inside SettingsDialog**

Update `SettingsDialog` to use the new wrapper:

- replace `Dialog.Root`, `Dialog.Portal`, `Dialog.Backdrop`, and `Dialog.Popup`
- preserve the current inner layout, header, close button, and scroll container
- preserve the motion feel using wrapper state classes or motion only inside the panel body if still needed
- ensure the close button continues to drive `onOpenChange(false)`

- [ ] **Step 4: Run the targeted settings test to verify it passes**

Run: `pnpm --filter @memora/web test -- test/ui/NativeDialog.test.tsx`

Expected: PASS

- [ ] **Step 5: Manually verify the transcript settings flow**

Run: `pnpm --filter @memora/web dev`

Manual check:

- open transcript page
- open the settings morph menu
- launch the AI provider settings dialog
- verify the menu morph no longer sits above the dialog backdrop

- [ ] **Step 6: Commit the settings migration**

```bash
git add packages/web/src/components/settings/SettingsDialog.tsx \
  packages/web/src/components/ui/NativeDialog.tsx \
  packages/web/src/components/ui/nativeDialog.css \
  packages/web/test/ui/NativeDialog.test.tsx
git commit -m "fix(web): migrate settings dialog to native dialog"
```

## Task 3: Migrate the Simple Modal Consumers

**Files:**

- Modify: `packages/web/src/components/desktop/ConfirmDialog.tsx`
- Modify: `packages/web/src/components/desktop/UploadDialog.tsx`
- Modify: `packages/web/src/components/chat/ToolWriteApprovalDialog.tsx`

- [ ] **Step 1: Write failing regression tests for simple modal consumers**

Extend the wrapper test file or add targeted tests for:

- confirm dialog renders title and actions
- upload dialog renders description and close control
- tool approval dialog renders the request content and close path

Test behavior, not styling.

- [ ] **Step 2: Run the targeted tests to verify they fail**

Run: `pnpm --filter @memora/web test -- test/ui/NativeDialog.test.tsx`

Expected: FAIL because these components still use Base UI dialog primitives.

- [ ] **Step 3: Migrate the three simple dialog consumers**

For each component:

- replace Base UI dialog imports and usage
- wire cancel and close behavior through `onOpenChange(false)`
- keep current content structure and button semantics intact

- [ ] **Step 4: Run the targeted tests to verify they pass**

Run: `pnpm --filter @memora/web test -- test/ui/NativeDialog.test.tsx`

Expected: PASS

- [ ] **Step 5: Run lint and relevant tests**

Run:

- `pnpm --filter @memora/web lint`
- `pnpm --filter @memora/web test -- test/ui/NativeDialog.test.tsx`

Expected: PASS

- [ ] **Step 6: Commit the simple modal migration**

```bash
git add packages/web/src/components/desktop/ConfirmDialog.tsx \
  packages/web/src/components/desktop/UploadDialog.tsx \
  packages/web/src/components/chat/ToolWriteApprovalDialog.tsx \
  packages/web/test/ui/NativeDialog.test.tsx
git commit -m "refactor(web): migrate simple dialogs to native dialog"
```

## Task 4: Migrate SearchPalette

**Files:**

- Modify: `packages/web/src/components/search/SearchPalette.tsx`
- Test: `packages/web/test/ui/NativeDialog.test.tsx`

- [ ] **Step 1: Write a failing search palette regression test**

Cover:

- palette opens in a native dialog
- search input receives focus on open
- close restores focus to the trigger

- [ ] **Step 2: Run the targeted search palette test to verify it fails**

Run: `pnpm --filter @memora/web test -- test/ui/NativeDialog.test.tsx`

Expected: FAIL because SearchPalette still uses Base UI dialog primitives.

- [ ] **Step 3: Migrate SearchPalette to NativeDialog**

Update the component to:

- use the wrapper
- pass the search input as `initialFocusRef`
- preserve current keyboard navigation and open/close semantics
- keep current backdrop and panel feel within the shared native dialog styling

- [ ] **Step 4: Run the targeted search palette test to verify it passes**

Run: `pnpm --filter @memora/web test -- test/ui/NativeDialog.test.tsx`

Expected: PASS

- [ ] **Step 5: Manually verify search workflow**

Run: `pnpm --filter @memora/web dev`

Manual check:

- open search with keyboard shortcut
- confirm input is focused immediately
- navigate search results
- close and verify focus restoration

- [ ] **Step 6: Commit the search palette migration**

```bash
git add packages/web/src/components/search/SearchPalette.tsx \
  packages/web/test/ui/NativeDialog.test.tsx
git commit -m "refactor(web): migrate search palette to native dialog"
```

## Task 5: Remove Base UI Dialog Usage and Run Final Verification

**Files:**

- Modify: any remaining files that still import `@base-ui/react/dialog`

- [ ] **Step 1: Search for remaining Base UI dialog imports**

Run: `rg -n "from \"@base-ui/react/dialog\"" packages/web/src`

Expected: no matches.

- [ ] **Step 2: Run full web validation**

Run:

- `pnpm --filter @memora/web lint`
- `pnpm --filter @memora/web test`
- `pnpm --filter @memora/web build`

Expected:

- lint passes
- tests pass
- build succeeds

- [ ] **Step 3: Run a final manual dialog sweep**

Manual check all migrated surfaces:

- transcript settings
- search palette
- confirm dialog
- upload dialog
- tool approval dialog

Verify open, close, Escape, backdrop, and focus behavior.

- [ ] **Step 4: Commit the final cleanup**

```bash
git add packages/web/src packages/web/test
git commit -m "refactor(web): replace base ui dialogs with native dialog"
```
