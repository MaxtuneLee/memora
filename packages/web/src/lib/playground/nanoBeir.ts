export const NANO_BEIR_DATASET_ID = "sentence-transformers/NanoBEIR-en";
export const NANO_BEIR_REVISION = "beb106fbcfaa599c508c667041bf8c85fd78736b";

export type NanoBeirDatasetId =
  | "NanoClimateFEVER"
  | "NanoDBPedia"
  | "NanoFEVER"
  | "NanoFiQA2018"
  | "NanoHotpotQA"
  | "NanoMSMARCO"
  | "NanoNFCorpus"
  | "NanoNQ"
  | "NanoQuoraRetrieval"
  | "NanoSCIDOCS"
  | "NanoArguAna"
  | "NanoSciFact"
  | "NanoTouche2020";

export type NanoBeirProfileId = "quick" | "standard" | "full";

export interface NanoBeirDatasetDefinition {
  id: NanoBeirDatasetId;
  label: string;
  domain: string;
  corpusCount: number;
  queryCount: number;
  qrelCount: number;
}

export interface NanoBeirProfile {
  id: NanoBeirProfileId;
  label: string;
  description: string;
  datasetIds: NanoBeirDatasetId[];
}

export interface NanoBeirTextRow {
  id: string;
  text: string;
}

export interface NanoBeirQrel {
  queryId: string;
  corpusId: string;
}

export interface NanoBeirEvaluationData {
  definition: NanoBeirDatasetDefinition;
  queries: NanoBeirTextRow[];
  qrels: NanoBeirQrel[];
}

interface NanoBeirRowsResponse {
  rows: Array<{ row: Record<string, unknown> }>;
  num_rows_total: number;
}

type NanoBeirConfig = "corpus" | "queries" | "qrels";
type NanoBeirProgressReporter = (label: string) => void;

export const NANO_BEIR_DATASETS: Record<NanoBeirDatasetId, NanoBeirDatasetDefinition> = {
  NanoClimateFEVER: {
    id: "NanoClimateFEVER",
    label: "Climate-FEVER",
    domain: "Climate fact verification",
    corpusCount: 3408,
    queryCount: 50,
    qrelCount: 148,
  },
  NanoDBPedia: {
    id: "NanoDBPedia",
    label: "DBPedia",
    domain: "Entity retrieval",
    corpusCount: 6045,
    queryCount: 50,
    qrelCount: 1158,
  },
  NanoFEVER: {
    id: "NanoFEVER",
    label: "FEVER",
    domain: "Fact verification",
    corpusCount: 4996,
    queryCount: 50,
    qrelCount: 57,
  },
  NanoFiQA2018: {
    id: "NanoFiQA2018",
    label: "FiQA 2018",
    domain: "Financial question answering",
    corpusCount: 4598,
    queryCount: 50,
    qrelCount: 123,
  },
  NanoHotpotQA: {
    id: "NanoHotpotQA",
    label: "HotpotQA",
    domain: "Multi-hop question answering",
    corpusCount: 5090,
    queryCount: 50,
    qrelCount: 100,
  },
  NanoMSMARCO: {
    id: "NanoMSMARCO",
    label: "MS MARCO",
    domain: "Web passage retrieval",
    corpusCount: 5043,
    queryCount: 50,
    qrelCount: 50,
  },
  NanoNFCorpus: {
    id: "NanoNFCorpus",
    label: "NFCorpus",
    domain: "Biomedical retrieval",
    corpusCount: 2953,
    queryCount: 50,
    qrelCount: 2518,
  },
  NanoNQ: {
    id: "NanoNQ",
    label: "Natural Questions",
    domain: "Open-domain question answering",
    corpusCount: 5035,
    queryCount: 50,
    qrelCount: 57,
  },
  NanoQuoraRetrieval: {
    id: "NanoQuoraRetrieval",
    label: "Quora retrieval",
    domain: "Duplicate question retrieval",
    corpusCount: 5046,
    queryCount: 50,
    qrelCount: 70,
  },
  NanoSCIDOCS: {
    id: "NanoSCIDOCS",
    label: "SCIDOCS",
    domain: "Scientific citation retrieval",
    corpusCount: 2210,
    queryCount: 50,
    qrelCount: 244,
  },
  NanoArguAna: {
    id: "NanoArguAna",
    label: "ArguAna",
    domain: "Counter-argument retrieval",
    corpusCount: 3635,
    queryCount: 50,
    qrelCount: 50,
  },
  NanoSciFact: {
    id: "NanoSciFact",
    label: "SciFact",
    domain: "Scientific claim verification",
    corpusCount: 2919,
    queryCount: 50,
    qrelCount: 56,
  },
  NanoTouche2020: {
    id: "NanoTouche2020",
    label: "Touche 2020",
    domain: "Argument retrieval",
    corpusCount: 5745,
    queryCount: 49,
    qrelCount: 932,
  },
};

const FULL_DATASET_IDS = Object.keys(NANO_BEIR_DATASETS) as NanoBeirDatasetId[];

export const NANO_BEIR_PROFILES: Record<NanoBeirProfileId, NanoBeirProfile> = {
  quick: {
    id: "quick",
    label: "Quick",
    description: "SCIDOCS · 50 queries · smallest corpus in NanoBEIR-en",
    datasetIds: ["NanoSCIDOCS"],
  },
  standard: {
    id: "standard",
    label: "Standard",
    description: "Scientific, biomedical, finance, and argument retrieval",
    datasetIds: ["NanoSciFact", "NanoNFCorpus", "NanoFiQA2018", "NanoArguAna"],
  },
  full: {
    id: "full",
    label: "Full",
    description: "All 13 NanoBEIR-en retrieval tasks",
    datasetIds: FULL_DATASET_IDS,
  },
};

