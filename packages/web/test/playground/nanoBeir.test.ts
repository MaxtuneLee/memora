import { describe, expect, test } from "vite-plus/test";

import {
  getNanoBeirChunkId,
  getNanoBeirContentHash,
  getNanoBeirDocumentId,
  getNanoBeirProfileTotals,
  NANO_BEIR_PROFILES,
  NANO_BEIR_REVISION,
  parseNanoBeirQrels,
  parseNanoBeirTextRows,
} from "../../src/lib/playground/nanoBeir";

describe("NanoBEIR dataset adapter", () => {
  test("parses public text and qrel rows while rejecting malformed rows", () => {
    expect(
      parseNanoBeirTextRows([
        { row: { _id: "doc-1", text: "A public benchmark passage." } },
        { row: { _id: 2, text: "invalid" } },
      ]),
    ).toEqual([{ id: "doc-1", text: "A public benchmark passage." }]);
    expect(
      parseNanoBeirQrels([
        { row: { "query-id": "q-1", "corpus-id": "doc-1" } },
        { row: { "query-id": "q-2" } },
      ]),
    ).toEqual([{ queryId: "q-1", corpusId: "doc-1" }]);
  });

  test("uses revision-qualified OPFS document identities", () => {
    expect(getNanoBeirDocumentId("NanoSCIDOCS")).toContain(NANO_BEIR_REVISION);
    expect(getNanoBeirContentHash("NanoSCIDOCS")).toContain(NANO_BEIR_REVISION);
    expect(getNanoBeirChunkId("NanoSCIDOCS", "paper-1")).toBe("nanobeir:NanoSCIDOCS:paper-1");
  });

  test("publishes stable profile totals", () => {
    expect(getNanoBeirProfileTotals(NANO_BEIR_PROFILES.quick)).toEqual({
      corpusCount: 2210,
      queryCount: 50,
      qrelCount: 244,
    });
    expect(NANO_BEIR_PROFILES.full.datasetIds).toHaveLength(13);
  });
});
