import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { webcrypto } from "node:crypto";
import { expect, test, vi } from "vite-plus/test";
import {
  loadBeirSourceBundle,
  validateBeirQrelReferences,
} from "../../src/lib/playground/beirLocalDataset";
import { runResumableEvaluation } from "@memora/evaluation";

const script = readFileSync(new URL("../../beir-dissertation.html", import.meta.url), "utf8")
  .match(/<script type="module">([\s\S]*?)<\/script>/)?.[1]
  .replace(/^import .*;\n/gm, "")
  // Exercise the existing evaluation branch; the reranker branch has its own page test.
  .replace(
    /if\(new URLSearchParams\(location.search\).get\('reranker'\)==='1'\)\{[\s\S]*?\}else\{\n/,
    "",
  )
  .replace(/\}\s*$/, "");
const root = "/api/playground/eval-data/results/beir-dissertation-bge-small-en-v1.json";
const meta = {
  name: "scifact",
  corpusCount: 5183,
  queryCount: 300,
  corpusSha256: "a".repeat(64),
  queriesSha256: "a".repeat(64),
  qrelsSha256: "a".repeat(64),
  rowTruncationChecked: true,
  uniqueIdsChecked: true,
  hubRevisionStableDuringDownload: true,
};

class Element {
  textContent = "";
  value = "2";
  checked = true;
  disabled = false;
  children: Element[] = [];
  append(child: Element) {
    this.children.push(child);
  }
  querySelectorAll() {
    return [];
  }
}

function page(
  files: Map<string, string>,
  search: (input: {
    query: string;
    queryEmbedding?: Float32Array;
    topK?: number;
    lexicalWeight?: number;
    semanticWeight?: number;
  }) => Promise<unknown[]> = async () => [],
  options: { queryOnly?: boolean; k?: number; indexReady?: boolean } = {},
) {
  const nodes = new Map(
    [
      "open-reranker",
      "status",
      "run",
      "stop",
      "results",
      "worker-count",
      "batch-size",
      "embedding-status",
      "rebuild-embeddings",
      "progress-log",
      "worker-progress",
      "resume-saved",
      "resume-status",
      "auto-retry",
      "retrieval-k",
      "apply-k",
      "k-status",
      "ndcg-k-header",
      "recall-k-header",
      "latency-header",
      "batch-label",
      "rebuild-label",
      "timing-description",
    ].map((id) => ["#" + id, new Element()]),
  );
  const requests: string[] = [];
  const db = {
    mount: () => () => {},
    search,
    initialize: vi.fn(),
    prepareDocument: vi.fn(async () => ({ complete: true })),
    deleteDocument: vi.fn(),
    upsertChunkBatch: vi.fn(),
    checkDocuments: vi.fn(async (docs: { documentId: string }[]) =>
      docs.map((doc) => ({
        exists: options.indexReady !== false,
        matches: true,
        indexedChunkCount: (
          { scifact: 5183, nfcorpus: 3633, arguana: 8674 } as Record<string, number>
        )[doc.documentId.replace("full-beir-", "")],
      })),
    ),
  };
  const embedding = { active: 0, peak: 0, queries: [] as string[] };
  class Pool {
    async warmup() {}
    async embed(texts: string[], signal?: AbortSignal) {
      signal?.throwIfAborted();
      embedding.queries.push(...texts);
      embedding.active += 1;
      embedding.peak = Math.max(embedding.peak, embedding.active);
      try {
        await new Promise((resolve) => setTimeout(resolve, texts[0] === "1" ? 20 : 1));
        signal?.throwIfAborted();
        return texts.map((text) => {
          if (!options.queryOnly) return new Float32Array([Number(text)]);
          const vector = new Float32Array(384);
          vector[0] = 1;
          return vector;
        });
      } finally {
        embedding.active -= 1;
      }
    }
    progress() {
      return [];
    }
    stats() {
      return [];
    }
    dispose() {}
  }
  const context = createContext({
    document: {
      querySelector: (selector: string) => nodes.get(selector),
      createElement: () => new Element(),
    },
    location: { search: options.queryOnly ? `?queries=1&k=${options.k ?? 20}` : "" },
    structuredClone,
    crypto: webcrypto,
    navigator: { userAgent: "test" },
    AbortController,
    AbortSignal,
    performance,
    URLSearchParams,
    console: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    runResumableEvaluation,
    loadBeirSourceBundle: (name: string, options: Parameters<typeof loadBeirSourceBundle>[1]) =>
      loadBeirSourceBundle(name, { ...options, fetcher: context.fetch }),
    validateBeirQrelReferences,
    BeirEmbeddingPool: Pool,
    createVectorDbClient: () => db,
    getVectorDbContentHash: async () => "a".repeat(64),
    buildBgeIndexConfig: () => ({}),
    BGE_SMALL_EN_QUERY_PREFIX: "",
    testDb: db,
    fetch: async (url: string, init?: { method?: string; body?: string }) => {
      requests.push(url);
      if (init?.method === "PUT") {
        files.set(url, init.body ?? "");
        return new Response(null, { status: 204 });
      }
      if (url.startsWith("https:")) return Response.json({ sha: "revision" });
      const value = files.get(url);
      return value === undefined
        ? new Response(null, { status: 404 })
        : new Response(value, { headers: { "Content-Type": "application/json" } });
    },
  });
  if (!script) throw new Error("Missing BEIR module script");
  runInContext(script, context);
  return {
    context,
    nodes,
    requests,
    db,
    embedding,
    ready: runInContext("pageReady", context) as Promise<void>,
  };
}