const PAGE_SIZE = 100;
const PAGE_CONCURRENCY = 6;
const CACHE_NAME = `memora-nanobeir-${NANO_BEIR_REVISION.slice(0, 12)}`;

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
};

export const parseNanoBeirTextRows = (rows: NanoBeirRowsResponse["rows"]): NanoBeirTextRow[] => {
  return rows.flatMap(({ row }) => {
    const id = row._id;
    const text = row.text;
    return typeof id === "string" && typeof text === "string" ? [{ id, text }] : [];
  });
};

export const parseNanoBeirQrels = (rows: NanoBeirRowsResponse["rows"]): NanoBeirQrel[] => {
  return rows.flatMap(({ row }) => {
    const queryId = row["query-id"];
    const corpusId = row["corpus-id"];
    return typeof queryId === "string" && typeof corpusId === "string"
      ? [{ queryId, corpusId }]
      : [];
  });
};

const buildRowsUrl = (config: NanoBeirConfig, split: NanoBeirDatasetId, offset: number): string => {
  const params = new URLSearchParams({
    dataset: NANO_BEIR_DATASET_ID,
    config,
    split,
    offset: String(offset),
    length: String(PAGE_SIZE),
    revision: NANO_BEIR_REVISION,
  });
  return `/api/playground/nanobeir?${params.toString()}`;
};

const readResponse = async (response: Response): Promise<NanoBeirRowsResponse> => {
  if (!response.ok) {
    throw new Error(`NanoBEIR download failed with HTTP ${response.status}.`);
  }
  const value = (await response.json()) as unknown;
  if (!isRecord(value) || !Array.isArray(value.rows) || typeof value.num_rows_total !== "number") {
    throw new Error("NanoBEIR returned an unexpected response.");
  }
  return value as unknown as NanoBeirRowsResponse;
};

const fetchPage = async (
  config: NanoBeirConfig,
  split: NanoBeirDatasetId,
  offset: number,
): Promise<NanoBeirRowsResponse> => {
  const url = buildRowsUrl(config, split, offset);
  const cache = typeof caches === "undefined" ? null : await caches.open(CACHE_NAME);
  const cached = await cache?.match(url);
  if (cached) return readResponse(cached);
  const response = await fetch(url);
  if (response.ok) await cache?.put(url, response.clone());
  return readResponse(response);
};

const fetchAllRows = async (
  config: NanoBeirConfig,
  split: NanoBeirDatasetId,
  reportProgress?: NanoBeirProgressReporter,
): Promise<NanoBeirRowsResponse["rows"]> => {
  const firstPage = await fetchPage(config, split, 0);
  const rows = [...firstPage.rows];
  const offsets = Array.from(
    { length: Math.max(0, Math.ceil(firstPage.num_rows_total / PAGE_SIZE) - 1) },
    (_, index) => (index + 1) * PAGE_SIZE,
  );
  for (let start = 0; start < offsets.length; start += PAGE_CONCURRENCY) {
    const batch = offsets.slice(start, start + PAGE_CONCURRENCY);
    const pages = await Promise.all(batch.map((offset) => fetchPage(config, split, offset)));
    rows.push(...pages.flatMap((page) => page.rows));
    reportProgress?.(
      `Downloading ${NANO_BEIR_DATASETS[split].label} ${config}: ${Math.min(rows.length, firstPage.num_rows_total)} of ${firstPage.num_rows_total}`,
    );
  }
  return rows;
};

export const loadNanoBeirEvaluationData = async (
  datasetId: NanoBeirDatasetId,
  reportProgress?: NanoBeirProgressReporter,
): Promise<NanoBeirEvaluationData> => {
  const [queryRows, qrelRows] = await Promise.all([
    fetchAllRows("queries", datasetId, reportProgress),
    fetchAllRows("qrels", datasetId, reportProgress),
  ]);
  return {
    definition: NANO_BEIR_DATASETS[datasetId],
    queries: parseNanoBeirTextRows(queryRows),
    qrels: parseNanoBeirQrels(qrelRows),
  };
};

export const loadNanoBeirCorpus = async (
  datasetId: NanoBeirDatasetId,
  reportProgress?: NanoBeirProgressReporter,
): Promise<NanoBeirTextRow[]> => {
  return parseNanoBeirTextRows(await fetchAllRows("corpus", datasetId, reportProgress));
};

export const getNanoBeirDocumentId = (datasetId: NanoBeirDatasetId): string => {
  return `nanobeir:${NANO_BEIR_REVISION}:${datasetId}`;
};

export const getNanoBeirContentHash = (datasetId: NanoBeirDatasetId): string => {
  return `${NANO_BEIR_DATASET_ID}:${NANO_BEIR_REVISION}:${datasetId}:corpus-v1`;
};

export const getNanoBeirChunkId = (datasetId: NanoBeirDatasetId, corpusId: string): string => {
  return `nanobeir:${datasetId}:${corpusId}`;
};

export const getNanoBeirProfileTotals = (
  profile: NanoBeirProfile,
): { corpusCount: number; queryCount: number; qrelCount: number } => {
  return profile.datasetIds.reduce(
    (total, datasetId) => {
      const dataset = NANO_BEIR_DATASETS[datasetId];
      total.corpusCount += dataset.corpusCount;
      total.queryCount += dataset.queryCount;
      total.qrelCount += dataset.qrelCount;
      return total;
    },
    { corpusCount: 0, queryCount: 0, qrelCount: 0 },
  );
};
