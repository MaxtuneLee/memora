# Markdown Document Editor Design

## Summary

Build a dedicated document editor for Memora that feels closer to Typora than a
split-screen Markdown tool. The editor should open text documents from the
desktop workspace, keep Markdown text as the only persisted source of truth,
support both WYSIWYG and source editing, and integrate with the existing OPFS +
LiveStore file model instead of inventing a second document system.

The scope also includes the supporting product surface around the editor:

- create new Markdown notes from the dashboard `New file` menu
- add editor-related settings under `Settings > General`
- support embedded images with configurable attachment placement
- support document-to-document references using Markdown links with line anchors
- safely upgrade `.txt` files to `.md` when the user explicitly enters
  WYSIWYG mode

Design direction in one sentence: make text documents first-class workspace
files inside Memora, with a calm single-page editor, plain-text persistence,
and practical file-based affordances instead of a separate note silo.

## Goals

- Add a dedicated editor route for text documents.
- Route every supported text-document entry point to the same editor surface.
- Make `.md` files editable in both WYSIWYG and source mode.
- Keep Markdown text as the only persisted representation for note content.
- Let `.txt` files open safely, remain editable as plain text, and upgrade to
  Markdown only after explicit user confirmation.
- Support common Markdown writing features in WYSIWYG mode, including tables.
- Support embedded local images using standard Markdown image syntax.
- Let users create new notes from the dashboard with a configurable default
  destination.
- Add editor settings for default note destination, attachment destination, and
  editor font size.
- Support cross-document references with line anchors and a copy-reference
  workflow.
- Reuse the existing workspace file model, folder model, OPFS storage, settings
  document, and navigation patterns.

## Non-Goals

- No collaborative editing, comments, presence, or Yjs integration.
- No block database, document schema, or structured rich-text persistence.
- No generalized workspace path refactor that changes how all files are stored
  in OPFS.
- No automatic back-reference index or backlink panel in v1.
- No automatic rewrite of existing Markdown links when referenced files are
  renamed or moved.
- No PDF, DOCX, or HTML editor in this pass.
- No full desktop-window editor experience; the editor is a normal page route.
- No desktop context-menu `New Note` implementation unless it falls out almost
  for free from the shared note-creation helper. The required product entry
  point for v1 is the dashboard `New file` menu.

## Product Scope

### In scope

- A new route: `/editor/file/:id`
- Document editor page shell and editor UI
- `.md` + `.txt` loading, saving, and mode switching
- Auto-save + `Cmd/Ctrl+S`
- Markdown WYSIWYG using Lexical
- Markdown source mode using a line-numbered source editor surface
- `.txt -> .md` upgrade confirmation and file metadata update
- New note creation from the dashboard
- New editor settings in `Settings > General`
- Image embed insertion with configurable attachment placement
- Internal document references with line anchors and copy-reference support

### Out of scope but important follow-up opportunities

- reuse the same note-creation helper for desktop right-click `New Note`
- document backlinks panel
- drag-based line reference picker from rendered mode
- rename/move-safe internal links backed by hidden IDs
- richer image controls such as captions, resizing, alignment, and galleries

## Current Constraints

### Storage model

Memora stores file metadata and OPFS file contents separately:

- metadata lives in the LiveStore `files` table and a `.meta.json` OPFS file
- file bytes live at `storagePath`
- logical folder placement is represented through `parentId`, not by the OPFS
  storage path itself
- `metaPath` is not stored in LiveStore; read-side code currently reconstructs
  it from `id`

This matters because Markdown links, image links, and document references must
use logical workspace-relative paths such as `../notes/parser.md`, not the
opaque OPFS storage path like `/files/<id>/<id>.markdown`.

### Name and path model

The repo now has foundational helpers that preserve visible extensions for new
document and image uploads, but older workspace files may still lack the
logical `.md` / `.txt` suffix in `files.name`, and current OPFS `storagePath`
extensions are still derived from storage concerns rather than logical filename
conventions.

For this feature, the spec defines:

- `storagePath` is opaque implementation detail
- user-visible and path-visible document names come from `files.name`
- path-based links and image embeds never depend on OPFS storage suffixes