test("refresh restores saved SciFact rows and continuation goes directly to NFCorpus", async () => {
  const files = new Map<string, string>();
  const empty = page(files);
  await empty.ready;
  const initial = JSON.parse(runInContext("JSON.stringify(report)", empty.context));
  initial.startedAt = "2026-10-03T00:00:00.000Z";
  initial.status = "failed";
  initial.errors = ["HTTP 429"];
  initial.datasets = [meta];
  initial.results = ["bm25", "dense", "hybrid"].map((method) => ({
    dataset: "full-beir-scifact",
    method,
    queryCount: 300,
    ndcgAt10: 0,
    recallAt10: 0,
    medianTotalMs: 1,
    medianSearchMs: 1,
    cases: Array.from({ length: 300 }, (_, i) => ({
      queryId: "q" + i,
      queryText: "query",
      ranked: [],
      relevance: { [i]: 1 },
      ndcgAt10: 0,
      recallAt10: 0,
      queryEmbeddingMs: 0,
      searchMs: 1,
      totalMs: 1,
    })),
  }));
  files.set(root, JSON.stringify(initial));
  const reopened = page(files);
  await reopened.ready;
  expect(reopened.nodes.get("#results")?.children).toHaveLength(3);
  expect(JSON.parse(files.get(root) ?? "").results).toEqual(initial.results);
  await runInContext("button.onclick()", reopened.context);
  expect(reopened.db.initialize).not.toHaveBeenCalled();
  expect(reopened.requests.some((url) => url.includes("BeIR%2Fscifact"))).toBe(false);
  expect(reopened.requests.some((url) => url.includes("BeIR%2Fnfcorpus"))).toBe(true);
  expect(JSON.parse(files.get(root) ?? "").results).toEqual(initial.results);
});

