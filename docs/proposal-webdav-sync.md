# Proposal: sync across devices through WebDAV

Status: proposal with a working demo. Nothing ships to users yet; sync is switched on per device in
Settings > Sync.

## Summary

Memora stores the whole workspace on one device. This proposal adds optional sync between a
person's own devices without Memora running a server or seeing their data:

- The app syncs its **LiveStore event log** as plain files in a WebDAV folder the person controls.
  The only thing it needs from the server is "create this file only if it does not exist".
- **File contents** (documents, recordings, videos, transcripts) go to object storage through a
  small provider API built on the storage's own multipart upload. Every major S3-compatible service
  offers the same multipart operations, so each provider is a thin adapter.
- The recommended server is a **small Cloudflare Worker backed by R2**, which each person deploys
  to their own Cloudflare account. It serves both: WebDAV for the event log, and R2 multipart upload
  for file contents. Any other WebDAV server that honors `If-None-Match: *` and sends CORS headers
  works for the event log.

The demo syncs folders, file records, widgets, and file contents between two browsers, including
two devices writing at the same moment and a 120 MiB video uploaded in 15 parts. Moving a device to
another server must be built before release. See [Roadmap](#roadmap).

## Goals

- A person's devices converge to the same workspace, including after offline edits.
- Their data lives in storage they own. Memora operates no sync server and holds no copies.
- Setup takes a few minutes for someone who can follow a deploy guide.
- Sync stays off unless the person turns it on, and Memora without sync behaves exactly as today.

Not goals for the first version: real-time collaboration between different people, sharing a
workspace with someone else, or browsing the synced folder from Finder or Explorer.

## Background: where Memora keeps data today

| Data                                                              | Where                                                  | Synced by this proposal              |
| ----------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------ |
| Workspace: folders, files, collections, Home Grid widgets, trash  | LiveStore synced events                                | Yes                                  |
| AI providers: name, base URL, API format, model list              | LiveStore synced events                                | Yes                                  |
| Settings: theme, language, model routing, permissions, onboarding | Synced settings table, one row per setting             | Yes, except three device-only fields |
| Provider API keys                                                 | `provider_credentials`, sealed by the credential vault | Passkey-sealed keys only             |
| Sidebar state, log collection switch, local model usage, UI state | Client document and client-only events                 | No, by design                        |
| File contents and transcripts                                     | OPFS paths referenced by file events                   | Yes, through object storage          |
| Thumbnails, `.meta.json` copies of file records                   | OPFS                                                   | Not yet                              |
| Search indexes, model caches, chat history                        | OPFS / IndexedDB                                       | No. Each device rebuilds them        |

LiveStore separates synced events (`Events.synced`) from client-only events (`Events.clientOnly`)
and client documents.

**Settings.** `settingEvents.settingsSet` commits a synced `v1.SettingsUpdated` event, and its
materializer writes one row per setting into `synced_settings`. A change on one device reaches the
others like any other event, and the reverse works the same way. When two devices change
different settings at the same time, both changes stay; when they change the same setting, the
later event wins on every device. The settings query merges the synced rows over this device's
document. Three fields describe the device rather than the person and stay in the device document
(`deviceSettingsSet`): `sidebarCollapsed`, `logCollectionEnabled`, and `localModelTokenUsage`. On
start, settings saved before this change are copied once into the synced table, skipping
defaults and settings another device has already synced. Model routing syncs too, so a device can
be routed to a local model it has not downloaded yet.

**API keys.** Keys are sealed by the credential vault (`docs/credential-vault.md`). A key sealed
with the passkey (`mv1.`) is saved with the synced `v2.ProviderCredentialSet`, because any device
with the same passkey (synced through iCloud Keychain or Google Password Manager) derives the same
key from the passkey's PRF output and can open it. A key sealed with the device key (`md1.`) or
still in plaintext is saved with the client-only `v1.ProviderCredentialSet` and stays on the
device. On a device that receives a passkey-sealed key, the existing "Your API keys are locked"
prompt asks for the passkey. Removing a key (`v2.ProviderCredentialDeleted`) removes it on every
device; the "lost passkey" flows remove keys on this device only.

Events from before API keys moved to client-only state still carry the key in old local logs: the
current schema drops the field when reading, but LiveStore pushes the stored JSON unchanged. The
sync backend removes `apiKey` from `v1.ProviderCreated` and `v1.ProviderUpdated` before uploading
(`withoutCredentials` in `webdavSync.ts`, covered by a test). Keys already copied anywhere else
should still be rotated, as `docs/credential-vault.md` notes.

## Architecture

```
 Device A (browser)                              Device B (browser)
┌──────────────────────────────┐                ┌──────────────────────────────┐
│ App UI ── commit / query     │                │ App UI ── commit / query     │
│ LiveStore leader worker      │                │ LiveStore leader worker      │
│   SQLite + event log         │                │   SQLite + event log         │
│   WebDAV sync backend ──┐    │                │    ┌── WebDAV sync backend   │
│ File sync loop (OPFS) ─┐│    │                │    │┌─ File sync loop (OPFS)  │
└────────────────────────┼┼────┘                └────┼┼────────────────────────┘
          contents       ││ event log      event log ││       contents
          (multipart)    ││ (WebDAV)        (WebDAV) ││       (multipart)
                         ▼▼                          ▼▼
                ┌──────────────────────────────────────────────┐
                │ Cloudflare Worker (Basic auth, CORS)         │
                │   WebDAV              ─► R2 <storeId>/events/│
                │   S3-shaped multipart ─► R2 <storeId>/files/ │
                └──────────────────────────────────────────────┘
```

The event log says what each file is and which version of its contents is current. The object
store holds the bytes. The two only meet in one field, the content key on the file record.

### Why sync the event log

| Option                                    | Problem                                                                                                                                                                                      |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Upload the SQLite database file           | Two devices that both changed it can only overwrite each other. The database is derived state, so it is the wrong thing to merge.                                                            |
| Mirror OPFS folders file by file          | Covers only file contents. Folders, collections, and widgets live in LiveStore, not OPFS.                                                                                                    |
| **Sync the LiveStore event log** (chosen) | LiveStore already orders, rebases, and replays events. It needs a backend that appends events in order and lists them, which takes one atomic primitive from the server: create-only writes. |

LiveStore's sync contract (`SyncBackend` in `@livestore/common`) has two operations:

- `push(batch)` appends events that continue the server's head. If another device got there first,
  it fails with `ServerAheadError`, and LiveStore pulls, rebases local events on top, and retries.
- `pull(cursor, { live })` streams events after a cursor and, when `live` is set, keeps streaming.

### Layout on the server

```
<url>/<storeId>/
  backend-id.txt              random id, written once
  events/
    000000000001.json         JSON array: one pushed batch, named by its first sequence number
    000000000004.json
    ...
```

`storeId` is `main` today. Separate workspaces would use separate folders.

### Protocol

**Push.** `PUT events/<first seqNum>.json` with `If-None-Match: *`.

- `201` means the batch is appended.
- `412 Precondition Failed` means another device already wrote a batch starting at that number. The
  backend returns `ServerAheadError` and LiveStore rebases.

This is a compare-and-swap because a device's upstream head always sits at the end of a whole batch
it pushed or pulled. Two devices that start from the same head compete for the same file name, and
the server lets exactly one of them create it.

**Pull.** `PROPFIND events/` with `Depth: 1`, keep the names greater than the cursor, then `GET`
them in order. WebDAV has no change notifications, so live pull repeats this every
`pollIntervalMs` (default 5 s). A failed poll marks the backend offline and is retried next tick.

**Setup**, before the first push or pull:

1. `MKCOL` the store folder and `events/`. `405` means it already exists.
2. Create `backend-id.txt` with `If-None-Match: *`, then read it back.
3. Write it again with `If-None-Match: *` and require `412`. A server that ignores the header would
   let devices silently overwrite each other's events, so the backend refuses to sync with it.
4. Compare the id with the one this device saw before. A different id means the folder was deleted
   or replaced. The worker sets `onBackendIdMismatch: "ignore"`: the device keeps its data and stops
   syncing. LiveStore's default would wipe the local store.

**Boot.** The worker uses `initialSyncOptions: { _tag: "Blocking", timeout: 5000 }`, so a new
device pulls the existing workspace before the app seeds its defaults. Without a server configured,
the backend answers the initial pull at once, and boot is not delayed.

### File contents

**Which version is current.** The file materializer stores a `contentKey` (and `transcriptKey`) on
each file record, computed from the event that last changed the contents:

```
files/<fileId>/content-<clientId>-<event timestamp>
files/<fileId>/transcript-<clientId>-<event timestamp>
```

`FileCreated`, a `FileUpdated` that carries `sizeBytes` or `storagePath` (every content writer
sends the new size; renames and moves do not), and `FileTranscribed` produce a new key. The key is
derived, not stored in the event, so every device computes the same key, existing data gets keys
without migration, and none of the ~15 places that write files had to change. A new version always
gets a new key, so objects are never overwritten and older versions stay on the server.

**Who moves the bytes.** Every 5 s the app compares each file record with what this device has:

- If the key contains this device's `clientId`, this device wrote those bytes and uploads them from
  OPFS. If this device has lost its copy (for example, after clearing storage), it downloads it
  like any other version.
- Versions written elsewhere download **in the background** when they are small (contents up to
  8 MiB, one upload part) and for transcripts. Documents, widget manifests, and the Today Tasks
  file are small, so they arrive without being opened.
- Larger contents download **when the file is opened**. Until then, the file shows a cloud icon
  after its name on the desktop and in the sidebar. Opening it shows a progress ring there instead,
  and the preview, editor, or page opens once the download finishes.
- A `404` means the other device has not uploaded yet; background downloads retry on the next
  pass. OPFS replaces a file only when the write completes, so a failed download leaves the old
  contents in place.
- **Purging** a file (emptying the trash) deletes every stored version under
  `<storeId>/files/<id>/` and the local copy on every device, like a WebDAV `DELETE`. Moving a file
  to the trash keeps everything, so it can be restored.

Uploads, background downloads, and purges run in one tab per browser, chosen with a Web Lock. Every
tab tracks which files are missing and can download a file the person opens there. Progress is kept
in OPFS as one marker file per key (`/sync/done/`, `/sync/uploads/`, `/sync/purged/`), so tabs never
overwrite each other's records, and an interrupted upload resumes after a reload.

**Provider API.** Everything above is provider-neutral. A provider implements seven operations:

```ts
interface BlobProvider {
  readonly partSize: number; // every part except the last
  createUpload(key, contentType): Promise<uploadId>;
  uploadPart(key, uploadId, partNumber, body: Blob): Promise<{ partNumber; etag }>;
  completeUpload(key, uploadId, parts): Promise<void>;
  abortUpload(key, uploadId): Promise<void>;
  download(key): Promise<ReadableStream | null>; // null while the object does not exist
  deletePrefix(prefix): Promise<void>; // every object under a `.../` prefix
}
```

Files are always uploaded as a multipart upload; a small file is one part. A provider throws
`UploadGoneError` when the store no longer knows an upload (R2 drops unfinished uploads after 7
days), and the uploader starts that file over once.

**First provider: Worker + R2.** The Worker exposes R2's multipart upload with S3-shaped requests
and JSON bodies, behind the same Basic auth as WebDAV:

| Request                                  | Meaning                                        |
| ---------------------------------------- | ---------------------------------------------- |
| `POST <key>?uploads`                     | Start an upload, returns `{ uploadId }`        |
| `PUT <key>?uploadId=…&partNumber=N`      | Store one part, returns `{ partNumber, etag }` |
| `POST <key>?uploadId=…` with `{ parts }` | Complete the upload                            |
| `DELETE <key>?uploadId=…`                | Abort it                                       |
| `GET` / `HEAD <key>`                     | Read the object                                |
| `DELETE <prefix>/`                       | Delete everything under the prefix             |

The browser never holds R2 credentials, and the bucket needs no CORS rules. Parts are 8 MiB:
Cloudflare limits a request body to 100 MB on the Free and Pro plans, R2 needs every part except
the last to be the same size and at least 5 MiB, and 10,000 parts allow files up to about 80 GB.

**Other providers.** The same six operations exist on AWS S3, Google Cloud Storage (XML API),
Backblaze B2, Alibaba Cloud OSS, Tencent COS, and MinIO. Azure Blob Storage has no S3 API; it
needs its own block-list adapter or a gateway. A direct S3 provider would also need:

- SigV4 request signing in the browser (a small library) or a server that issues presigned URLs;
- a bucket CORS rule that exposes the `ETag` header, because completing an upload needs each
  part's ETag and browsers hide that header otherwise;
- a lifecycle rule that aborts unfinished uploads. AWS S3 and Google Cloud Storage keep and bill
  them until they are aborted.

Part-size rules differ (S3 at least 5 MiB, OSS at least 100 KB, COS at least 1 MB), so equal 8 MiB
parts work on all of them.

### Server options

| Server                                               | Create-only writes                    | CORS from the app                  | Who runs it                      | Notes                                                                     |
| ---------------------------------------------------- | ------------------------------------- | ---------------------------------- | -------------------------------- | ------------------------------------------------------------------------- |
| **Cloudflare Worker + R2** (recommended)             | Yes: R2 `put()` with `onlyIf`, atomic | Yes, configured in the Worker      | The person, in their own account | Free tier covers personal use; one-click deploy                           |
| Apache `mod_dav`, nginx-dav, self-hosted             | Apache: verified. Others: untested    | Needs config                       | The person                       | Good for people who already run a server                                  |
| Nextcloud, NAS (Synology, QNAP), hosted WebDAV       | Untested                              | Usually not, needs a reverse proxy | The person / a provider          | Most familiar to users, least predictable                                 |
| LiveStore's own Cloudflare backend (Durable Objects) | Not needed: one object orders pushes  | Yes                                | The person or Memora             | Push instead of polling, but a different protocol: no "any WebDAV" option |

The Worker is the default because it gives a guaranteed atomic write, removes CORS trouble, and
keeps the data in the person's account. Keeping the protocol plain WebDAV leaves the door open to
other servers without changing the app.

## The demo

### What is implemented

App side (`packages/web`):

| File                                                                                      | What it does                                                                                                                                   |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/livestore/webdavSync.ts`                                                             | The LiveStore sync backend: setup and server check, push with create-only `PUT`, pull with `PROPFIND` + `GET`, polling, offline state          |
| `src/workers/livestore.worker.ts`                                                         | Registers the backend, blocks boot on the first pull (5 s cap), never wipes local data on a backend id change                                  |
| `src/livestore/store.ts`                                                                  | Reads the sync config and passes it to the worker as `syncPayload`; `saveWebdavSyncPayload` saves it and restarts LiveStore                    |
| `src/lib/widgets/seedHomeGrid.ts`                                                         | Fix found by the demo: skips seeding when built-in widgets already arrived from another device                                                 |
| `test/livestore/webdavSync.test.ts`                                                       | Conflict, refusal of servers that ignore `If-None-Match`, and listing parser, against an in-memory fake server                                 |
| `src/livestore/file.ts`                                                                   | `contentKey` and `transcriptKey` on file records, derived by the materializers                                                                 |
| `src/lib/sync/blobProvider.ts`                                                            | The provider API and `createBlobProvider`, which picks a provider from the sync config                                                         |
| `src/lib/sync/providers/r2Worker.ts`                                                      | The Worker + R2 provider                                                                                                                       |
| `src/lib/sync/blobSync.ts`                                                                | Multipart upload with resume; background uploads, small downloads and purges; download on open (`ensureFileLocal`); per-file status for the UI |
| `src/app/layouts/AppLayout.tsx`                                                           | Starts file sync when sync is configured                                                                                                       |
| `src/components/library/FileSyncBadge.tsx`                                                | Cloud icon for contents on another device, progress ring while downloading                                                                     |
| `src/components/desktop/Desktop.tsx`, `DesktopItem.tsx`, `src/app/components/Sidebar.tsx` | Show the badge after file names; download before opening a file that is not here                                                               |
| `test/sync/blobSync.test.ts`                                                              | Part splitting, empty files, resume after a closed tab, restart after an expired upload, against an in-memory fake provider                    |

Server side (`packages/webdav-worker`):

| File             | What it does                                                                                                                                                                                             |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/index.ts`   | WebDAV subset on Workers: `OPTIONS`, `MKCOL`, `PUT` (conditional), `GET`, `HEAD`, `PROPFIND` (depth 0 or 1), plus R2 multipart upload. Basic auth, CORS. Refuses every request until credentials are set |
| `wrangler.jsonc` | Worker name, R2 binding (bucket created on first deploy), allowed origin                                                                                                                                 |
| `README.md`      | Deploy guide                                                                                                                                                                                             |

R2 has no folders, so the Worker stores a collection as an empty `<path>/` marker object and lists
children with `delimiter: "/"`. It has no `DELETE`, `MOVE`, `COPY`, or `LOCK`; the app does not use
them.

### What was verified

Apache 2.4.62 `mod_dav_fs` on macOS (2026-10-14):

- Apache returns `201` then `412` for two create-only `PUT`s to the same path.
- Device A pushed its first 22 events. A wiped device B pulled them at boot, with no duplicate
  folders or widgets.
- A folder created on either device appeared on the other within one poll.
- Both devices created a folder in the same poll window. A wrote `000000000025.json` (`201`), B got
  `412` for that name, rebased, and wrote `000000000026.json`. Both ended with the same 8 folders,
  and the 26 events on the server were contiguous.

Cloudflare Worker with local R2 under `wrangler dev`, Wrangler 4.151 (2026-10-15):

- `MKCOL` returns `201` then `405`. A second create-only `PUT` returns `412` and keeps the first body.
  `PROPFIND` lists files and sub-collections, and a missing path returns `404`.
- With credentials configured, a request without or with wrong credentials gets `401`, and a CORS
  preflight gets `200`. Without credentials configured, every request gets `503`.
- The same two-device test: A pushed, B pulled with no duplicates. Racing writes produced
  `000000000023.json` `201`, then `412` for the same key, then `000000000024.json` `201`. The bucket
  held 24 contiguous events, and both devices showed the same 6 folders.

Settings and API keys through the same Worker (2026-10-15, after merging `main`):

- On start, B's earlier onboarding settings were migrated into the synced table and appeared on A.
- A switched to the dark theme; B's page turned dark within about a second, both through a
  committed event and through Settings > Appearance.
- In the same poll window, B switched to the light theme and A set the editor font size to 20.
  Both devices ended with the light theme and size 20.
- A saved a passkey-sealed key (`mv1.`) and a device-sealed key (`md1.`). B received the provider
  list and only the `mv1.` key, and showed "Your API keys are locked". The event files on the
  server contained the `mv1.` value and not the `md1.` one. A removed the passkey-sealed key; B
  removed it and the prompt closed about 2 s later. Unlocking with a real passkey on a second
  device was not tested, because the test browser has no authenticator.

File contents through the same Worker and local R2 (2026-10-15):

- curl: a two-part upload (5 MiB + 1,234 bytes) completes, and the downloaded object has the same
  sha256 as the source. An empty file uploads as one empty part. An unknown upload id gets `409`,
  abort gets `204`, and a missing object gets `404`.
- Device A created a Markdown document and a 120 MiB video. The video went up as 15 parts of
  8 MiB. With every file downloading in the background (the first version), a wiped device B had
  both files 8 s after boot, with the same sha256 as on A, and opened the document in the editor.
- With download on open: a wiped device B downloaded every small file in the background (including
  versions it had written before losing its storage). The video showed the cloud icon on the
  desktop and in the sidebar. Double-clicking it showed the progress ring, which moved through
  every percent from 0 to 100; the preview opened when it finished, the cloud disappeared, and the
  file's sha256 matched A's.
- A purged a document. About 2 s later B's copy was gone, and its folder on the server returned
  `404`. Other files were untouched.
- B edited the document. A had the new text 6 s later. Both versions remain on the server under
  different keys.
- The end-to-end test found a bug the curl tests missed: CORS preflights for multipart URLs were
  routed to the multipart handler and rejected. Fixed in the Worker.

The Worker has not been deployed to a real Cloudflare account yet, so production R2 behavior is
taken from Cloudflare's documentation, not measured. Resuming an interrupted upload is covered by
unit tests, not by a browser test.

### Try it locally

```bash
vp run -t @memora/web#build
vp run @memora/webdav-worker#dev
vp run @memora/web#dev
```

`webdav-worker#dev` starts the Worker on port 8787 with the user `dev` and password `dev`. Use two
origins as two devices, because each origin has its own OPFS: `http://localhost:9003` and
`http://[::1]:9003`. In each, open **Settings > Sync**, enter `http://localhost:8787`, `dev`, and
`dev`, and choose **Turn on sync**. Passkeys need a domain, so testing API key sync takes two
browser profiles on `http://localhost:9003` instead.

In development, `__debugLiveStore.main` is the store, handy for checking state from the console.

### Settings > Sync

`src/components/settings/SettingsSyncSection.tsx`:

- **Test connection** lists the server root (wrong credentials and non-WebDAV servers get their
  own message), then writes a probe file twice with `If-None-Match: *` and requires `412` the
  second time, then deletes it. **Turn on sync** and **Save changes** run the same test first.
- Saving stores the config and restarts LiveStore (`saveWebdavSyncPayload` in `store.ts`): it
  posts LiveStore's own shutdown message on `livestore.shutdown.<storeId>`, which makes the shared
  worker drop the leader and the config it started with, and every open tab reloads. No tab has
  to be closed by hand.
- With sync on, the section shows the connection state from LiveStore's `networkStatus` and how
  many files are on other devices but not here.
- If the server is not the one this device synced with before, the section says sync is paused
  (see [Things to watch](#things-to-watch)).

The config, including the password, stays in `localStorage`: the store needs it before it starts.

## Advantages

- **No Memora server.** The person's devices talk to storage the person owns. Memora has no
  accounts to run, no data to protect, and no hosting bill.
- **Small client.** About 250 lines on top of LiveStore, which already does ordering, rebasing,
  offline queues, and replay.
- **Open protocol.** Files on the server are plain JSON in a documented layout. People can back up,
  inspect, or move their data with any WebDAV or R2 tool, and other servers work without app
  changes.
- **Offline first.** Devices work offline and catch up when they reconnect; nothing waits on the
  network except the first boot of a new device (capped at 5 s).
- **Safe failure modes.** The backend refuses servers that would let writes overwrite each other,
  and a reset server folder stops sync instead of wiping local data.
- **Cheap.** Personal use fits Cloudflare's free tier (see [Cost](#cost)).

## Things to watch

### Privacy

1. **The privacy promise changes.** Memora today promises that data stays on the device. With sync
   on, it is copied to the person's chosen server. The settings screen must say so, sync must stay
   off by default, and any "data never leaves your device" wording in the app and the dissertation
   needs a "unless you turn on sync" qualifier.
2. **Data on the server is plain text.** Events include file names and `indexSummary`, which
   contains document text. End-to-end encryption is not planned: the server is one the person
   deploys to their own account, and the docs tell them to use only a server they control. API
   keys are the exception: only passkey-sealed keys sync.
3. **The server password sits in `localStorage`.** The store needs the config before it starts, so
   it can't live in LiveStore. Seal it with the credential vault's device key before release.

### Correctness

4. **Fixed-id inserts are not idempotent.** The demo found that a new device re-created the
   built-in widgets (`builtin:calendar`) and the duplicate insert shut the store down. The seeding
   guard plus the blocking first pull fix the fresh-device case. A device that used Memora offline
   and seeded before turning sync on can still collide: fixed-id rows crash, random-id seed folders
   duplicate. Make fixed-id materializers use `onConflict("id", "ignore")`, and decide how a device
   with existing local data joins (merge, or start empty).
5. **App versions must match closely enough.** If a newer device writes an event type an older
   device does not know, the older device cannot materialize it. Write the minimum app version into
   the store folder and refuse to sync, with an "update Memora" message, when the local app is older.
6. **Derived events sync too.** `FileIndexed` describes one device's processing, and each device
   indexes on its own anyway. `FileIndexed` was 8 of the first 22 events
   in the demo. Make them client-only.
7. **A device can't move to another server yet.** LiveStore remembers the id of the first server
   a device synced with, and never re-uploads events that server already confirmed. Pointing the
   device at a different (or reset) server makes the ids differ; the worker then stops syncing
   rather than wipe local data (`onBackendIdMismatch: "ignore"`), and Settings > Sync shows
   "Paused". The app keeps the same check in `localStorage` (`memora.syncBackendId`) because the
   main thread can't see the leader's. Moving needs one of: re-uploading this device's whole log
   to the new server under the old id, or resetting this device and loading the workspace from the
   new server. File transfer records are kept per server, so they start fresh either way.
8. **The event log keeps deleted metadata.** Purging a file deletes its contents everywhere, but
   its events (name, `indexSummary`) stay in the log. Removing them needs a snapshot of current
   state and a rewrite of the log.
9. **A concurrent edit can lose a version.** When two devices edit the same document, the later
   event wins on both devices. The losing version survives on the server only if its device
   uploaded it before downloading the winner. Deferred: conflicts are rare for one person's
   devices. The fix is to upload any unsent local version before overwriting the file.
10. **Not every way of opening a large file downloads it yet.** The desktop (including previews
    opened from search) and the sidebar download first. Other paths read OPFS directly and fail for
    a large file that is not here, for example links inside documents and the agent's file tools.
    Media also downloads whole before playing; streaming by range would let long recordings start
    sooner.
11. **Some local files are not synced.** Thumbnails and the `.meta.json` copies of file records stay
    on the device that made them. (The "Created Unknown" in the editor footer was unrelated: the
    editor received `Date` values typed as numbers and treated them as invalid on every device.
    Fixed in `MarkdownDocumentEditor.tsx`.)

### Operations

12. **Third-party WebDAV servers vary.** Most do not send CORS headers, and `If-None-Match` support
    is untested outside Apache. The backend refuses servers that ignore it, which is safe but may
    surprise people. Test Nextcloud and Synology before advertising them.
13. **A server that loses data is a problem.** If the bucket is deleted, devices stop syncing (they
    keep their data) and show "Paused". Recovering is the same work as moving to another server
    (item 7).
14. **Every multipart request is preflighted.** Browsers cache CORS preflights per URL, and each
    part has its own URL, so a 120 MiB upload (15 parts, plus start and finish) costs 34 requests instead of 17. Serving the app
    and the Worker from the same site would remove them.

### Cost

Each poll costs one Worker request and one R2 list (a Class A operation). With the app open and a
5 s interval, that is 720 polls per device-hour.

| Allowance (free tier)             | Device-hours of open app it covers |
| --------------------------------- | ---------------------------------- |
| Workers: 100,000 requests per day | about 138 per day                  |
| R2 Class A: 1 million per month   | about 1,390 per month              |

Three devices open 8 hours a day use about 720 device-hours a month, which fits. Heavier use runs
out of free Class A operations first. The fix in the next section moves polling to Class B
operations, which have 10 times the allowance. Stored events are small; file contents dominate
storage. R2 gives 10 GB free, then $0.015 per GB-month, with no egress fees. Each uploaded part is
a Class A operation (about 12 per 100 MB), and each download is one Class B operation.

## Scaling and extension

**Polling without listing.** The next batch must start at the current head + 1, so a live poll can
`GET events/<head+1>.json` instead of listing the folder. A `404` means nothing new. This turns each
poll into one Class B operation, keeps the cost flat as history grows, and works on any WebDAV
server. Listing stays useful for a new device's first pull, where it lets downloads run in parallel.

**Snapshots.** A new device replays every event. Periodically write `snapshots/<seqNum>.json` (the
materialized state or a compacted log) so new devices start from a snapshot and replay only what
came after. Snapshots also make purging deleted data possible.

**More providers.** Add an S3 provider (AWS S3, B2, OSS, COS, MinIO) behind the same API, with the
signing, CORS, and lifecycle requirements listed under [File contents](#file-contents). Only the
provider module and the config change.

**Version history.** Old document versions already stay on the server under their own keys. Listing
them gives a "previous versions" view, and a retention rule (keep the last N, or the last 30 days)
bounds storage.

**More workspaces.** Each workspace is a separate `storeId` folder, so several workspaces share one
server without changes.

**Live updates.** If 5 s polling feels slow, the Worker can add a WebSocket or a Durable Object that
notifies devices of new batches, while WebDAV stays the storage protocol. Only the Worker path gets
this; generic WebDAV servers keep polling.

**General WebDAV access.** Adding `DELETE`, `MOVE`, `COPY`, and `LOCK` to the Worker would let
people mount the folder in Finder or Explorer. The event batches are not meant to be read by hand,
so the value is limited to backups.

## Deployment

The Worker is a self-contained package with no workspace dependencies, so it deploys on its own.

**One click.** After the Worker is merged to `main` (the repository is public), this button clones
`packages/webdav-worker` into the person's GitHub account and deploys it. Wrangler creates the R2
bucket automatically because the config names none:

```
https://deploy.workers.cloudflare.com/?url=https://github.com/MaxtuneLee/memora/tree/main/packages/webdav-worker
```

They then set `DAV_USERNAME` and `DAV_PASSWORD` as secrets in the Cloudflare dashboard. Until they
do, the Worker answers every request with `503`, so a half-finished deploy never exposes a bucket.
The button flow has not been tried yet; check it after merging.

**Command line.**

```bash
cd packages/webdav-worker
pnpm exec wrangler deploy
pnpm exec wrangler secret put DAV_USERNAME
pnpm exec wrangler secret put DAV_PASSWORD
```

Then, in Memora, enter `https://memora-webdav.<account>.workers.dev` with those credentials. To
refuse other sites, set `ALLOWED_ORIGIN` to `https://app.memora.im` in `wrangler.jsonc` or the
dashboard. A custom domain is optional.

## Package layout

- **The server is its own package, `packages/webdav-worker`.** It runs in a different runtime
  (Cloudflare `workerd`), has its own tools (Wrangler), and has its own release cycle: people
  deploy it once and rarely update it. The deploy button also copies one folder into a new
  repository, so the package must build without the monorepo. It knows nothing about Memora's
  protocol; it is a WebDAV server.
- **The client stays in `packages/web` for now**, in `src/livestore/webdavSync.ts` (event log) and
  `src/lib/sync/` (file contents and providers). It has one consumer, it is tied to the app's
  LiveStore schema and version, and the client and server share no code: their contract is WebDAV,
  the multipart requests, and the layout in this document. Moving it to a package now would add
  structure without a second user.
- **Extract the client into `packages/sync` when a second consumer appears**, for example a
  command-line backup and restore tool. The provider API and
  `uploadBlob` already avoid LiveStore, so they would move as they are.

## Roadmap

| Phase | Work                                                                                                                                                                                                        | Done when                                                                                                              |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 0     | This demo                                                                                                                                                                                                   | Done: two devices converge through Apache and the Worker, including racing writes                                      |
| 1     | File contents, download on open, and purge: done in the demo. Still to do: download from document links and the agent's file tools, fixed-id materializers made idempotent, derived events made client-only | Every way of opening a file works on a device that does not have it; a device with local data joins without duplicates |
| 2     | Moving a device to another server; minimum app version check; seal the server password                                                                                                                      | A device can change servers without losing data                                                                        |
| 3     | Polling by `GET` of the next batch; snapshots for new devices                                                                                                                                               | Poll cost stays flat as history grows; a new device's first sync is bounded                                            |
| 4     | Deploy the Worker for real; try the deploy button; test Nextcloud and Synology; write the user guide                                                                                                        | A non-developer sets up sync from the guide                                                                            |

## Open questions

1. Is 8 MiB the right limit for background downloads, or should it be a setting?
2. Should Memora offer a hosted Worker for people who do not want a Cloudflare account? That
   changes the "Memora runs no server" goal.
3. How should a device with an existing workspace join a synced one: merge, or replace its local
   workspace?

## Appendix: Apache as a test server

On macOS, the built-in Apache works for testing. Save as `httpd.conf`, replacing `/tmp/memora-dav`,
and start it with `/usr/sbin/httpd -f "$PWD/httpd.conf" -k start`:

```apache
ServerRoot "/usr"
Listen 127.0.0.1:8090
PidFile "/tmp/memora-dav/httpd.pid"
ErrorLog "/tmp/memora-dav/error.log"
LoadModule mpm_prefork_module libexec/apache2/mod_mpm_prefork.so
LoadModule authz_core_module libexec/apache2/mod_authz_core.so
LoadModule unixd_module libexec/apache2/mod_unixd.so
LoadModule headers_module libexec/apache2/mod_headers.so
LoadModule alias_module libexec/apache2/mod_alias.so
LoadModule dav_module libexec/apache2/mod_dav.so
LoadModule dav_fs_module libexec/apache2/mod_dav_fs.so
DavLockDB "/tmp/memora-dav/davlock"
Alias /dav "/tmp/memora-dav/data"
<Directory "/tmp/memora-dav/data">
  Dav On
  Require all granted
  Header always set Access-Control-Allow-Origin "*"
  Header always set Access-Control-Allow-Methods "GET, PUT, MKCOL, PROPFIND, OPTIONS"
  Header always set Access-Control-Allow-Headers "Authorization, Content-Type, Depth, If-None-Match"
  Header always set Access-Control-Max-Age "86400"
</Directory>
```

Run `mkdir -p /tmp/memora-dav/data` first, and use `{"url": "http://127.0.0.1:8090/dav"}` as the
sync config. This server has no authentication; use it only on your own machine.

Also seen during the demo, not investigated: a fresh install logs `Error parsing SQL query result
(settings:document)`. It appeared on both test devices; whether it also happens without sync was
not checked.