This means “upgrade a `.txt` file to Markdown” is primarily a logical filename

- mime-type update, not a promise that OPFS storage must become `*.md`.

### Route model

Current document files do not have a dedicated editor route. Multiple surfaces
can open or navigate to files today, including desktop, dashboard recents,
library/files, search, and other file-linked navigation affordances. The editor
feature therefore needs a single shared editable-text rule instead of a
desktop-only route special case.

### Settings model

`Settings > General` already has the editor-related settings schema and UI
foundations for note destination, attachment placement, and font size. The
remaining work is to consume those settings from note creation, attachment
insertion, and editor presentation rather than introducing a second settings
model.

## Core Decision

### Markdown text is the only persisted source of truth

The editor must treat Markdown text as the only saved representation.

- source mode edits the persisted text directly
- WYSIWYG mode imports from the current Markdown string into Lexical
- changes in WYSIWYG mode export back to Markdown text
- save logic writes text to OPFS and updates file metadata

This keeps the user’s file portable and inspectable, makes source mode honest,
and avoids a second serialized editor-state format.

### Why not make Lexical state the truth

If Lexical editor state becomes the primary representation, source mode turns
into a derived export instead of a true file editor. That would weaken the
guarantee that the user is editing the real Markdown document and would make
file-based workflows harder to reason about.

### WYSIWYG round-trip contract

V1 only promises lossless WYSIWYG round-tripping for the approved Markdown
subset:

- headings
- paragraphs
- bold / italic / strikethrough
- inline code
- block quotes
- ordered and unordered lists
- task lists
- links
- code blocks
- horizontal rules
- tables
- images

The editor must apply a conservative WYSIWYG-entry guard for existing Markdown
documents:

- normalize line endings to `\n`
- ignore at most one trailing newline difference when comparing text
- reject WYSIWYG entry if import/export would change anything else in the
  source text
- reject WYSIWYG entry if the document contains constructs outside the approved
  subset and the implementation cannot prove they round-trip losslessly

If the guard fails:

- keep the document in source mode
- show a non-blocking warning that the document contains unsupported Markdown
  and staying in source mode avoids reformatting
- do not offer a lossy “open anyway” path in v1

This slightly narrows the earlier “`.md` defaults to WYSIWYG” rule: Markdown
documents target WYSIWYG by default, but they must fall back to source mode
when the round-trip guard cannot guarantee fidelity.

## User Experience

## Opening a document

- `.md` files open in the editor route and default to `WYSIWYG`
- `.txt` files open in the editor route and default to `Source`
- other text-like documents remain out of scope for v1 unless they already map
  cleanly to `text/plain` or `text/markdown`
- non-text documents continue using their existing preview/detail surfaces

### Unified editable-text predicate

The feature must introduce one shared helper such as
`isEditableTextDocument(file)` and use it anywhere the app needs to decide
whether a file should open in `/editor/file/:id`.

At minimum, the spec requires this helper to be used by:

- desktop preview window `Open`
- dashboard recent items
- library/files navigation
- global search results
- any other existing helper that currently decides “audio/video goes to
  transcript, everything else goes elsewhere”

If a document file is not editable by this predicate, it must continue to use
the existing non-editor navigation path rather than falling into a broken or
half-supported route.

### Editor page structure

The page should remain simple and tool-like:

1. top bar with back action, file name, save state, and mode switch
2. optional secondary row for actions such as insert image and copy reference
3. one dominant editing surface

No split view is required. Only one editing mode is visible at a time.

### Save behavior

- auto-save on a short debounce while typing
- manual save on `Cmd/Ctrl+S`
- flush pending save on mode switch and before leaving the page when possible
- dirty state compares current text vs last successfully saved text
- failures keep the current in-memory text and show an error state with retry

### `.txt` upgrade behavior

`.txt` files are source-first. If the user switches a `.txt` file into
WYSIWYG:

