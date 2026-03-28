# Native Dialog Design

## Summary

This document defines a project-owned native `<dialog>` wrapper for `@memora/web`.
The goal is to replace `@base-ui/react/dialog` with a thin React abstraction built on
top of `HTMLDialogElement.showModal()` so that dialogs and native `popover` elements
share the browser's top-layer behavior.

This change is driven by an existing layering bug in the transcript settings flow:
a morphing menu implemented with native `popover="auto"` can remain above the
settings modal backdrop while it closes. The root cause is that the current dialog
implementation is not a native `<dialog>`; it is a portal-rendered `<div>` and
therefore does not participate in the same top-layer stack.

## Problem

The current codebase uses `@base-ui/react/dialog` in these surfaces:

- `SettingsDialog`
- `SearchPalette`
- `ConfirmDialog`
- `UploadDialog`
- `ToolWriteApprovalDialog`

Base UI's dialog portal renders `div` elements into the document body. Those layers
rely on `z-index` and portal order. By contrast, the transcript settings entry uses a
native popover-based morph menu. Native popovers participate in the browser top layer.

As a result:

- the popover and dialog do not share one layering model
- `z-index` tuning does not solve the mismatch reliably
- opening a dialog from the popover can expose the morph animation above the modal
  backdrop

## Goals

- Replace Base UI dialog usage with a project-owned native `<dialog>` wrapper.
- Use the browser top layer for all modal dialogs.
- Keep the wrapper intentionally thin and focused on current project needs.
- Preserve Memora's existing visual language and motion quality.
- Provide consistent close behavior for Escape, backdrop click, and programmatic close.
- Provide stable focus entry and focus restoration.
- Support current modal use cases without rebuilding a full primitive library.

## Non-Goals

- Recreating the full Base UI dialog primitive API.
- Building nested modal support in the first pass.
- Solving every floating-layer use case across tooltips, menus, and popovers.
- Converting non-modal surfaces to `<dialog>`.

## Expected Browser Semantics

The wrapper is built around native modal dialog behavior:

- `dialog.showModal()` places the element in the browser top layer.
- `dialog::backdrop` is the real modal backdrop and is tied to the same top-layer entry.
- dialog opening order determines visual stacking relative to other top-layer elements.
- the browser enforces modal interaction constraints outside the dialog.

This is the behavior described in the web.dev article on dialog and popover support:
native dialogs and popovers share top-layer semantics, which is exactly what the
current layering bug needs.

## Proposed Component

Create a new component:

- `/Users/maxtune/workspace/personal/memora/packages/web/src/components/ui/NativeDialog.tsx`

The component is a controlled React wrapper over a native `<dialog>` element.

### Public API

```ts
interface NativeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  className?: string;
  panelClassName?: string;
  closeOnBackdropPress?: boolean;
  closeOnEscape?: boolean;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  finalFocusRef?: React.RefObject<HTMLElement | null>;
  labelledBy?: string;
  describedBy?: string;
}
```

This API is intentionally small. It reflects the needs of the current app and avoids
premature abstraction.

## DOM Structure

The wrapper should render this structure:

```tsx
<dialog className="memora-dialog">
  <div className="memora-dialog__viewport">
    <div className="memora-dialog__panel">...</div>
  </div>
</dialog>
```

### Rationale

- `<dialog>` itself owns top-layer placement and `::backdrop`.
- the viewport layer handles alignment and click targeting
- the panel layer carries visual styling and motion
- transforms stay off the `<dialog>` root where possible, reducing browser edge cases

## State Model

The wrapper needs an internal lifecycle instead of mapping `open` directly to the
presence of the element.

### Internal States

- `closed`
- `opening`
- `open`
- `closing`

### Behavior

When `open` becomes `true`:

1. render the dialog if needed
2. call `showModal()` if the element is not already open
3. apply `data-state="open"` after mount so entrance styles can run
4. move focus into the dialog

When `open` becomes `false`:

1. switch to `data-state="closing"`
2. wait for exit animation completion
3. call `dialog.close()`
4. restore focus

This avoids tearing between React state and native dialog state.

## Event Handling

### Escape Key

Listen to the native `cancel` event on `<dialog>`.

- if `closeOnEscape === false`, call `event.preventDefault()`
- otherwise call `event.preventDefault()` and forward to `onOpenChange(false)`

The component should remain controlled; closing must flow through the parent state.

### Backdrop Press

Use pointer or click handling on the `<dialog>` root to detect clicks on the dialog
surface outside the panel.

Rules:

- clicks targeting the dialog root itself count as backdrop clicks
- clicks inside the panel do not
- if `closeOnBackdropPress === false`, ignore the event
- otherwise call `onOpenChange(false)`

