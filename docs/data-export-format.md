# Memora data export format

This document is the specification for the archive Memora writes from **Settings > Storage > Export** and reads back with **Import**. The implementation lives in `packages/web/src/lib/settings/storageExport.ts` (contents and import rules) and `packages/web/src/lib/settings/zipArchive.ts` (ZIP container). Change this document in the same commit as any change to either file.

Current format version: **2**. Readers accept versions **1** and **2**.

## Goals

- **Complete.** An archive restores everything a person made or configured: library files and their metadata, folders, collections, chats, the assistant profile, desktop widgets, and settings.
- **Portable.** Any standard ZIP tool can open it. JSON files are readable as-is, and user files keep their original bytes and names.
- **Safe to import.** A damaged or foreign archive is rejected before existing data is touched, and an archive can only write inside Memora's user data.
- **Free of secrets.** API keys never leave the device.

## Container

The archive is a ZIP file named `memora-data-export-YYYYMMDD-HHmmss.zip` (local time).

Writers must:

- Store every entry uncompressed (method 0). Media files are already compressed, and storing lets the export reference files on disk instead of loading them into memory.
- Encode entry names as UTF-8 and set general-purpose flag bit 11.
- Write sizes and CRC-32 in the local header (no data descriptors).
- Use ZIP64 extra fields for any entry size or offset of 4 GiB or more, and ZIP64 end-of-central-directory records when the archive has 65,535 or more entries or the central directory starts at or beyond 4 GiB.

Readers must:

- Locate entries through the central directory, not by scanning local headers.
- Accept method 0 (stored) and method 8 (deflate), so an archive someone unpacked and re-zipped still imports.
- Accept ZIP64 records.
- Verify every entry's CRC-32 and uncompressed size.
- Ignore directory entries and anything outside `memora-export/` (for example `__MACOSX/` from macOS).

## Layout

```text
memora-export/
├── manifest.json
├── livestore/
│   ├── settings.json
│   ├── providers.json
│   ├── files.json
│   ├── folders.json
│   ├── collections.json
│   ├── widget-definitions.json   (version 2+)
│   └── widget-instances.json     (version 2+)
└── opfs/
    ├── files/…                   library files, content artifacts, thumbnails, transcripts
    └── chat/…                    chat sessions, session assets, assistant profile, traces
```