1. show a confirmation dialog
2. explain that the file will be reformatted as Markdown
3. if confirmed, convert the file metadata from `.txt` to `.md`
4. update the mime type to `text/markdown`
5. persist the current text bytes through the normal save pipeline
6. keep `storagePath` opaque; rewriting it is optional implementation detail,
   not required product behavior
7. continue in WYSIWYG mode as a Markdown file

If the user cancels, remain in source mode with no file mutation.

## WYSIWYG Markdown Scope

### Markdown feature set

The initial WYSIWYG scope targets the previously approved `C` level:

- headings
- paragraphs
- bold / italic / strikethrough
- inline code
- quotes
- ordered and unordered lists
- links
- code blocks
- horizontal rules
- task lists
- tables
- images

### Lexical package boundary

Use Lexical’s official React editor stack and official Markdown helpers:

- `@lexical/react`
- `@lexical/markdown`
- `@lexical/rich-text`
- `@lexical/list`
- `@lexical/link`
- `@lexical/code`
- `@lexical/table`
- `lexical`

Official docs confirm built-in Markdown helpers and shortcut registration live
in `@lexical/markdown`, and built-in transformers cover headings, lists, code,
quotes, links, and tables.

### Image support is custom, not assumed built-in

Lexical’s documented built-in Markdown transformers cover standard structural
Markdown constructs, but image syntax is not part of the listed built-in text
match or element transformer set in the official Markdown package docs.

Therefore v1 image embed support must explicitly add:

- a custom image node for WYSIWYG rendering
- a custom Markdown transformer for `![alt](path)`
- an insert-image command path that first saves the attachment file, then
  inserts Markdown that points to the saved workspace-relative path

This avoids a false assumption that images will “just work” from the stock
transformer bundle.

## Source Mode

Source mode is a first-class document mode, not a fallback.

- always available for `.md`
- default mode for `.txt`
- shows the actual stored Markdown/plain-text content
- supports line-oriented reference workflows
- supports direct editing of unsupported or non-round-trippable content

Line numbers should be visible in source mode because line anchors depend on
them.

### Source-mode primitive

V1 source mode should not be implemented as a bare `textarea`.

The source surface must provide:

- visible line numbers
- stable line/range selection APIs
- programmatic scroll-to-line and focus behavior
- highlight treatment for a referenced line or range

A line-numbered code editor primitive such as CodeMirror is an acceptable and
preferred fit for this requirement set.

## Routing and Entry Points

### New route

Create a dedicated page route:

- `/editor/file/:id`

This route owns text document editing only.

### Desktop open behavior

Text documents opened from the desktop should route to `/editor/file/:id`
instead of `/transcript/file/:id`.

The detection rule should cover:

- `text/plain`
- `text/markdown`
- `application/markdown`
- file names ending in `.txt`
- file names ending in `.md`

### Dashboard new-note entry point

Add `New note` to the dashboard `New file` menu.

Selecting it should:

1. read the current note-destination setting
2. create a new empty Markdown file with `.md` extension
3. place it at the configured logical folder location
4. create/update LiveStore metadata through the existing file event flow
5. navigate directly to `/editor/file/:id`

## New Note Creation Rules

### File defaults

- type: `document`
- mime type: `text/markdown`
- initial content: empty Markdown document or a minimal placeholder such as a
  single blank line
- default filename: `Untitled note.md`

If a note with the same logical name already exists in the target folder,
generate a deduplicated name such as:

- `Untitled note 2.md`
- `Untitled note 3.md`

### Default destination setting

Settings must support:

- desktop root (`parentId = null`)
- a specific folder

The v1 required workflow is dashboard note creation. The same helper may later
be reused from the desktop context menu without changing the storage rules.

### Path-addressable filename rule

For any file that participates in Markdown path references or editor-managed
image embeds, `files.name` is the logical filename and must include its visible
extension.

This applies at minimum to:

- Markdown notes
- editable plain-text documents
- images created through the editor attachment flow

For legacy editable text documents that do not already include `.md` or `.txt`
in `files.name`, v1 uses a lazy metadata-only backfill strategy:

- when an editable text document is opened in the editor and lacks a visible
  `.md` / `.txt` suffix, infer the preferred extension from MIME type
