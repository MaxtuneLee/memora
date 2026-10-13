interface CorpusRow {
  _id: string;
  title: string;
  text: string;
}
interface QueryRow {
  _id: string;
  text: string;
}
interface QrelRow {
  "query-id": string;
  "corpus-id": string;
  score: number;
}
interface SourceFile {
  repository: string;
  revision: string;
  path: string;
  url: string;
  bytes: number;
  sha256: string;
  gitBlobSha1: string;
  officialLfsSha256: string | null;
  officialGitBlobSha1: string | null;
}
export interface BeirSourceBundle {
  kind: string;
  formatVersion: number;
  dataset: string;
  source: string;
  hubRevision: string;
  qrelsHubRevision: string;
  hubRevisionStableDuringDownload: boolean;
  corpus: CorpusRow[];
  queries: QueryRow[];
  qrels: QrelRow[];
  sourceFiles: SourceFile[];
  hashes: { corpus: string; allQueries: string; qrels: string };
  counts: { corpus: number; allQueries: number; testQueries: number; qrels: number };
  missingQrelDocuments?: QrelRow[];
  missingQrelPolicy?: string;
  originalReleaseVerification?: unknown;
}

// These five missing positive documents occur in the published ArguAna release
// (MD5 8ad3e3c2a5867cdced806d6503f29b99) as well as its Hugging Face copy.
const ARGUANA_MISSING = new Set(
  [
    "test-free-speech-debate-yfsdfkhbwu-con03",
    "test-education-ufsdfkhbwu-con03",
    "test-politics-dhwem-pro06",
    "test-science-sghwbdgmo-con03",
    "test-society-asfhwapg-con04",
  ].map((prefix) => JSON.stringify([prefix + "a", prefix + "b", 1])),
);

export function validateBeirQrelReferences(
  name: string,
  corpus: Pick<CorpusRow, "_id">[],
  qrels: QrelRow[],
): QrelRow[] {
  // The Hugging Face rows API returns int64 qrel ids as numbers but corpus ids as strings.
  const ids = new Set(corpus.map((row) => String(row._id)));
  const missing: QrelRow[] = [];
  for (const row of qrels) {
    if (!Number.isFinite(row.score) || row.score < 0) throw new Error("Invalid relevance grade");
    if (ids.has(String(row["corpus-id"]))) continue;
    const key = JSON.stringify([row["query-id"], row["corpus-id"], row.score]);
    if (name !== "arguana" || !ARGUANA_MISSING.has(key)) {
      throw new Error("Unexpected qrel document absent from corpus: " + row["corpus-id"]);
    }
    missing.push(row);
  }
  return missing;
}

