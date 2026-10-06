import { readFileSync } from "node:fs";
import { createHash, webcrypto } from "node:crypto";
import { createContext, runInContext } from "node:vm";
import { expect, test } from "vite-plus/test";
import { JEV_RERANKER, runResumableEvaluation } from "@memora/evaluation";
import { BEIR_RERANKER, getBeirRerankerProfile } from "@memora/local-model-runtime";

import { rerankCandidateIds, scoreBeirRanking } from "../../src/lib/playground/beirRerankerMetrics";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const model = { model: "Xenova/bge-small-en-v1.5", dtype: "q8", pooling: "cls", normalized: true };
const names = ["scifact", "nfcorpus", "arguana"];
const datasets = names.map((name) => ({
  name,
  corpusCount: 35,
  queryCount: 2,
  corpusSha256: hash(name),
  queriesSha256: hash(name + "queries"),
  qrelsSha256: hash(name + "qrels"),
  queryVectors: { fingerprint: "" },
}));
for (const d of datasets)
  d.queryVectors.fingerprint = hash(
    JSON.stringify({
      queries: d.queriesSha256,
      ...model,
      dimensions: 384,
      protocol: "beir-query-vectors-v1",
    }),
  );
const results = names.flatMap((name) =>
  ["bm25", "dense", "hybrid"].map((method) => ({
    dataset: "full-beir-" + name,
    method,
    cases: [0, 1].map((i) => ({
      queryId: name + "query" + i,
      queryText: name + " question " + i,
      relevance: { c29: 2, missing: 1 },
    })),
  })),
);
const source = JSON.stringify({ status: "complete", results, datasets, config: model, errors: [] });
const sourcePath = "beir-dissertation-k20.json";
const script = readFileSync(
  new URL("../../src/lib/playground/beirRerankerEvaluation.js", import.meta.url),
  "utf8",
)
  .replace(/^import .*;\n/gm, "")
  .replace(
    "scifact:[5183,300],nfcorpus:[3633,323],arguana:[8674,1406]",
    "scifact:[35,2],nfcorpus:[35,2],arguana:[35,2]",
  )
  .replace("246ec878d75be4daf257ed2c2f33e7b6cb6d64688ac7f88316c0c0a732010fb8", hash(source));

class Element {
  textContent = "";
  value = "";
  disabled = false;
  children: Element[] = [];
  onclick?: () => Promise<void>;
  replaceChildren() {
    this.children = [];
  }
  appendChild(child: Element) {
    this.children.push(child);
  }
}
interface StoredReport {
  status: string;
  errors: string[];
  results: { method: string; recallAt20: number; cases: unknown[] }[];
}