- rename `files.name` in metadata before path-based editor features become
  available
- deduplicate against sibling files in the same folder
- emit the normal `fileUpdated` metadata flow
- keep `storagePath` opaque and unchanged

This is intentionally not a global migration. The backfill happens when the
document first enters the editor workflow, which is the moment path-based links
and references become relevant.

## Editor Settings

Add a document-editor settings section under `Settings > General`.

### Required settings

- default new note location mode:
  - `root`
  - `folder`
- default new note folder id:
  - used only when mode is `folder`
- attachment placement mode:
  - `root`
  - `fixed-folder`
  - `current-folder`
  - `current-subfolder`
- fixed attachment folder id:
  - used only when attachment mode is `fixed-folder`
- attachment subfolder name:
  - used only when attachment mode is `current-subfolder`
- editor font size:
  - shared by WYSIWYG and source mode

### Required defaults and persistence

The settings schema must define explicit defaults, and storage import/export
must understand the new fields.

Recommended defaults:

- `defaultNoteLocationMode = "root"`
- `defaultNoteFolderId = ""`
- `attachmentPlacementMode = "current-subfolder"`
- `attachmentFolderId = ""`
- `attachmentSubfolderName = "images"`
- `editorFontSizePx = 16`

The implementation must update:

- the LiveStore settings document schema default
- settings import/export normalization
- backward-compatible default backfill when older snapshots are restored

### Missing-folder fallback behavior

Persisted folder IDs in settings must be validated at use time.

If `defaultNoteFolderId` points to a missing, deleted, or otherwise unresolved
folder:

- new-note creation falls back to desktop root
- the UI should surface that the configured folder is unavailable

If `attachmentFolderId` points to a missing, deleted, or otherwise unresolved
folder while attachment mode is `fixed-folder`:

- attachment insertion falls back to desktop root
- the UI should surface that the configured folder is unavailable

If a current document’s `parentId` cannot be resolved for `current-folder` or
`current-subfolder` strategies, treat the note as rooted at desktop root for
path generation and attachment placement.

### Font size behavior

The setting should change the base readable editing size instead of redefining
the whole typography system. A simple px-based setting is enough for v1.

Recommended behavior:

- store a numeric base size such as `16`
- apply it through a CSS variable
- use the same base size in source mode and prose text in WYSIWYG mode

## Image Attachments

## User-facing behavior

Users should be able to embed images into Markdown notes from WYSIWYG mode and,
where practical, source mode via an insert-image action.

The saved Markdown should use standard image syntax:

```md
![Diagram](./images/architecture.png)
```

### Attachment placement options

Use the four approved placement strategies:

1. desktop root
2. specified attachment folder
3. current file’s folder
4. a named subfolder under the current file’s folder

### Logical placement rules

Because workspace organization is modeled through folder IDs:

- `root` means `parentId = null`
- `fixed-folder` means the configured folder id
- `current-folder` means the note’s `parentId`
- `current-subfolder` means a child folder under the note’s `parentId`

If `current-subfolder` is selected and the subfolder does not exist, create it
automatically.

### Saved file behavior

Embedded images should become real workspace files:

- file type: `image`
- saved through the existing file save/create path
- visible in desktop and library like any other image file

The editor then inserts a workspace-relative Markdown path from the current
note to the saved image file.

### Relative path semantics

Relative paths for attachments must be based on the logical workspace tree, not
the OPFS storage path.

That means the editor needs a helper that can:

- compute a logical path for the current note from folder ancestry + file name
- compute a logical path for the target attachment from folder ancestry + file
  name
- derive a relative path between them

### Markdown target encoding

Workspace-relative Markdown targets must use a canonical encoding so ordinary
filenames remain valid in Markdown links and image syntax.

Rules:

- keep path structure separators literal: `./`, `../`, and `/`
- percent-encode each path segment independently using RFC 3986-safe escaping
- additionally encode `(` and `)` so Markdown link parsing is unambiguous
- decode each segment exactly once during resolution before matching against
  `files.name` / folder names