export async function validateBeirSourceBundle(
  name: string,
  bundle: BeirSourceBundle,
  hash: (value: string) => Promise<string>,
): Promise<BeirSourceBundle> {
  const expected: Record<string, number[]> = {
    nfcorpus: [3633, 3237, 323, 12334],
    arguana: [8674, 1406, 1406, 1406],
  };
  const counts = expected[name];
  if (
    !counts ||
    bundle.kind !== "beir-source-bundle" ||
    bundle.formatVersion !== 1 ||
    bundle.dataset !== name ||
    !bundle.hubRevisionStableDuringDownload ||
    !/^[a-f0-9]{40}$/.test(bundle.hubRevision) ||
    !/^[a-f0-9]{40}$/.test(bundle.qrelsHubRevision)
  ) {
    throw new Error("Invalid local BEIR source metadata");
  }
  const { corpus, queries, qrels } = bundle;
  if (
    !Array.isArray(corpus) ||
    !Array.isArray(queries) ||
    !Array.isArray(qrels) ||
    corpus.length !== counts[0] ||
    queries.length !== counts[1] ||
    qrels.length !== counts[3]
  )
    throw new Error("Incomplete local BEIR arrays");
  const corpusIds = new Set(corpus.map((r) => r._id)),
    queryIds = new Set(queries.map((r) => r._id));
  if (corpusIds.size !== corpus.length || queryIds.size !== queries.length)
    throw new Error("Duplicate local BEIR IDs");
  for (const r of corpus)
    if (typeof r._id !== "string" || typeof r.title !== "string" || typeof r.text !== "string")
      throw new Error("Invalid local BEIR corpus cells");
  for (const r of queries)
    if (typeof r._id !== "string" || typeof r.text !== "string")
      throw new Error("Invalid local BEIR query cells");
  const pairs = new Set(),
    testIds = new Set(),
    positiveIds = new Set();
  for (const r of qrels) {
    if (!queryIds.has(r["query-id"]) || typeof r["corpus-id"] !== "string")
      throw new Error("Invalid local BEIR query reference");
    const key = JSON.stringify([r["query-id"], r["corpus-id"]]);
    if (pairs.has(key)) throw new Error("Duplicate local BEIR qrel pair");
    pairs.add(key);
    testIds.add(r["query-id"]);
    if (r.score > 0) positiveIds.add(r["query-id"]);
  }
  if (
    testIds.size !== counts[2] ||
    positiveIds.size !== testIds.size ||
    !bundle.counts ||
    bundle.counts.corpus !== corpus.length ||
    bundle.counts.allQueries !== queries.length ||
    bundle.counts.testQueries !== testIds.size ||
    bundle.counts.qrels !== qrels.length
  )
    throw new Error("Invalid local BEIR test counts");
  const missing = validateBeirQrelReferences(name, corpus, qrels);
  if (JSON.stringify(missing) !== JSON.stringify(bundle.missingQrelDocuments ?? []))
    throw new Error("Local BEIR missing-document metadata differs");
  for (const [repo, revision, path] of [
    ["BeIR/" + name, bundle.hubRevision, "corpus/corpus-00000-of-00001.parquet"],
    ["BeIR/" + name, bundle.hubRevision, "queries/queries-00000-of-00001.parquet"],
    ["BeIR/" + name + "-qrels", bundle.qrelsHubRevision, "test.tsv"],
  ]) {
    const file = bundle.sourceFiles?.find((f) => f.repository === repo && f.path === path);
    if (
      !file ||
      file.revision !== revision ||
      file.url !== `https://huggingface.co/datasets/${repo}/resolve/${revision}/${path}` ||
      !(file.bytes > 0) ||
      !/^[a-f0-9]{64}$/.test(file.sha256) ||
      (file.officialLfsSha256
        ? file.sha256 !== file.officialLfsSha256
        : !file.officialGitBlobSha1 || file.gitBlobSha1 !== file.officialGitBlobSha1)
    )
      throw new Error("Invalid pinned source-file evidence");
  }
  for (const [key, rows] of [
    ["corpus", corpus],
    ["allQueries", queries],
    ["qrels", qrels],
  ] as const) {
    if (
      !bundle.hashes ||
      !/^[a-f0-9]{64}$/.test(bundle.hashes[key]) ||
      (await hash(JSON.stringify(rows))) !== bundle.hashes[key]
    )
      throw new Error("Local BEIR array digest mismatch: " + key);
  }
  return bundle;
}

export async function loadBeirSourceBundle(
  name: string,
  options: {
    hash: (value: string) => Promise<string>;
    signal?: AbortSignal;
    fetcher?: typeof fetch;
  },
): Promise<BeirSourceBundle | null> {
  if (name === "scifact") return null;
  const response = await (options.fetcher ?? fetch)(
    "/api/playground/eval-data/beir/" + encodeURIComponent(name) + ".json",
    {
      cache: "no-store",
      signal: options.signal
        ? AbortSignal.any([options.signal, AbortSignal.timeout(45000)])
        : AbortSignal.timeout(45000),
    },
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("Local BEIR data HTTP " + response.status);
  return validateBeirSourceBundle(name, await response.json(), options.hash);
}