test("a page reload resumes a durable query that is ahead of the main report", async () => {
  const files = new Map<string, string>();
  const never = new Promise<unknown[]>(() => {});
  let calls = 0;
  const firstSearch = vi.fn(async () => (++calls === 1 ? [] : never));
  const first = page(files, firstSearch);
  await first.ready;
  first.context.testMeta = meta;
  const setup = `report.startedAt='2026-10-03T00:00:00.000Z';report.status='running';report.datasets=[testMeta];runController=new AbortController();`;
  const evaluate = `evaluate(testDb,'full-beir-scifact',[{_id:'one',text:'one'},{_id:'two',text:'two'},{_id:'three',text:'three'}],new Map([['one',new Map([['d',1]])],['two',new Map([['d',1]])],['three',new Map([['d',1]])]]),'bm25',new Map())`;
  runInContext(setup, first.context);
  void runInContext(evaluate, first.context);
  await vi.waitFor(() =>
    expect(
      [...files.entries()].some(
        ([path, body]) => path.endsWith("manifest.json") && JSON.parse(body).completed === 1,
      ),
    ).toBe(true),
  );
  expect(JSON.parse(files.get(root) ?? "").inProgressEvaluations[0].cases).toHaveLength(0);
  const itemPath = [...files.keys()].find((path) => path.endsWith("items/0.json"));
  const savedItem = JSON.parse(files.get(itemPath ?? "") ?? "").result;
  const secondSearch = vi.fn(async (_input: { query: string }) => []);
  const second = page(files, secondSearch);
  await second.ready;
  second.context.testMeta = meta;
  runInContext(setup, second.context);
  await runInContext(evaluate, second.context);
  expect(secondSearch.mock.calls.map(([input]) => input.query)).toEqual(["two", "three"]);
  const result = JSON.parse(files.get(root) ?? "").results[0];
  expect(result.cases.map((c: { queryId: string }) => c.queryId)).toEqual(["one", "two", "three"]);
  expect(result.cases[0]).toEqual(savedItem);
});

test.each([1, 2, 4])(
  "dense queries use %s concurrent worker slots and retain their vector associations",
  async (workers) => {
    const files = new Map<string, string>();
    const vectors: number[] = [];
    const opened = page(files, async (input) => {
      const { queryEmbedding } = input;
      if (!queryEmbedding) throw new Error("Missing query embedding");
      const id = queryEmbedding[0];
      vectors.push(id);
      return [{ chunkId: "full-beir-scifact:d" + id }];
    });
    await opened.ready;
    const control = opened.nodes.get("#worker-count");
    if (control) control.value = String(workers);
    opened.context.testMeta = meta;
    runInContext(
      "report.datasets=[testMeta];runController=new AbortController();embeddingPool=new BeirEmbeddingPool();report.config.embeddingWorkers=Number(workerControl.value);",
      opened.context,
    );
    await runInContext(
      "evaluate(testDb,'full-beir-scifact',Array.from({length:6},(_,i)=>({_id:'q'+(i+1),text:String(i+1)})),new Map(Array.from({length:6},(_,i)=>['q'+(i+1),new Map([['d'+(i+1),1]])])),'dense',new Map())",
      opened.context,
    );
    expect(opened.embedding.peak).toBe(workers);
    expect(opened.embedding.queries).toEqual(["1", "2", "3", "4", "5", "6"]);
    expect(vectors.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);
    const result = JSON.parse(files.get(root) ?? "").results[0];
    expect(result.executionConfig.queryConcurrency).toBe(workers);
    expect(result.queryRun).toMatchObject({ concurrency: workers, resumed: 0, newlyEvaluated: 6 });
    expect(
      result.cases.map((c: { queryId: string; ranked: string[]; queryConcurrency: number }) => [
        c.queryId,
        c.ranked,
        c.queryConcurrency,
      ]),
    ).toEqual(Array.from({ length: 6 }, (_, i) => ["q" + (i + 1), ["d" + (i + 1)], workers]));
    expect(result.ndcgAt10).toBe(1);
    expect(result.recallAt10).toBe(1);
  },
);

async function baselineFiles() {
  const files = new Map<string, string>();
  const empty = page(files);
  await empty.ready;
  const baseline = JSON.parse(runInContext("JSON.stringify(report)", empty.context));
  baseline.status = "complete";
  baseline.config.embeddingWorkers = 4;
  baseline.datasets = Object.entries({
    scifact: [5183, 300],
    nfcorpus: [3633, 323],
    arguana: [8674, 1406],
  }).map(([name, counts]) => ({
    ...meta,
    name,
    corpusCount: counts[0],
    queryCount: counts[1],
  }));
  baseline.results = baseline.datasets.flatMap((dataset: { name: string; queryCount: number }) =>
    ["bm25", "dense", "hybrid"].map((method) => ({
      dataset: "full-beir-" + dataset.name,
      method,
      queryCount: dataset.queryCount,
      ndcgAt10: 0,
      recallAt10: 0,
      medianTotalMs: 1,
      medianSearchMs: 1,
      cases: Array.from({ length: dataset.queryCount }, (_, i) => ({
        queryId: dataset.name + "-q" + i,
        queryText: dataset.name + " query " + i,
        relevance: { relevant: 2 },
        ranked: [],
        ndcgAt10: 0,
        recallAt10: 0,
        queryEmbeddingMs: 0,
        searchMs: 1,
        totalMs: 1,
      })),
    })),
  );
  files.set(root, JSON.stringify(baseline));
  return files;
}

