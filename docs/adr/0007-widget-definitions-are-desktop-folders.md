# Widget Definitions are Desktop folders

CONTEXT.md and issue #25 call a Widget Definition "a folder containing a render component and a
data binding," stored "under a reserved Widgets folder." Before this change that was aspirational:
`widgetCode` and the data binding were plain columns on the `widgetDefinitions` LiveStore table,
with no corresponding folder or file in the Desktop filesystem. The Todo widget's `todo.md` was
created at the Desktop root by `todoDocument.ts`, unrelated to any Definition.

## Decision

A Widget Definition is now a real folder — a `folders` row plus its child `files` rows — under a
reserved `Widgets` root folder:

```
/Widgets/                      reserved root folder
  Todo/                        builtin definition folder
    widget.json                manifest: { kind, builtinKey?, name, dataSourceName, dataSourceParams }
    todo.md                    runtime data, migrated from the root
  Calendar/  Recent/           builtin folders with widget.json only
  <generated name>/            generated definition folder
    widget.json
    widget.html                the show_widget source (style + HTML + script) exactly as streamed
```

`widgetDefinitions` stays the fast index for the binding: `folderId` and `sourceFileId` are
nullable columns pointing at the folder and (for `generated` definitions) at `widget.html`. The
table remains authoritative for the binding — `widget.json` mirrors it and is rewritten on create
and on rename, so the folder is self-describing on the Desktop, but nothing reads the binding back
out of the JSON.

For `generated` definitions, `widget.html` is the single source of truth for the render source.
`widgetCode` on the table is no longer relied on for rendering (it stays as a column so existing
rows don't need a migration, but new saves leave it empty). The Home Grid tile
(`GeneratedWidgetTile`) reads the source from the file via OPFS and subscribes to the file row's
`updatedAt` through a live query, re-reading whenever it changes — so editing `widget.html` in the
app's text editor, or via the chat `modify_text_file` tool, updates every placed Instance without
re-placing it. A short loading state covers the OPFS read. The sandboxed iframe runtime from ADR
0006 is unchanged; only where the source comes from is different.

Generated widgets do not get a write channel in this iteration — chat can create a Definition's
`widget.html` when saving, but nothing yet lets chat edit it in place after that. Editing after
save goes through the text editor or is a follow-up.

### Reserved-folder protection

Folders get a nullable `reservedKind` column (`"widgets"` for the root, `"widgetDefinition"` for a
Definition folder), carried on `folderCreated`. The Desktop UI enforces, at the point where
renames/deletes/moves are committed:

- The `Widgets` root can't be deleted, renamed, or moved.
- A Definition folder can't be moved out of `Widgets` (in practice: it can't be moved at all,
  since `Widgets` only ever holds Definition folders directly — there is no valid destination).
- Renaming a Definition folder renames its Definition to match, and rewrites `widget.json`
  (`syncWidgetDefinitionFolderRename` in `widgetDefinitionFolderSync.ts`, called from
  `Desktop.tsx`'s rename commit). The reverse direction — renaming a Definition renaming its
  folder — lives in `updateWidgetDefinition` itself, so any future caller that renames a
  Definition gets the folder and `widget.json` kept in sync for free; today the Desktop's folder
  rename is the only path that actually renames one.
- Trashing a Definition folder soft-deletes its Definition and Instances too
  (`useTrashActions.ts`'s `moveItemToTrash`, via `deleteWidgetDefinition` in
  `widgetDefinitions.ts`). The folder's own files are deleted by the normal folder-trash cascade;
  `deleteWidgetDefinition` is only asked to cascade to the Definition row and its Instances, which
  live outside the folder tree.

A rejected rename, delete, or move of the `Widgets` root (or an attempted move of a Definition
folder) surfaces a toast, not just a console warning — `Desktop.tsx` holds a `Toast.useToastManager()`
handle (the app already wraps the router in a `Toast.Provider`) and calls `add(...)` alongside the
existing `console.warn`. No new confirmation dialogs or disabled-menu-item states were added beyond
that.

## Seeding and migration

`seedHomeGrid` creates the `Widgets` root and one folder per builtin Definition (with
`widget.json`) idempotently, gated by a `widgetFoldersSeeded` setting distinct from
`homeGridSeeded` — so accounts that already seeded their Home Grid under the old scheme still get
folders backfilled once, without re-seeding Instances or re-applying the legacy visibility toggle.
For that legacy path, each existing builtin Definition row is matched to its folder by name (there
is no other key to go on before the row is backfilled), and then has its `folderId` written back
via `widgetDefinitionUpdated` — so a later read of the row (e.g. `TodoPanel`'s `todoFolderId`)
resolves the folder directly, without redoing the name match. If a root-level `todo.md` (by its
old name, `Today Tasks`) is found, it is reparented into `Widgets/Todo/` as part of the same pass.
`findTodoDocument` / `ensureTodoDocument` look inside the Todo Definition's folder first and fall
back to the old name-based search across every file, so legacy data that hasn't been migrated yet
(or a call site that doesn't know the folder id) still resolves.

`seedHomeGrid` is called from a `useEffect` on the Dashboard, which React StrictMode invokes twice
in development; the two calls race each other before the first has awaited its OPFS writes and
committed `homeGridSeeded` / `widgetFoldersSeeded`, so without a guard the second call would see
the same "not seeded yet" state and duplicate every definition folder and builtin Definition.
`seedHomeGrid` guards against this with a module-level `WeakMap` from store identity to the
in-flight run's promise, mirroring the pattern `todoDocument.ts` already used for concurrent Todo
document creation — a second call with the same store awaits the first call's promise instead of
starting its own.

## Consequences

- Saving a chat-generated widget (`saveChatWidgetDefinition`) is now async: it creates the
  Definition's folder, writes `widget.html` and `widget.json` to OPFS, then commits the Definition
  with `folderId` and `sourceFileId` set. Folder names are unique within `Widgets` (a numeric
  suffix is appended on collision).
- The document editor's editable-text allowlist gained `text/html` / `.html`, so `widget.html` can
  be opened and edited like any other note from the Desktop.
- A few more LiveStore reads are needed on the Dashboard and in `seedHomeGrid` (active Widget
  Definitions, and the Widgets folder) to support seeding, saving, and the Todo document lookup.
- `packages/web/tsconfig.app.json` had `"composite": true` on a project that also sets `"noEmit":
true`. `composite` implies declaration-emit diagnostics, which made `tsc` compute and try to
  print every exported symbol's full inferred type for a `.d.ts` it never actually emits; once this
  schema's LiveStore-inferred types got deep enough, that surfaced as `TS2742` ("inferred type
  cannot be named without a reference to .../effect/Option") on `folderTable`,
  `widgetDefinitionTable`, and their materializers. It was replaced with `"incremental": true`,
  which keeps the build-info caching `composite` was there for without triggering declaration-emit
  diagnostics on a project that never emits declarations.