function fixture(
  indexReady = true,
  corruptSource = false,
  profile = "m3",
  trial = false,
  dataset = "",
) {
  const files = new Map<string, string>([
    [sourcePath, source + (corruptSource ? " " : "")],
    ["beir-dissertation-v1.json", "preserve-old-report"],
  ]);
  for (const d of datasets)
    for (const [i, c] of results
      .find((r) => r.dataset === "full-beir-" + d.name)
      ?.cases.entries() ?? []) {
      files.set(
        `beir-query-vectors/${d.name}/${d.queryVectors.fingerprint}/items/${i}.json`,
        JSON.stringify({
          fingerprint: d.queryVectors.fingerprint,
          itemId: c.queryId,
          result: { ...c, vector: [1, ...Array(383).fill(0)] },
        }),
      );
    }
  const nodes = new Map<string, Element>();
  const requests: { path: string; method: string }[] = [];
  const calls = new Map<string, number>();
  let failedPair: string | undefined,
    searches = 0;
  const db = {
    mount: () => () => {},
    initialize: async () => {},
    checkDocuments: async () => [{ exists: indexReady, matches: true, indexedChunkCount: 35 }],
    search: async (input: {
      query: string;
      scope: { documentIds: string[] };
      topK: number;
      lexicalCandidateK: number;
      semanticCandidateK: number;
    }) => {
      searches++;
      expect(input.topK).toBe(31);
      expect(input.lexicalCandidateK).toBe(155);
      expect(input.semanticCandidateK).toBe(155);
      const scope = input.scope.documentIds[0],
        name = scope.replace("full-beir-", "");
      const q = results
        .find((r) => r.dataset === scope)
        ?.cases.find((c) => c.queryText === input.query);
      expect(q).toBeDefined();
      return [
        { chunkId: scope + ":" + q?.queryId, documentId: scope, content: "exclude self" },
        ...Array.from({ length: 30 }, (_, i) => ({
          chunkId: `${scope}:c${i}`,
          documentId: scope,
          content: `${name} doc ${i}`,
        })),
      ];
    },
  };
  class Client {
    private count: number;
    constructor(options: { workerCount: number }) {
      this.count = options.workerCount;
    }
    setDataset() {}
    progress() {
      return [];
    }
    async warmReranker(device: string) {
      return Array.from({ length: this.count }, () => ({
        ...(profile === "jev"
          ? {
              relevanceProbability: 0.9,
              model: JEV_RERANKER.modelId,
              usage: { input_tokens: 10, output_tokens: 1 },
              requestMs: 4,
              attempts: [{ requestMs: 4, status: "success" }],
            }
          : { logit: 3 }),
        scoringMs: 5,
        backend: device,
      }));
    }
    async scorePair(query: string, document: string, device: string) {
      const key = query + "::" + document;
      calls.set(key, (calls.get(key) ?? 0) + 1);
      if (key === failedPair) {
        failedPair = undefined;
        throw new Error("injected pair failure");
      }
      return {
        ...(profile === "jev"
          ? {
              relevanceProbability: document.includes("database")
                ? 0.1
                : document.endsWith(" 29")
                  ? 0.95
                  : 0.8,
              model: JEV_RERANKER.modelId,
              usage: { input_tokens: 10, output_tokens: 1 },
              requestMs: 4,
              attempts: [{ requestMs: 4, status: "success" }],
            }
          : {
              logit: document.includes("giant panda")
                ? 3
                : document.includes("database")
                  ? -2
                  : document.endsWith(" 29")
                    ? 4
                    : -1,
            }),
        scoringMs: 5,
        backend: device,
        workerId: 0,
      };
    }
    dispose() {}
  }
  const context = createContext({
    document: {
      body: { innerHTML: "", prepend: () => {} },
      title: "",
      getElementById: (id: string) => {
        if (!nodes.has(id)) nodes.set(id, new Element());
        return nodes.get(id);
      },
      createElement: () => new Element(),
      querySelector: () => new Element(),
    },
    location: {
      search:
        "?k=20&candidates=30&model=" +
        profile +
        (trial ? "&trial=1" : "") +
        (dataset ? "&dataset=" + dataset : ""),
      href: "",
    },
    console: { info: () => {} },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    URLSearchParams,
    AbortSignal,
    AbortController,
    Response,
    performance,
    Float32Array,
    crypto: webcrypto,
    getVectorDbContentHash: async (value: string) => hash(value),
    buildBgeIndexConfig: () => ({}),
    createVectorDbClient: () => db,
    BeirEmbeddingPool: Client,
    BeirJevPool: Client,
    JEV_RERANKER,
    readSavedJevKey: async () => "test-saved-jev-key",
    BEIR_RERANKER,
    getBeirRerankerProfile,
    runResumableEvaluation,
    rerankCandidateIds,
    scoreBeirRanking,
    fetch: async (url: string, init?: { method?: string; body?: string }) => {
      const path = url.replace("/api/playground/eval-data/results/", ""),
        method = init?.method ?? "GET";
      requests.push({ path, method });
      if (method === "PUT") {
        files.set(path, init?.body ?? "");
        return new Response(null, { status: 204 });
      }
      return files.has(path)
        ? new Response(files.get(path), { status: 200 })
        : new Response(null, { status: 404 });
    },
  });
  if (!script) throw new Error("Missing page script");
  runInContext(script, context);
  const ready = runInContext("ready", context) as Promise<void>;
  const report = () =>
    JSON.parse(
      files.get(
        profile === "jev"
          ? `beir-reranker-jev-k20-c30-v1${dataset ? "-" + dataset : ""}${trial ? "-trial" : ""}.json`
          : profile === "base"
            ? `beir-reranker-base-fp32-webgpu-k20-c30-v1${trial ? "-trial" : ""}.json`
            : "beir-reranker-k20-c30-v1.json",
      ) ?? "{}",
    ) as StoredReport;
  return {
    files,
    nodes,
    requests,
    calls,
    ready,
    report,
    context,
    searches: () => searches,
    failPair: (key: string) => {
      failedPair = key;
    },
    run: async () => {
      await ready;
      await nodes.get("run")?.onclick?.();
    },
  };
}