test("the k input validates whole numbers and selects a separate query run", async () => {
  const opened = page(new Map());
  await opened.ready;
  const control = opened.nodes.get("#retrieval-k");
  if (!control) throw new Error("Missing k input");
  for (const value of ["", "0", "-1", "1.5", "1001", "NaN"]) {
    control.value = value;
    runInContext("applyK.onclick()", opened.context);
    expect(runInContext("location.search", opened.context)).toBe("");
  }
  control.value = "20";
  runInContext("applyK.onclick()", opened.context);
  expect(runInContext("location.search", opened.context)).toBe("?queries=1&k=20");
  expect(opened.requests.filter((url) => url.endsWith(".json"))).toEqual([root]);
});

test("graded @20 scoring keeps @10 and excludes duplicate and same-ID hits", async () => {
  const opened = page(await baselineFiles(), undefined, { queryOnly: true, k: 20 });
  await opened.ready;
  const scored = runInContext(
    `score('q',[
    {chunkId:'scope:q'}, ...Array.from({length:14},(_,i)=>({chunkId:'scope:noise'+i})),
    {chunkId:'scope:positive'}, {chunkId:'scope:positive'}, {chunkId:'scope:outside'},
  ],new Map([['q',new Map([['positive',2],['outside',1]])]]))`,
    opened.context,
  );
  expect(scored.ranked).toHaveLength(16);
  expect(scored.ranked).not.toContain("q");
  expect(scored.recallAt10).toBe(0);
  expect(scored.recallAt20).toBe(1);
  const expected = (2 / Math.log2(16) + 1 / Math.log2(17)) / (2 + 1 / Math.log2(3));
  expect(scored.ndcgAt20).toBeCloseTo(expected, 12);
});

test("query-only k=20 keeps the baseline, reuses indexes and resumes vectors across k values", async () => {
  const files = await baselineFiles();
  const original = files.get(root);
  let active = 0,
    peak = 0;
  const search = vi.fn(async (_input: { topK?: number }) => {
    active += 1;
    peak = Math.max(peak, active);
    await Promise.resolve();
    active -= 1;
    return Array.from({ length: 21 }, (_, i) => ({
      chunkId: "scope:" + (i === 14 ? "relevant" : "noise" + i),
    }));
  });
  const opened = page(files, search, { queryOnly: true, k: 20 });
  await opened.ready;
  await runInContext("button.onclick()", opened.context);
  const saved = JSON.parse(
    files.get("/api/playground/eval-data/results/beir-dissertation-bge-small-en-k20.json") ?? "",
  );
  expect(saved.status).toBe("complete");
  expect(saved.results).toHaveLength(9);
  expect(saved.config).toMatchObject({
    retrievalK: 20,
    candidateK: 105,
    queryConcurrency: 1,
    queryOnly: true,
  });
  expect(saved.results.map((r: { queryCount: number }) => r.queryCount)).toEqual([
    300, 300, 300, 323, 323, 323, 1406, 1406, 1406,
  ]);
  expect(
    saved.results.every(
      (r: { recallAt10: number; recallAt20: number }) => r.recallAt10 === 0 && r.recallAt20 === 1,
    ),
  ).toBe(true);
  expect(search.mock.calls).toHaveLength(6087);
  expect(search.mock.calls.every(([request]) => request.topK === 21)).toBe(true);
  expect(peak).toBe(1);
  expect(opened.embedding.queries).toHaveLength(2029);
  for (const result of saved.results) {
    expect(
      result.cases.every(
        (c: {
          queryConcurrency: number;
          queryEmbeddingCached: boolean;
          queryEmbeddingMs: number;
        }) =>
          c.queryConcurrency === 1 &&
          c.queryEmbeddingCached === (result.method !== "bm25") &&
          c.queryEmbeddingMs >= 0,
      ),
    ).toBe(true);
  }
  expect(opened.db.prepareDocument).not.toHaveBeenCalled();
  expect(opened.db.upsertChunkBatch).not.toHaveBeenCalled();
  expect(opened.db.deleteDocument).not.toHaveBeenCalled();
  expect(opened.requests.some((url) => url.includes("nanobeir") || url.startsWith("https:"))).toBe(
    false,
  );
  expect(files.get(root)).toBe(original);
  const reopened = page(files, search, { queryOnly: true, k: 20 });
  await reopened.ready;
  expect(reopened.nodes.get("#results")?.children).toHaveLength(9);
  expect(reopened.nodes.get("#run")?.disabled).toBe(true);
  const changed = page(files, search, { queryOnly: true, k: 30 });
  await changed.ready;
  await runInContext("button.onclick()", changed.context);
  expect(
    JSON.parse(files.get("/api/playground/eval-data/results/beir-dissertation-bge-small-en-k30.json") ?? "")
      .status,
  ).toBe("complete");
  expect(changed.embedding.queries).toHaveLength(0);
  expect(files.get(root)).toBe(original);
  expect(files.get("/api/playground/eval-data/results/beir-dissertation-bge-small-en-k20.json")).toBe(
    JSON.stringify(saved, null, 2),
  );
}, 30000);

