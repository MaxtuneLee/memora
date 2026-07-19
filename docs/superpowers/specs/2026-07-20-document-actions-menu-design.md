# Document Actions Menu Design

**Date:** 2026-07-20  
**Status:** Approved for specification review  
**Scope:** @memora/web Markdown and plain-text document editor

## Context

The document editor currently exposes an Actions menu containing Save, Attach image, and Insert
table. The menu does not yet cover common document-level actions or show document metadata. The
redesign takes the grouping and density of the supplied Notion reference as inspiration while
retaining Memora's warm, quiet, paper-like visual system.

The user approved a single-column grouped menu, removal of Attach image and Insert table from this
menu, global Small text and Full width preferences, and a metadata footer containing word count,
creation time, and last update time.

## Goals

- Make common document actions available without leaving the writing context.
- Present the complete action set in a compact, legible hierarchy.
- Persist Small text and Full width as global editor preferences.
- Preserve local-first behavior for duplication, export, moving, and deletion.
- Show useful document metadata at the bottom of the menu.
- Preserve keyboard access, focus visibility, reduced-motion behavior, and readable errors.

## Non-goals

- Page locking, offline toggles, translation, AI actions, comments, or wiki conversion.
- Adding a new attachment or table insertion entry elsewhere in this change.
- Per-document layout preferences.
- Cloud sharing or public links. Copy link targets the local Memora document route.
- Changing the settings page's existing custom editor font-size control.
- Adding dependencies or redesigning the shared application shell.

## Information Architecture

The existing Actions pill remains the trigger. Its menu becomes a compact single-column panel with
four groups in this order:

1. **Document actions**
   - Save, with current save status and the platform shortcut
   - Copy link
   - Duplicate
   - Move to
2. **Reading preferences**
   - Small text switch
   - Full width switch
3. **Output and management**
   - Export
   - Move to trash
4. **Document information**
   - Word count
   - Created
   - Last edited

Thin separators and spacing distinguish groups. Metadata is informational and does not participate in
menu keyboard navigation.

## Visual Direction

The menu borrows the reference image's compact rows, aligned icons, right-side switches, and quiet
separators. It remains recognizably Memora:

- Use existing semantic surface, border, hover, text, olive, and warning tokens instead of new
  one-off colors.
- Use the existing pill-to-panel transition and respect prefers-reduced-motion.
- Replace large icon chips and explanatory copy with restrained 40–44 px rows.
- Use existing Phosphor icons with consistent optical size and weight.
- Show active switches with the muted olive accent. Only Move to trash uses warning text.
- Target a panel width near 272 px so metadata labels and values remain readable.
- Constrain the panel to available viewport height and scroll on short screens.
- Keep focus rings calm but clearly visible and prefer WCAG AA contrast.

No new global color or spacing token is required. Reusable local patterns are a compact menu row, a
section separator, a menu switch, and a two-column metadata row.

## Interaction Details

### Save

Save preserves existing behavior. It is disabled while a save or another conflicting operation is in
progress. The row shows Saved, Unsaved changes, Saving..., or Save failed and displays Command-S on
macOS and Ctrl-S elsewhere. Mouse interaction must not steal the source editor's selection before the
save begins.

### Copy link

Copy link writes an absolute URL for /editor/file/:id to the clipboard. Transient query parameters
such as source ranges are omitted. Success and failure are announced through the existing toast
system and an accessible live region.

### Duplicate

Duplicate first flushes pending changes so the copy contains the latest canonical text. It creates a
new OPFS-backed file in the current document's logical parent folder, preserving extension and MIME
type. Names follow this deterministic policy:

- Draft.md becomes Draft copy.md.
- If that exists, use Draft copy 2.md, then increment until the name is unique among active siblings.
- If the source already ends in copy, continue the sequence instead of appending another copy:
  Draft copy.md becomes Draft copy 2.md, and Draft copy 2.md becomes Draft copy 3.md. If the next
  number is occupied, continue incrementing until a free sibling name is found.

After storage succeeds and the fileCreated event is committed, Memora navigates to the new document.
A failure leaves the original document open and reports the error.

### Move to

Selecting Move to changes the panel body to a destination picker without opening a separate modal.
The picker contains a back row, Desktop root, and active folders labeled with breadcrumbs. The
current parent is marked and cannot be selected again. A long list scrolls within the panel.

Choosing a destination first flushes pending changes, then commits fileUpdated with the new parentId
and updatedAt. OPFS content is not physically rewritten because folders are logical workspace
organization. A save failure aborts the move. On success the document stays open. On failure the
picker remains available and shows a concise error.

### Small text

Small text is a global boolean setting. When enabled, document body text renders at 14 px. When
disabled, the editor returns to the existing editorFontSizePx preference, preserving the custom
value. It affects source and WYSIWYG modes but not the document title or controls. Toggling it keeps
the menu open so the result is visible.

### Full width

Full width is a global boolean setting. When disabled, the editor keeps its current 58 rem reading
width. When enabled, it expands to available page width while retaining responsive padding. Toggling
it keeps the menu open and applies immediately.

### Export

Export first flushes pending changes, then downloads canonical text with the current document name,
MIME type, and extension. Markdown remains Markdown and plain text remains plain text. The temporary
object URL is revoked after download starts. Export does not mutate the document.

### Move to trash

Move to trash opens the existing native confirmation dialog. Confirmation flushes pending changes,
commits fileDeleted with the current timestamp, and returns to the previous route. Cancellation does
nothing. If the editor was opened directly and has no in-app history entry, successful deletion
navigates to /desktop instead of leaving the application. A failed save or delete keeps the document
open and reports the failure.