test("the actual page compares paired candidates, restores within a query, and preserves prior reports", async () => {
  const p = fixture();
  p.failPair("scifact question 0::scifact doc 4");
  await p.run();
  expect(p.report().status).toBe("failed");
  expect([...p.files.keys()].filter((k) => k.includes("/pairs/0/items/")).length).toBeGreaterThan(
    0,
  );
  const savedPairs = [...p.files.entries()].filter(([key]) => key.includes("/pairs/0/items/"));
  const countsBeforeResume = new Map(p.calls);
  await p.run();
  for (const [, entry] of savedPairs) {
    const saved = JSON.parse(entry).result;
    const key = "scifact question 0::scifact doc " + saved.documentId.slice(1);
    expect(p.calls.get(key)).toBe(countsBeforeResume.get(key));
  }
  expect(p.report().status).toBe("complete");
  expect(p.report().results.length).toBe(6);
  expect(p.searches()).toBe(6);
  expect(p.calls.get("scifact question 0::scifact doc 0")).toBe(1);
  expect(p.calls.get("scifact question 0::scifact doc 4")).toBe(2);
  for (const row of p.report().results)
    expect(row.recallAt20).toBe(row.method === "hybrid" ? 0 : 0.5);
  expect(p.files.get(sourcePath)).toBe(source);
  expect(p.files.get("beir-dissertation-v1.json")).toBe("preserve-old-report");
  expect(
    p.requests.some(
      (r) => r.method === "PUT" && [sourcePath, "beir-dissertation-v1.json"].includes(r.path),
    ),
  ).toBe(false);
  expect(p.requests.some((r) => r.path.includes("/pairs/0/items/29.json"))).toBe(true);
  expect(p.files.get("beir-reranker-k20-c30-v1-progress.json")).toContain('"status": "complete"');
});

test("the actual page stops on a missing saved index without model loading or retrieval", async () => {
  const p = fixture(false);
  await p.run();
  expect(p.report().status).toBe("failed");
  expect(p.searches()).toBe(0);
  expect(p.calls.size).toBe(0);
  expect(p.report().errors[0]).toContain("will not rebuild");
});

test("the actual page refuses a changed source before writing any result", async () => {
  const p = fixture(true, true);
  await p.ready;
  expect(p.nodes.get("run")?.disabled).toBe(true);
  expect(p.requests.some((r) => r.method === "PUT")).toBe(false);
});

test("candidate scoring is independent of relevance labels", () => {
  const ids = ["a", "b", "c"],
    scores = ids.map((documentId, i) => ({ documentId, logit: i }));
  const order = rerankCandidateIds(ids, scores);
  expect(order).toEqual(["c", "b", "a"]);
  expect(scoreBeirRanking(order, { a: 1 }, 1).recall).toBe(0);
  expect(scoreBeirRanking(order, { c: 1 }, 1).recall).toBe(1);
});

test("base model uses WebGPU and separate model checkpoints without overwriting M3", async () => {
  const p = fixture(true, false, "base");
  p.files.set("beir-reranker-k20-c30-v1.json", JSON.stringify({ config: {}, keep: "old" }));
  const prior = p.files.get("beir-reranker-k20-c30-v1.json");
  await p.run();
  expect(p.report().status).toBe("complete");
  expect(p.files.get("beir-reranker-k20-c30-v1.json")).toBe(prior);
  expect([...p.files.keys()].some((key) => key.includes("beir-reranker-base-checkpoints/"))).toBe(
    true,
  );
  const output = JSON.parse(p.files.get("beir-reranker-base-fp32-webgpu-k20-c30-v1.json")!);
  expect(output.config.reranker.modelId).toBe("Xenova/bge-reranker-base");
  expect(output.config.reranker.device).toBe("webgpu");
  expect(
    output.results[1].cases[0].scores.every(
      (score: { backend: string }) => score.backend === "webgpu",
    ),
  ).toBe(true);
});

