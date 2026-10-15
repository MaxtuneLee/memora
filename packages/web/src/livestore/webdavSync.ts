import {
  BackendIdMismatchError,
  IsOfflineError,
  ServerAheadError,
  SyncBackend,
  UnknownError,
} from "@livestore/common";
import { EventSequenceNumber, type LiveStoreEvent } from "@livestore/common/schema";
import { Effect, Option, Schedule, Stream, SubscriptionRef } from "@livestore/utils/effect";

/**
 * LiveStore sync backend that keeps the eventlog in a WebDAV folder.
 *
 * Layout under `<url>/<storeId>/`:
 * - `backend-id.txt`: random id written once; a different id means the folder was reset.
 * - `events/<first seqNum, 12 digits>.json`: one JSON array per pushed batch.
 *
 * A push creates its batch file with `If-None-Match: *`. If another device already wrote a batch
 * starting at the same sequence number, the server answers 412 and LiveStore rebases on the next
 * pull. WebDAV has no change notifications, so live pull polls the events folder.
 */

export type WebdavSyncPayload = {
  url: string;
  username?: string;
  password?: string;
  pollIntervalMs?: number;
  /** Where file contents go. Defaults to `r2-worker`, the same Worker as `url`. */
  blobProvider?: "r2-worker";
};

const DEFAULT_POLL_INTERVAL_MS = 5000;
const BATCH_FILE = /(\d{12})\.json$/;
const HREF = /<(?:[\w-]+:)?href[^>]*>([^<]+)<\/(?:[\w-]+:)?href>/gi;

const batchName = (firstSeqNum: number): string => `${String(firstSeqNum).padStart(12, "0")}.json`;

// Provider events from before API keys moved to device-only state still carry the key in the
// local log. The schema drops it when reading, but LiveStore pushes the stored JSON as it is.
const LEGACY_CREDENTIAL_EVENTS = new Set(["v1.ProviderCreated", "v1.ProviderUpdated"]);

export const withoutCredentials = (
  event: LiveStoreEvent.Global.Encoded,
): LiveStoreEvent.Global.Encoded => {
  if (!LEGACY_CREDENTIAL_EVENTS.has(event.name)) return event;
  if (typeof event.args !== "object" || event.args === null || !("apiKey" in event.args)) {
    return event;
  }
  const { apiKey: _apiKey, ...args } = event.args as Record<string, unknown>;
  return { ...event, args };
};

