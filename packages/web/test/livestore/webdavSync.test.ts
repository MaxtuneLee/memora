import { afterEach, describe, expect, it, vi } from "vitest";
import type { LiveStoreEvent } from "@livestore/common/schema";
import {
  Chunk,
  Effect,
  type HttpClient,
  KeyValueStore,
  Option,
  type Scope,
  Stream,
} from "@livestore/utils/effect";

import { makeWebdavSyncBackend, parseBatchListing } from "../../src/livestore/webdavSync";

/** Minimal in-memory WebDAV server: MKCOL, PUT (with If-None-Match), GET, PROPFIND, OPTIONS. */
const fakeWebdav = ({ honorIfNoneMatch = true } = {}) => {
  const files = new Map<string, string>();
  return async (url: string, init?: RequestInit): Promise<Response> => {
    const headers = new Headers(init?.headers);
    switch (init?.method) {
      case "MKCOL":
        return new Response(null, { status: 201 });
      case "PUT":
        if (honorIfNoneMatch && headers.get("If-None-Match") === "*" && files.has(url)) {
          return new Response(null, { status: 412 });
        }
        files.set(url, init.body as string);
        return new Response(null, { status: 201 });
      case "GET": {
        const body = files.get(url);
        return body === undefined ? new Response(null, { status: 404 }) : new Response(body);
      }
      case "PROPFIND": {
        const hrefs = [...files.keys()]
          .filter((key) => key.startsWith(url))
          .map((key) => `<d:response><d:href>${new URL(key).pathname}</d:href></d:response>`);
        return new Response(`<d:multistatus xmlns:d="DAV:">${hrefs.join("")}</d:multistatus>`, {
          status: 207,
        });
      }
      default:
        return new Response(null, { status: 200 });
    }
  };
};

const event = (seqNum: number, clientId: string): LiveStoreEvent.Global.Encoded =>
  ({
    name: "v1.FolderCreated",
    args: { id: `${clientId}-${seqNum}` },
    seqNum,
    parentSeqNum: seqNum - 1,
    clientId,
    sessionId: "s",
  }) as LiveStoreEvent.Global.Encoded;

// The backend never uses the HttpClient its constructor type allows for, so it is left unprovided.
const run = <A, E>(
  effect: Effect.Effect<A, E, KeyValueStore.KeyValueStore | Scope.Scope | HttpClient.HttpClient>,
) =>
  Effect.runPromise(
    effect.pipe(Effect.scoped, Effect.provide(KeyValueStore.layerMemory)) as Effect.Effect<A, E>,
  );

const backend = (clientId: string) =>
  makeWebdavSyncBackend({ storeId: "main", clientId, payload: { url: "https://dav.test/memora" } });

const pullAll = (sync: Effect.Effect.Success<ReturnType<typeof backend>>) =>
  sync.pull(Option.none()).pipe(
    Stream.runCollect,
    Effect.map((items) =>
      Chunk.toArray(items).flatMap((item) => item.batch.map((e) => e.eventEncoded.seqNum)),
    ),
  );

afterEach(() => vi.unstubAllGlobals());

describe("webdav sync backend", () => {
  it("lets one device win a sequence number and makes the other rebase", async () => {
    vi.stubGlobal("fetch", fakeWebdav());

    const result = await run(
      Effect.gen(function* () {
        const a = yield* backend("a");
        const b = yield* backend("b");
        yield* a.push([event(1, "a"), event(2, "a")]);
        const conflict = yield* b.push([event(1, "b")]).pipe(Effect.flip);
        yield* b.push([event(3, "b")]);
        return { conflict: conflict._tag, pulled: yield* pullAll(a) };
      }),
    );

    expect(result.conflict).toBe("ServerAheadError");
    expect(result.pulled).toEqual([1, 2, 3]);
  });

  it("never uploads the API key that old provider events still carry", async () => {
    const fetch = fakeWebdav();
    vi.stubGlobal("fetch", fetch);

    const pulled = await run(
      Effect.gen(function* () {
        const a = yield* backend("a");
        yield* a.push([
          {
            ...event(1, "a"),
            name: "v1.ProviderCreated",
            args: { id: "p", name: "OpenAI", apiKey: "sk-secret" },
          } as LiveStoreEvent.Global.Encoded,
        ]);
        return yield* a.pull(Option.none()).pipe(Stream.runCollect);
      }),
    );

    const stored = Chunk.toArray(pulled).flatMap((item) => item.batch)[0]?.eventEncoded;
    expect(stored?.args).toEqual({ id: "p", name: "OpenAI" });
  });

  it("refuses servers that ignore If-None-Match", async () => {
    vi.stubGlobal("fetch", fakeWebdav({ honorIfNoneMatch: false }));

    const error = await run(
      Effect.gen(function* () {
        const a = yield* backend("a");
        return yield* a.push([event(1, "a")]).pipe(Effect.flip);
      }),
    );

    expect(error._tag).toBe("UnknownError");
  });

  it("reads batch files from PROPFIND bodies with any namespace prefix", () => {
    const xml =
      '<D:multistatus xmlns:D="DAV:"><D:response><D:href>/dav/main/events/</D:href></D:response>' +
      "<D:response><D:href>/dav/main/events/000000000004.json</D:href></D:response>" +
      '<response xmlns="DAV:"><href>/dav/main/events/000000000001.json</href></response></D:multistatus>';
    expect(parseBatchListing(xml)).toEqual([1, 4]);
  });
});