The implementation must not depend on a fake backdrop element.

### Programmatic Close

When `open` changes from the outside, the wrapper handles closing animation and then
calls `dialog.close()`.

## Motion Design

Motion should be preserved, but implemented in a way that does not break top-layer
behavior.

### Backdrop

Animate `dialog::backdrop` with:

- opacity
- blur

### Panel

Animate the inner panel with:

- opacity
- scale
- translateY

### Timing

- enter: approximately 140-220ms
- exit: approximately 140-180ms
- reduced motion: disable transform-heavy transitions and keep minimal opacity changes

### Important Constraint

The dialog must enter the top layer first, then animate in.
On close, it must remain in the top layer while its own exit animation runs, then be
closed. This is acceptable because the dialog and backdrop are part of the same
top-layer entry.

## Accessibility

The wrapper must provide:

- `aria-labelledby` via `labelledBy`
- `aria-describedby` via `describedBy`
- correct focus entry on open
- correct focus restoration on close
- keyboard Escape handling
- modal interaction semantics from native `<dialog>`

The implementation should not rely on custom focus trapping if native modal behavior
already covers the need. Only add additional focus logic where required for consistency.

## Focus Management

### On Open

Focus resolution order:

1. `initialFocusRef.current`, if present
2. the first focusable element in the panel
3. the panel container itself

### On Close

Focus restoration order:

1. `finalFocusRef.current`, if present
2. the element that was focused before opening, if still connected

This is especially important for:

- `SearchPalette`, which should focus its search input immediately
- trigger buttons that should receive focus back after close

## Styling Strategy

Do not render a separate backdrop node. Use native `::backdrop`.

Shared dialog styling should come from a small local CSS file or a reusable class
contract, with Memora-aligned defaults:

- warm off-white panel
- low-contrast border
- soft shadow
- calm motion

Candidate tokens:

- `--dialog-backdrop-bg`
- `--dialog-backdrop-blur`
- `--dialog-panel-radius`
- `--dialog-panel-shadow`
- `--dialog-enter-duration`
- `--dialog-exit-duration`

## Migration Targets

Current dialog users:

1. `SettingsDialog`
2. `SearchPalette`
3. `ConfirmDialog`
4. `UploadDialog`
5. `ToolWriteApprovalDialog`

## Migration Plan

### Phase 1

Implement the wrapper and migrate:

- `SettingsDialog`
- `ConfirmDialog`

Reasoning:

- `SettingsDialog` is the layering bug we need to fix
- `ConfirmDialog` is a simple validation target for the shared API

### Phase 2

Migrate:

- `UploadDialog`
- `ToolWriteApprovalDialog`
- `SearchPalette`

`SearchPalette` is deferred because it has the most focus-sensitive behavior.

## Detailed Expectations Per Target

### SettingsDialog

- must render as native modal dialog
- must visually preserve current panel layout and animation feel
- must no longer allow transcript popover morph artifacts above its backdrop

### ConfirmDialog

- simplest replacement case
- validates basic title, description, confirm, and cancel behavior

### UploadDialog

- confirm file selection and action controls remain stable
- verify close button and cancel flow

### ToolWriteApprovalDialog

- preserve approval and denial paths
- preserve keyboard interaction

### SearchPalette

- must autofocus the search input on open
- must restore focus predictably on close
- must maintain keyboard-first workflow

## Risks

### Browser Differences

Native dialog behavior is broadly available, but event details can differ slightly,
especially around `cancel` and click targeting.

### Animation Lifecycle

If close timing is handled carelessly, dialogs may disappear instantly or linger in an
open state after the UI says they are closed.

### Search Focus Complexity

`SearchPalette` is the most likely place for regressions in open-focus-close behavior.

### Nested Modals

This spec does not guarantee nested dialog behavior in the first implementation.
If nested flows become necessary, the wrapper may need a small stack manager.

## Verification Requirements

The implementation should be verified against these scenarios:

- opening settings from the transcript popover no longer shows the morph layer above the dialog backdrop
- Escape closes the dialog when allowed
- backdrop click closes the dialog when allowed
- clicking inside the panel does not close it
- focus moves into the dialog on open
- focus returns to the trigger on close
- reduced motion mode behaves correctly
- `SearchPalette` input is immediately usable when opened
- rapid repeated open/close sequences do not produce `InvalidStateError`

## Implementation Direction

The wrapper should be thin:

- native `<dialog>` handles modal semantics and top-layer placement
- React handles controlled state and event bridging
- CSS handles transitions
- minimal JavaScript handles animation completion and focus restoration

This keeps the solution aligned with platform behavior rather than recreating a modal
stack in application code.