- escape link labels by prefixing `\`, `[` and `]` with `\`

Example:

```md
[API \#1](../notes/API%20%231.md#L12)
![Build](./images/diagram%20%281%29.png)
```

### Path uniqueness invariant

Because Markdown references and image paths are path-based, the workspace needs
one additional invariant for path-addressable files:

- active sibling files that participate in path references must have unique
  logical names within the same folder
- active sibling folders that participate in path resolution must have unique
  names within the same parent folder

The spec requires this invariant to be enforced for relevant files during:

- file create
- file rename
- file move
- folder create
- folder rename
- folder move

If a future flow encounters legacy ambiguity before the invariant is fully
backfilled, the app must fail loudly and ask the user to resolve the naming
conflict instead of silently picking one match.

### V1 enforcement matrix

The invariant above must be enforced through shared helpers plus the concrete
mutation surfaces already used by the app:

- new-note creation
- `.txt -> .md` upgrades and any other editor-driven logical renames
- desktop file rename
- desktop folder create / rename
- desktop file and folder move
- transcript detail rename for document files
- picker uploads and desktop drag/drop uploads for path-addressable documents
  and images
- storage import / restore conflict handling
- editor-driven image attachment save flow

The intended implementation shape is:

- shared policy lives in `pathMutations.ts` and logical-name helpers
- each mutation surface must call that shared policy before emitting LiveStore
  write events or overwriting metadata

### Naming behavior

When importing an image:

- preserve the original base name when practical
- preserve the original extension
- sanitize invalid path characters
- deduplicate within the target logical folder

## Document References

## Reference format

Cross-document references must use standard Markdown link syntax with an
optional line anchor:

- single line:
  - `[Parser notes](../notes/parser.md#L12)`
- line range:
  - `[Parser notes](../notes/parser.md#L12-L18)`

This keeps references portable and readable in raw Markdown.

### Line-anchor contract

Line anchors are defined against normalized source text with these rules:

- line numbers are 1-based
- ranges are inclusive
- normalize `\r\n` and bare `\r` to `\n` before counting lines
- an empty document still exposes line 1
- `#L0`, negative numbers, non-integers, and `#L18-L12` are invalid anchors

Open behavior:

- if the start line is out of range, open the destination document in source
  mode, show a non-blocking “referenced line is no longer available” warning,
  and do not highlight a range
- if the start line is valid but the end line is past the end of the document,
  clamp the end line to the final available line
- if the anchor syntax itself is invalid, treat the link as an unanchored
  document reference

### Why line anchors belong to source mode

Line numbers are a property of the source text, not of the rendered WYSIWYG
layout. Therefore:

- references with `#L...` anchors should resolve against source text
- opening a line-anchored reference should force the destination document into
  source mode and focus/highlight the anchored line or range
- plain document links without a line anchor may open in the reader/editor’s
  default document mode

### Copy reference workflow

V1 should support a practical `Copy reference` action built around source mode.

Recommended scope:

- if the user has a line selection in source mode, copy a range reference
- if the user only has a cursor line, copy a single-line reference
- if there is no selection context, allow copying a file-level reference that
  defaults to `#L1`

The generated Markdown link should use the current file’s title as the default
link label and the relative logical path + line anchor as the target.

### Reference resolution

Resolving a document reference requires:

- parsing the Markdown link target
- resolving the relative logical path to a current file ID using the workspace
  folder/file tree
- reading the line anchor, if present
- navigating to `/editor/file/:id`
- opening source mode when line anchors are present

If relative-path resolution matches multiple sibling candidates because of a
legacy naming conflict, reference resolution must reject the navigation and
surface a conflict message instead of guessing.

### Rename and move caveat

Because links are path-based in v1:

- renaming a referenced file can break existing links
- moving a referenced file can break existing links

This is acceptable in v1 and should be documented as a known limitation rather
than hidden behind a fake promise of stability.

## Architecture

### Top-level breakdown

The feature should split into these units:

- `DocumentEditorPage`
  - route-level loading, error state, back navigation, file eligibility
- `useDocumentEditorFile`
  - read, save, dirty state, mode state, `.txt` upgrade flow
- `MarkdownDocumentEditor`
  - editor shell, mode switch, editor actions, save state presentation
- Lexical editor modules
  - composer setup, custom image node, custom image Markdown transformer
- note creation helper
  - dashboard-triggered file creation based on settings
- logical workspace path utilities
  - relative path generation and link resolution
- editor settings section
  - read/write settings document fields

### Persistence flow

For normal saves:

1. current mode updates the in-memory Markdown text
2. save pipeline writes text bytes to the current document storage path
3. metadata file is updated with `updatedAt`, `sizeBytes`, and any changed name
   or mime/storage path fields
4. `fileEvents.fileUpdated(...)` keeps LiveStore in sync

For `.txt -> .md` upgrades:

1. compute the new logical filename
2. write the current text through the normal save path
3. update metadata with new file name, mime type, size, and timestamp
4. emit `fileUpdated`
5. do not require `storagePath` mutation for product correctness; if an
   implementation later rewrites it for storage hygiene, that is an internal
   migration concern rather than a user-visible requirement

## Error Handling

- if a file ID is missing or invalid, show a not-found state with a safe way
  back to desktop
- if a file is not a supported text document, do not render the editor
- if Markdown import into Lexical fails, remain in source mode and surface the
  failure instead of silently rewriting content
- if auto-save fails, keep the document dirty and show retryable error state
- if image save fails, do not insert a broken Markdown image token
- if a reference target path cannot be resolved, the link remains textually
  valid in source mode but navigation should show a clear failure notice

## Testing Strategy

This feature spans route behavior, editor logic, settings, file mutation, and
path resolution. The first pass should prioritize targeted tests over repo-wide
verification.

### Required test coverage

- supported file types route to the editor page
- unsupported file types do not
- `.md` files default to WYSIWYG mode
- `.md` files with unsupported or non-round-trippable Markdown fall back to
  source mode with a warning
- `.txt` files default to source mode
- `.txt` WYSIWYG switch shows a confirmation dialog
- confirming `.txt` upgrade renames the file to `.md` and changes mime type to
  `text/markdown`
- cancelling `.txt` upgrade leaves metadata unchanged
- editable text documents without a visible `.md` / `.txt` suffix are backfilled
  to a logical name on first editor open without changing `storagePath`
- auto-save and manual save both call the same persistence path
- dashboard `New note` uses settings to choose root vs specific folder
- settings defaults and storage import/export include the new editor fields
- restoring an older settings snapshot backfills editor defaults safely
- missing configured folder IDs fall back deterministically and surface a
  settings warning
- image attachment placement obeys all four placement modes
- generated image links and document references encode filenames safely for
  Markdown targets and decode them during resolution
- source mode supports visible line numbers, line-range selection, and range
  highlight after navigation
- line-anchor behavior is 1-based, inclusive, newline-normalized, and handles
  invalid / out-of-range anchors deterministically
- relative workspace path generation is correct for attachments and references
- sibling-name conflicts are rejected on file/folder create, rename, and move
  for path-addressable workspace paths
- reference links with `#L` anchors open the destination editor in source mode
- copy-reference output matches the agreed Markdown link format

## Verification Guidance

Targeted verification should include:

- focused unit tests for file/path/settings helpers
- focused component tests for route/mode/dialog behaviors
- targeted lint and format checks for touched files

Repo-wide checks may still contain unrelated noise, so they should not be the
only quality gate for this feature.

## Open Implementation Risks

- custom image node + Markdown transformer integration is the least
  off-the-shelf part of the feature
- path-based references can drift after rename/move, which is accepted but must
  be explicit
- WYSIWYG/source switching must not introduce accidental markdown rewrites for
  unsupported constructs
- table editing and Markdown round-tripping need real tests because this is a
  known sharp edge in many editors

## Final Recommendation

Implement this as one coherent document workflow centered on Markdown text, not
as a pure editor widget. The editor page, note creation defaults, attachment
placement, and reference protocol all need to agree on the same logical
workspace-path model. If they are implemented separately, the user will end up
with a visually nice editor that still behaves inconsistently as a file-based
workspace tool.