test("query-only mode fails before searching when a saved index is unavailable", async () => {
  const files = await baselineFiles();
  const original = files.get(root);
  const search = vi.fn(async () => []);
  const opened = page(files, search, { queryOnly: true, k: 20, indexReady: false });
  await opened.ready;
  await runInContext("button.onclick()", opened.context);
  const saved = JSON.parse(
    files.get("/api/playground/eval-data/results/beir-dissertation-bge-small-en-k20.json") ?? "",
  );
  expect(saved.status).toBe("failed");
  expect(saved.errors[0]).toContain("will not rebuild passages");
  expect(search).not.toHaveBeenCalled();
  expect(opened.db.prepareDocument).not.toHaveBeenCalled();
  expect(opened.embedding.queries).toHaveLength(0);
  expect(files.get(root)).toBe(original);
});

test("k=20 resumes the saved query item ahead of its main report", async () => {
  const files = await baselineFiles();
  let calls = 0;
  const first = page(files, async () => (++calls === 1 ? [] : new Promise<unknown[]>(() => {})), {
    queryOnly: true,
    k: 20,
  });
  await first.ready;
  const setup = `report.startedAt='2026-10-06T00:00:00.000Z';report.status='running';runController=new AbortController();`;
  const evaluate = `evaluate(testDb,'full-beir-scifact',[{_id:'one',text:'one'},{_id:'two',text:'two'}],new Map([['one',new Map([['positive',2]])],['two',new Map([['positive',2]])]]),'bm25',new Map())`;
  runInContext(setup, first.context);
  const running = runInContext(evaluate, first.context) as Promise<void>;
  void running.catch(() => {});
  await vi.waitFor(() =>
    expect(
      [...files.entries()].some(
        ([path, body]) =>
          path.includes("beir-checkpoints-k20/") &&
          path.endsWith("manifest.json") &&
          JSON.parse(body).completed === 1,
      ),
    ).toBe(true),
  );
  runInContext("runController.abort()", first.context);
  await expect(running).rejects.toThrow();
  const newRoot = "/api/playground/eval-data/results/beir-dissertation-bge-small-en-k20.json";
  expect(JSON.parse(files.get(newRoot) ?? "").inProgressEvaluations[0].cases).toHaveLength(0);
  const search = vi.fn(async (_input: { query: string }) => []);
  const second = page(files, search, { queryOnly: true, k: 20 });
  await second.ready;
  runInContext(setup, second.context);
  await runInContext(evaluate, second.context);
  expect(search.mock.calls.map(([request]) => request.query)).toEqual(["two"]);
  const result = JSON.parse(files.get(newRoot) ?? "").results[0];
  expect(result.cases.map((c: { queryId: string }) => c.queryId)).toEqual(["one", "two"]);
  expect(result.retrievalK).toBe(20);
});