Every path above is required for the version that introduced it. `livestore/model-routing.json` may appear in version 1 archives; see [Version history](#version-history).

## `manifest.json`

```json
{
  "formatVersion": 2,
  "exportedAt": "2026-10-14T08:30:00.000Z",
  "app": "Memora",
  "contents": {
    "settings": true,
    "providers": 2,
    "files": 140,
    "folders": 12,
    "collections": 3,
    "widgetDefinitions": 4,
    "widgetInstances": 4,
    "opfsFiles": 512
  },
  "notes": ["…"]
}
```

| Field           | Type    | Meaning                                                                                   |
| --------------- | ------- | ----------------------------------------------------------------------------------------- |
| `formatVersion` | integer | Required. Readers reject versions they do not know; a higher one asks the user to update. |
| `exportedAt`    | string  | ISO 8601 time of export.                                                                  |
| `app`           | string  | Always `"Memora"`.                                                                        |
| `contents`      | object  | Row and file counts, informational only. Readers must not rely on them.                   |
| `notes`         | array   | Human-readable notes, informational only.                                                 |

## `livestore/*.json`

Each file is a pretty-printed JSON snapshot of one LiveStore table (`packages/web/src/livestore/`). Rows include soft-deleted (`deletedAt`) and purged (`purgedAt`) rows so trash state survives a round trip.

Dates are ISO 8601 strings. Readers also accept epoch milliseconds. Nullable fields are written as `null`.

Readers validate each row field by field. An invalid field falls back to its default, and a row without an `id` (or a file without a `storagePath`) is skipped. Unknown fields are ignored, so a newer writer can add fields without a version bump.

### `settings.json`

One object with the fields of `settingsStoredValueSchema` in `livestore/setting.ts`, including `modelRouting`. Each field is checked against that schema on its own; a field that fails falls back to its default instead of failing the import. Readers rebuild `modelRouting` with `normalizeAiModelRouting`, which also migrates the legacy `selectedProviderId`/`selectedModel` pair.

`homeGridSeeded` and `widgetFoldersSeeded` record whether the desktop widgets were already set up. They must travel with the widget tables; see the version 1 rule under [Import](#import).

### `providers.json`

Provider metadata from `toProviderMetadata`: `id`, `name`, `baseUrl`, `apiFormat`, `models` (a JSON string), `createdAt`, `updatedAt`, `deletedAt`. Credentials in `provider_credentials` are **never** exported. Readers pass `baseUrl` through `redactProviderEndpoint` so a hand-edited archive cannot smuggle credentials in a URL.

### `files.json`, `folders.json`, `collections.json`

Rows of the `files`, `folders`, and `collections` tables with all columns. `files[].storagePath`, `transcriptPath`, and `thumbnailPath` are OPFS paths and point into `opfs/`.

### `widget-definitions.json`, `widget-instances.json`

Rows of the `widgetDefinitions` and `widgetInstances` tables with all columns. Generated widget code is in `widgetCode`; each definition's `widget.json` manifest file is a library file under `opfs/files/`.

## `opfs/`

A copy of the browser's Origin Private File System under the user data roots. The OPFS path is the archive path with `memora-export/opfs` removed: `memora-export/opfs/files/abc/note.md` restores to `/files/abc/note.md`.

| Included    | Contents                                                                              |
| ----------- | ------------------------------------------------------------------------------------- |
| `/files/**` | Library files and their per-file folders: extracted content, transcripts, thumbnails. |
| `/chat/**`  | Chat sessions, session assets, the assistant profile, traces.                         |

| Excluded                                       | Why                                                                                                      |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `/chat/skills`                                 | Excluded since version 1. Skills come with the app.                                                      |
| `/skills`                                      | Built-in skills, installed by the app.                                                                   |
| `/transformers-cache`                          | Downloaded local models. Large and downloadable again.                                                   |
| `/search-indexes`                              | Search indexes. Derived data; Memora checks each indexed file after import and rebuilds what is missing. |
| `/background-tasks`, `/model-worker-snapshots` | Transient runtime state.                                                                                 |
| LiveStore databases                            | Rebuilt from the JSON snapshots above.                                                                   |

## Import

Import **replaces** the user data on this device with the archive's. It runs in this order, and nothing is changed until step 4:

1. Read the ZIP central directory.
2. Check `manifest.json` and parse every `livestore/*.json` file. Check that no two files or folders claim the same path.
3. Check every `opfs/` entry: its path must be inside an included root above and must not contain `.` or `..` segments. Then read each entry once and verify its CRC-32 and size.
4. Delete the included OPFS roots, then write every `opfs/` entry.
5. Commit LiveStore events so tables match the archive: create missing rows, update existing ones, restore or delete to match `deletedAt`/`purgedAt`, and delete rows that exist on this device but not in the archive. Widget instances are then reordered to the archive's `sortOrder`.

A failure in step 4 or 5 (for example, the browser runs out of storage) can leave data partly restored. Importing the same archive again finishes the restore.

Version 1 archives have no widget tables. For them, the device keeps its own widget rows and its own `homeGridSeeded`/`widgetFoldersSeeded` values, so widget setup does not run twice.

After import, search indexing checks each file marked as indexed against the local index and queues the missing ones.

## Changing the format

- **Adding an optional field to a row or to settings:** no version bump. Old readers ignore it; new readers must default it when absent.
- **Adding a new JSON file or OPFS root, renaming, removing, or changing the meaning of anything:** bump `formatVersion`, keep reading every older version, and add an entry below.
- Add a test in `packages/web/test/settings/storageArchive.test.ts` for the new behavior.

## Version history

### Version 2

- Added `livestore/widget-definitions.json` and `livestore/widget-instances.json`.
- Entry names are flagged as UTF-8, and ZIP64 is used for large archives.
- `opfs/` entries outside `/files` and `/chat` are rejected on import.

### Version 1

- First version. Desktop widgets were not exported.
- Early version 1 archives stored model routing in a separate `livestore/model-routing.json`. Readers use it when `settings.json` has no `modelRouting`.
- Version 1 importers dropped some settings (assistant instructions, permissions, widget setup flags, and others). The current reader restores them from version 1 archives.