export const parseWebdavSyncPayload = (payload: unknown): WebdavSyncPayload | undefined => {
  if (typeof payload !== "object" || payload === null) return undefined;
  const { url, username, password, pollIntervalMs, blobProvider } = payload as Record<
    string,
    unknown
  >;
  if (typeof url !== "string" || !/^https?:\/\//.test(url)) return undefined;
  // The payload crosses into the worker as JSON, so leave absent fields out instead of `undefined`.
  return {
    url: url.replace(/\/+$/, ""),
    ...(typeof username === "string" && { username }),
    ...(typeof password === "string" && { password }),
    ...(typeof pollIntervalMs === "number" &&
      Number.isFinite(pollIntervalMs) &&
      pollIntervalMs >= 1000 && { pollIntervalMs }),
    ...(blobProvider === "r2-worker" && { blobProvider }),
  };
};

/** Batch start numbers found in a PROPFIND multistatus body, ascending. */
export const parseBatchListing = (xml: string): number[] =>
  [...xml.matchAll(HREF)]
    .map((match) => BATCH_FILE.exec(decodeURIComponent(match[1]?.trim() ?? ""))?.[1])
    .filter((name): name is string => name !== undefined)
    .map(Number)
    .sort((a, b) => a - b);

export const basicAuthHeaders = (config: WebdavSyncPayload): Record<string, string> =>
  config.username !== undefined
    ? { Authorization: `Basic ${btoa(`${config.username}:${config.password ?? ""}`)}` }
    : {};

export type ServerCheck = { ok: true } | { ok: false; message: string };

/**
 * Checks a server before sync is turned on: that it answers, accepts the credentials, and refuses
 * to overwrite a file created with `If-None-Match: *`, which the sync protocol depends on.
 */
export const checkWebdavServer = async (config: WebdavSyncPayload): Promise<ServerCheck> => {
  const headers = basicAuthHeaders(config);
  try {
    const listing = await fetch(`${config.url}/`, {
      method: "PROPFIND",
      headers: { ...headers, Depth: "0" },
    });
    if (listing.status === 401 || listing.status === 403) {
      return { ok: false, message: "The username or password is wrong." };
    }
    if (listing.status === 503) {
      return { ok: false, message: "The server isn't set up yet. Set its username and password." };
    }
    if (listing.status !== 207) {
      return {
        ok: false,
        message: `This doesn't look like a WebDAV server (it answered ${listing.status}).`,
      };
    }

    const probeUrl = `${config.url}/.memora-write-check-${crypto.randomUUID()}`;
    const put = () =>
      fetch(probeUrl, { method: "PUT", headers: { ...headers, "If-None-Match": "*" }, body: "" });
    const first = await put();
    const second = await put();
    await fetch(probeUrl, { method: "DELETE", headers }).catch(() => undefined);
    if (!first.ok) {
      return {
        ok: false,
        message: `Memora can't write to this server (it answered ${first.status}).`,
      };
    }
    if (second.status !== 412) {
      return {
        ok: false,
        message:
          "This server can't protect a file from being overwritten, so devices could erase each other's changes. Use the Memora Worker or another server that supports If-None-Match.",
      };
    }
    return { ok: true };
  } catch {
    return {
      ok: false,
      message:
        "Memora can't reach the server. Check the address, and that the server accepts requests from this site.",
    };
  }
};

const BACKEND_ID_KEY = "memora.syncBackendId";

/**
 * Mirrors LiveStore's own check from the main thread, which cannot see the leader's: the first
 * server id this device sees is remembered, and a different id later means the server was reset
 * or replaced. LiveStore then stops syncing events (see `onBackendIdMismatch`).
 */
export const verifyBackendId = async (
  config: WebdavSyncPayload,
  storeId: string,
): Promise<"unknown" | "same" | "changed"> => {
  try {
    const response = await fetch(`${config.url}/${encodeURIComponent(storeId)}/backend-id.txt`, {
      headers: basicAuthHeaders(config),
    });
    if (!response.ok) return "unknown"; // Not created yet; the sync backend creates it.
    const id = (await response.text()).trim();
    const known = localStorage.getItem(BACKEND_ID_KEY);
    if (known === null) localStorage.setItem(BACKEND_ID_KEY, id);
    return known === null || known === id ? "same" : "changed";
  } catch {
    return "unknown";
  }
};

export const makeWebdavSyncBackend: SyncBackend.SyncBackendConstructor = ({ storeId, payload }) =>
  Effect.gen(function* () {
    const config = parseWebdavSyncPayload(payload);
    // Without a server, report "connected" and answer the initial pull with an empty page so the
    // blocking initial sync finishes at once. Pushes never complete, so local events stay pending
    // and are uploaded once a server is configured.
    const isConnected = yield* SubscriptionRef.make(!config);
    const metadata = {
      name: "webdav",
      description: config ? config.url : "WebDAV sync (not configured)",
    };

    if (!config) {
      return SyncBackend.of({
        connect: Effect.void,
        pull: () => Stream.concat(Stream.make(SyncBackend.pullResItemEmpty()), Stream.never),
        push: () => Effect.never,
        ping: Effect.void,
        isConnected,
        metadata,
        supports: { pullPageInfoKnown: false, pullLive: true },
      });
    }

    const backendIdHelper = yield* SyncBackend.makeBackendIdHelper;
    const storeUrl = `${config.url}/${encodeURIComponent(storeId)}`;
    const eventsUrl = `${storeUrl}/events/`;
    const backendIdUrl = `${storeUrl}/backend-id.txt`;
    const authHeader = basicAuthHeaders(config);
    const request = (
      method: string,
      url: string,
      init: { headers?: Record<string, string>; body?: string } = {},
    ) =>
      Effect.tryPromise({
        try: () =>
          fetch(url, { method, headers: { ...authHeader, ...init.headers }, body: init.body }),
        catch: (cause) => new IsOfflineError({ cause }),
      }).pipe(
        Effect.tap(() => SubscriptionRef.set(isConnected, true)),
        Effect.tapError(() => SubscriptionRef.set(isConnected, false)),
      );

    const fail = (what: string, response: Response) =>
      new UnknownError({
        cause: new Error(`WebDAV ${what} failed: ${response.status} ${response.statusText}`),
      });

    const readText = (url: string) =>
      Effect.gen(function* () {
        const response = yield* request("GET", url);
        if (!response.ok) return yield* fail(`GET ${url}`, response);
        return yield* Effect.promise(() => response.text());
      });

    const createOnly = (url: string, body: string, contentType: string) =>
      request("PUT", url, { headers: { "If-None-Match": "*", "Content-Type": contentType }, body });

    const mkcol = (url: string) =>
      Effect.gen(function* () {
        const response = yield* request("MKCOL", url);
        // 405: already exists.
        if (!response.ok && response.status !== 405) return yield* fail(`MKCOL ${url}`, response);
      });

    const setup = Effect.gen(function* () {
      yield* mkcol(`${storeUrl}/`);
      yield* mkcol(eventsUrl);

      const created = yield* createOnly(backendIdUrl, crypto.randomUUID(), "text/plain");
      if (!created.ok && created.status !== 412) return yield* fail("PUT backend-id.txt", created);
      const backendId = (yield* readText(backendIdUrl)).trim();

      // Every push relies on create-only writes. A server that ignores `If-None-Match: *` would
      // silently let devices overwrite each other's events, so refuse to sync with it.
      const probe = yield* createOnly(backendIdUrl, backendId, "text/plain");
      if (probe.status !== 412) {
        return yield* new UnknownError({
          cause: new Error(
            "WebDAV server ignores If-None-Match: * on PUT; sync is unsafe on this server",
          ),
        });
      }

      const known = backendIdHelper.get();
      if (Option.isSome(known) && known.value !== backendId) {
        return yield* new BackendIdMismatchError({ expected: known.value, received: backendId });
      }
      yield* backendIdHelper.lazySet(backendId);
    });

    let ready = false;
    const ensureReady = Effect.suspend(() =>
      ready ? Effect.void : setup.pipe(Effect.tap(() => Effect.sync(() => (ready = true)))),
    );

    // ponytail: lists the whole events folder on every poll. Shard folders by seqNum range (or
    // compare the folder's ETag first) once a store holds thousands of batches.
    const listBatches = Effect.gen(function* () {
      const response = yield* request("PROPFIND", eventsUrl, {
        headers: { Depth: "1", "Content-Type": "application/xml" },
        body: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/></d:prop></d:propfind>',
      });
      if (response.status !== 207) return yield* fail("PROPFIND events", response);
      return parseBatchListing(yield* Effect.promise(() => response.text()));
    });

    // ponytail: assumes the cursor sits on a batch boundary, which holds because a device's
    // upstream head always comes from a whole pushed or pulled batch.
    const pullAfter = (after: number, emitWhenEmpty: boolean) =>
      Effect.gen(function* () {
        yield* ensureReady;
        const starts = (yield* listBatches).filter((start) => start > after);
        const batches = yield* Effect.forEach(starts, (start) =>
          readText(`${eventsUrl}${batchName(start)}`).pipe(
            Effect.flatMap((text) =>
              Effect.try({
                try: () => JSON.parse(text) as LiveStoreEvent.Global.Encoded[],
                catch: (cause) => new UnknownError({ cause }),
              }),
            ),
          ),
        );
        const items: SyncBackend.PullResItem[] = batches.map((events, index) => ({
          batch: events.map((eventEncoded) => ({ eventEncoded, metadata: Option.none() })),
          pageInfo:
            index === batches.length - 1
              ? SyncBackend.pageInfoNoMore
              : SyncBackend.pageInfoMoreUnknown,
        }));
        if (items.length === 0 && emitWhenEmpty) items.push(SyncBackend.pullResItemEmpty());
        return items;
      }).pipe(Stream.fromIterableEffect);

    return SyncBackend.of({
      // A backend id mismatch is reported by the next pull or push.
      connect: ensureReady.pipe(Effect.catchTag("BackendIdMismatchError", () => Effect.void)),
      ping: request("OPTIONS", `${storeUrl}/`).pipe(Effect.asVoid),
      isConnected,
      metadata,
      supports: { pullPageInfoKnown: false, pullLive: true },
      pull: (cursor, options) => {
        let after = Option.match(cursor, {
          onNone: () => EventSequenceNumber.Client.ROOT.global as number,
          onSome: (value) => value.eventSequenceNumber as number,
        });
        if (options?.live !== true) return pullAfter(after, true);

        const trackCursor = (item: SyncBackend.PullResItem) =>
          Effect.sync(() => {
            const last = item.batch.at(-1);
            if (last) after = last.eventEncoded.seqNum;
          });
        let first = true;
        return Stream.suspend(() => {
          const emitWhenEmpty = first;
          return pullAfter(after, emitWhenEmpty).pipe(
            Stream.tap(trackCursor),
            Stream.onDone(() => Effect.sync(() => (first = false))),
          );
        }).pipe(
          // A failed poll counts as being offline; try again on the next tick.
          Stream.catchTag("IsOfflineError", () => Stream.empty),
          Stream.catchTag("UnknownError", (error) =>
            Stream.fromEffect(Effect.logWarning(error)).pipe(Stream.drain),
          ),
          Stream.repeat(Schedule.spaced(config.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS)),
        );
      },
      push: (batch) =>
        Effect.gen(function* () {
          yield* ensureReady;
          const firstSeqNum = batch[0]?.seqNum;
          if (firstSeqNum === undefined) return;
          const response = yield* createOnly(
            `${eventsUrl}${batchName(firstSeqNum)}`,
            JSON.stringify(batch.map(withoutCredentials)),
            "application/json",
          );
          if (response.status === 412) {
            return yield* new ServerAheadError({
              minimumExpectedNum: EventSequenceNumber.Global.make(firstSeqNum + 1),
              providedNum: firstSeqNum,
            });
          }
          if (!response.ok) return yield* fail(`PUT batch ${firstSeqNum}`, response);
        }),
    });
  });