test("a base speed trial saves only SciFact paired results in a separate report", async () => {
  const p = fixture(true, false, "base", true);
  await p.run();
  expect(p.report().status).toBe("complete");
  expect(p.report().results).toHaveLength(2);
  expect(p.searches()).toBe(2);
  expect([...p.files.keys()].some((key) => key.includes("/nfcorpus/candidates/"))).toBe(false);
  expect(p.files.has("beir-reranker-base-fp32-webgpu-k20-c30-v1.json")).toBe(false);
  expect(p.files.get(sourcePath)).toBe(source);
});

test("Jev uses raw probabilities, saves usage separately, and resumes document scores without persisting the key", async () => {
  const p = fixture(true, false, "jev", true);
  await p.ready;
  await p.run();
  expect(p.searches()).toBe(0);
  expect(p.nodes.get("status")?.textContent).toContain("API key");
  await p.nodes.get("saved-key")?.onclick?.();
  p.failPair("scifact question 0::scifact doc 4");
  await p.run();
  expect(p.report().status).toBe("failed");
  const saved = [...p.files].filter(([k]) => k.includes("/pairs/0/items/"));
  const before = new Map(p.calls);
  await p.run();
  for (const [, text] of saved) {
    const value = JSON.parse(text).result;
    expect(p.calls.get("scifact question 0::scifact doc " + value.documentId.slice(1))).toBe(
      before.get("scifact question 0::scifact doc " + value.documentId.slice(1)),
    );
    expect(value.relevanceProbability).toBeGreaterThanOrEqual(0);
    expect(value.logit).toBeUndefined();
  }
  expect(p.report().status).toBe("complete");
  expect(p.report().results.length).toBe(2);
  const report = JSON.parse(p.files.get("beir-reranker-jev-k20-c30-v1-trial.json")!);
  expect(report.execution.backend).toBe("remote-api");
  expect(report.execution.pairConcurrency).toBe(4);
  expect(report.apiBilling.usage).toEqual({ input_tokens: 600, output_tokens: 60 });
  expect(report.results[1].recallAt20).toBe(0.5);
  expect(report.results[1].cases[0].rankedAll[0]).toBe("c29");
  expect([...p.files.values()].join(" ")).not.toContain("test-saved-jev-key");
  expect(p.files.get(sourcePath)).toBe(source);
  expect(p.files.get("beir-dissertation-v1.json")).toBe("preserve-old-report");
  expect([...p.files.keys()].some((k) => k.startsWith("beir-reranker-jev-checkpoints/"))).toBe(
    true,
  );
});

test("NFCorpus-only Jev evaluation runs every source query and preserves the SciFact trial", async () => {
  const p = fixture(true, false, "jev", false, "nfcorpus");
  p.files.set("beir-reranker-jev-k20-c30-v1-trial.json", "preserve-scifact-trial");
  await p.ready;
  await p.nodes.get("saved-key")?.onclick?.();
  await p.run();
  expect(p.report().status).toBe("complete");
  expect(p.searches()).toBe(2);
  const report = JSON.parse(p.files.get("beir-reranker-jev-k20-c30-v1-nfcorpus.json")!);
  expect(report.config.datasets).toEqual(["nfcorpus"]);
  expect(report.config.queryLimitPerDataset).toBeUndefined();
  expect(report.results).toHaveLength(2);
  expect(
    report.results.every(
      (r: { dataset: string; queryCount: number }) =>
        r.dataset === "full-beir-nfcorpus" && r.queryCount === 2,
    ),
  ).toBe(true);
  expect([...p.calls.keys()].filter((k) => k.startsWith("nfcorpus question"))).toHaveLength(60);
  expect(
    [...p.calls.keys()].some(
      (k) => k.startsWith("scifact question") || k.startsWith("arguana question"),
    ),
  ).toBe(false);
  expect(p.files.get("beir-reranker-jev-k20-c30-v1-trial.json")).toBe("preserve-scifact-trial");
  expect(p.files.get(sourcePath)).toBe(source);
});
