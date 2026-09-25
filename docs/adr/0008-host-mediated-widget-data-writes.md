# Host-mediated write channel for a Widget Definition's own data/ folder

## Context

ADR 0007 gave every Widget Definition a real folder under `Widgets/`, with a reserved `data/`
location for runtime output — but nothing writes to it yet. ADR 0006 gives Home Grid widgets a
one-way host-to-widget `postMessage` bridge (catalog data in, `sendPrompt`/`openLink` out) and
explicitly deferred writes. A chat-generated habit tracker or reading list can render, but any
state it collects (checked-off days, saved entries) is gone on the next reload — it never
persisted anywhere.

## Decision

Add a `writeData(name, content)` call to both widget runtimes (Chat's preview bridge and the Home
Grid sandbox shim), and a matching `widgetData` data source catalog entry to read it back. The
write itself stays inside the trust boundaries the earlier ADRs already established:

- **The widget never touches storage directly.** `writeData` is a `postMessage` call (Home Grid)
  or a call into the host-owned bridge object (Chat preview, unsandboxed but still host-mediated)
  — never a direct file or OPFS handle. The host decides whether, where, and how much gets
  written.
- **The host writes only into that Definition's own `Widgets/<name>/data/` folder.** The write
  handler is a closure bound to one Definition's `folderId` at render time
  (`GeneratedWidgetTile`/`ChatWidget`); there is no `writeData` parameter that lets a widget name
  a different folder, so one widget cannot target another's data even in principle.
- **Allowed file names are declared, not inferred.** `data_files` on `show_widget` (parallel to
  `data_source`/`data_source_params`) becomes `dataFiles` on `widget.json` when the widget is
  saved. A write to any other name — or from a Definition with no declaration at all — is
  refused, and the refusal reaches the widget as a rejected `writeData(...)` promise with a
  message. `dataFiles` lives only in `widget.json` (there is no SQLite column for it): unlike the
  `dataSourceName`/`dataSourceParams` binding, which the table must stay authoritative for so
  Instances can bind to it, `dataFiles` is read once per write, off the write path's own async
  I/O, so there is no reactivity to support and no reason to duplicate it.
- **Size is capped by the host, not the author.** `WIDGET_DATA_MAX_FILE_BYTES` (64 KB) and
  `WIDGET_DATA_MAX_TOTAL_BYTES` (512 KB per Definition) in `widgetDataFile.ts` are fixed
  constants — an agent can shrink its own footprint by declaring fewer files, but cannot raise the
  ceiling.
- **Writes are rate-limited per file name at the shim, and serialized per Definition at the
  host.** The Home Grid shim coalesces: a `writeData` call while one for the same name is already
  in flight replaces the queued content (last write wins) instead of queueing every
  keystroke-level update as its own round trip. That coalescing is per name, though, so two
  differently-named `writeData` calls from the same widget can still reach the host in the same
  tick; `writeWidgetDataFile` (`widgetDataFile.ts`) queues those by `definitionFolderId` and
  re-reads the folder/file state fresh once it's this write's turn, rather than trusting a
  snapshot taken before an earlier queued write committed. Without that, two concurrent writes
  could each see no `data/` folder yet, each create one, and split the Definition's files across
  both — the "declared name" would still resolve, but `widgetData` reads from only the first
  folder `findWidgetDataFolder` matches, silently losing whichever file landed in the other one.
- **Reads go through the existing `onData`/`getData` bridge, not a new one.** `widgetData` is
  just another catalog entry (`DATA_SOURCE_NAMES`), resolved by reading the Definition's `data/`
  folder and keyed by file name (JSON-parsed when the content parses, raw text otherwise). Its
  `folderId` is injected into the resolved params by `resolveWidgetInstanceParams` rather than
  authored anywhere, since it always means "this Definition's own folder," never a chosen value.
  Because it is resolved by the same `useDataSourceValue` machinery as every other catalog entry,
  and that machinery already subscribes to a live LiveStore query, a write's `fileEvents` commit
  makes the widget's own `onData` fire again with no reload — the same behavior an external edit
  to the file already gets.
- **Writes land through the normal file pipeline.** A successful `writeData` call goes through
  `saveFileToOpfs` / `fileEvents` exactly like any other Desktop file — visible on the Desktop, in
  search, and readable by chat — rather than a widget-private store outside that system.

**Chat's preview runtime keeps writes in memory.** A widget being exercised in Chat, before it is
saved, has no Definition or folder yet — there is nothing to write persistently to. Its
`writeData` calls go through `usePreviewWidgetData`, an in-memory map scoped to that
`ChatWidgetComponent` instance, validated against the same `data_files` declaration and the same
size-cap rules (`validateWidgetDataWrite`, shared by both paths) so a widget that passes
validation in preview also passes it once saved. If the widget's `data_source` is `widgetData`,
`onData` in preview reflects this in-memory map the same way it reflects the OPFS-backed folder
once saved — the widget's own code does not change between the two.

**The `data/` folder is a plain (unreserved) folder**, unlike `Widgets` itself or a Definition
folder (ADR 0007's `reservedKind` protections). It shows up on the Desktop like any other folder a
user could rename, move, or delete; there is no re-protection here. That is an accepted gap for
this iteration — a user who empties or removes it loses the widget's persisted state, but nothing
else, and the widget's script keeps working (an empty `widgetData` read is just `{}`).

## Consequences

- `DATA_SOURCE_NAMES` gains `"widgetData"` — a plain literal addition, no LiveStore migration.
- `GeneratedWidgetFrame` and Chat's `useWidgetRuntime` both gained an `onWriteData` prop/param;
  omitting it refuses every write with a fixed error message, so existing callers (tests, the
  Chat preview before this change shipped) keep working unchanged.
- The show-widget-skills README documents `data_files` and `writeData` next to the existing data
  source catalog table, and `widgetTools.ts`'s tool description gets one added sentence — the
  agent's only new surface is one more optional `show_widget` argument.