### Document information

The footer updates from the active document and editor text:

- **Word count:** each Unicode code point whose Script property is Han, Hiragana, Katakana, or Hangul
  counts as one word. This includes Han compatibility ideographs covered by Unicode's Han script
  data. Each continuous run of Unicode Latin letters or decimal digits counts as one word. Whitespace
  and punctuation, including Markdown marker punctuation, do not count. This is a deterministic
  tokenizer based on Unicode property escapes, not a full Markdown renderer.
- **Created:** file.createdAt formatted with the user's local locale and time zone.
- **Last edited:** file.updatedAt using the same formatter and updating after a successful save or
  metadata mutation.

The product currently uses English interface copy, so labels are Word count, Created, and Last
edited.

## Component Boundaries

### DocumentActionsMenu

A focused editor component owns menu presentation, destination-picker state, the trash confirmation
dialog, busy states, and accessible labeling. It receives document metadata, text, preference values,
save state, folders, and callbacks. It does not directly access LiveStore or OPFS.

### MarkdownDocumentEditor

The editor continues to own title editing and source/WYSIWYG surfaces. It renders
DocumentActionsMenu and forwards required values and callbacks. Removed image-input and table
insertion wiring is deleted if no longer used elsewhere in this component.

### DocumentEditorPage

The page coordinates async action flows. It flushes pending saves where required, calls focused file
helpers, updates action status, and navigates after duplication or deletion. Testable props keep
LiveStore commits at the route boundary.

### Pure document action helpers

Small helpers provide word counting, duplicate-name generation, local duplication, and browser
export preparation. Keeping deterministic logic outside React allows direct unit coverage.

### Route component

The route-backed Component binds action callbacks to fileCreated, fileUpdated, fileDeleted, and
settingsSet, and passes active folders and normalized settings into the page.

## Settings Changes

Add optional persisted settings with safe defaults:

- editorSmallText: false
- editorFullWidth: false

Update the settings interface, default value, stored-value schema, normalization, storage backup
import/export types, and import validation. Existing settings remain valid because both fields are
optional in stored data and filled by normalization.

The document editor settings hook exposes typed handlers for both switches. The existing numeric
font-size handler and Settings UI remain intact.

## Feedback and Error Handling

- Async actions expose a single busy action so repeated clicks cannot create duplicate writes.
- Save failures block duplicate, move, export, and trash operations that depend on latest content.
- Clipboard, duplication, movement, export, and deletion failures produce concise, user-safe English
  messages through the existing toast provider.
- The menu or picker exposes an aria-live polite status for relevant in-menu updates.
- Failed movement leaves the destination picker open; failed destructive operations leave the
  document and route unchanged.
- Missing or deleted destination folders are excluded. If a destination disappears during selection,
  the operation fails safely rather than moving to an invalid parent.

## Accessibility and Keyboard Behavior

- The trigger retains aria-haspopup menu, aria-expanded, and a visible focus ring.
- Up/Down, Home/End, Enter/Space, and Escape continue to work for action rows.
- Disabled and informational rows are skipped by menu focus.
- Switch rows expose menuitemcheckbox and aria-checked while remaining keyboard operable.
- The destination picker has a clear accessible name, keyboard-reachable destinations, and back
  action.
- Opening confirmation moves focus into the dialog; closing returns focus to the triggering control.
- Motion is removed when the user requests reduced motion.

## Test Strategy

Implementation follows red-green-refactor. Each behavior begins with a focused failing test.

### Unit tests

- Word count for empty text, Han, Hiragana, Katakana, Hangul, Latin, numeric, punctuation, and mixed
  Markdown content.
- Duplicate naming for Markdown, text, existing copy suffixes, and sibling conflicts, including
  sequence continuation from copy and copy N names.
- Duplicate helper preserves content, MIME type, extension, parent, and emits the correct create
  event.
- Export preparation preserves filename, MIME type, and text.
- Settings normalization supplies both defaults and preserves explicit values.

### Component tests

- The menu renders approved groups and omits Attach image and Insert table.
- Small text and Full width expose checked states, invoke updates, and keep the menu open.
- Metadata and locally formatted values render; word count updates with text.
- Move to enters the destination picker, marks the current destination, and supports back navigation.
- Busy and failed actions expose correct disabled states and accessible feedback.
- Move to trash requires confirmation and cancellation has no effect.

### Page integration tests

- Duplicate flushes pending text, creates a sibling copy, commits it, and navigates to the new route.
- Move flushes pending changes before committing the selected logical parent without rewriting
  document content, and aborts when that save fails.
- Export flushes pending text before download.
- Trash flushes, commits soft deletion, and navigates only after success.
- Global preferences change document width and source/WYSIWYG font size.

### Verification

- Run focused editor and settings test files.
- Run vp check.
- Run vp test.
- Run vp build with the @memora/web package filter.
- Inspect the menu in light and dark modes, standard and short viewports, keyboard-only navigation,
  and reduced-motion mode.

## Acceptance Criteria

- The menu contains Save, Copy link, Duplicate, Move to, Small text, Full width, Export, and Move to
  trash in approved order and grouping.
- Attach image and Insert table are absent.
- Small text and Full width persist globally and apply immediately.
- Duplicate, move, export, and trash use the latest successfully saved text and fail safely.
- The footer shows a deterministic live word count and locally formatted creation and edit times.
- The menu follows Memora semantic tokens and calm interaction style in light and dark themes.
- Menu actions and switches are keyboard accessible, focus-visible, and reduced-motion compatible.
- No dependency is introduced, and focused tests, checks, and the web build pass.
