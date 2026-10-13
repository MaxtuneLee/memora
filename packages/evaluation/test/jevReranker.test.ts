import { expect, test } from "vitest";
import {
  buildJevRerankRequest,
  createJevReranker,
  parseJevRerankResponse,
  JEV_RERANKER,
} from "../src/jevReranker";
const output = (p: number, model: string = JEV_RERANKER.modelId) =>
  JSON.stringify({
    model,
    answers: { relevance: { type: "noul", noul: p } },
    usage: { input_tokens: 123, output_tokens: 8 },
  });
test("raw negative probability stays low instead of becoming high no-confidence", () => {
  expect(parseJevRerankResponse(output(0.1)).relevanceProbability).toBe(0.1);
  expect(() => parseJevRerankResponse(output(1.1))).toThrow();
  expect(() => parseJevRerankResponse(output(0.9, "another-model"))).toThrow();
  expect(() => parseJevRerankResponse("{}")).toThrow();
});
test("query and document only, with task-specific relevance and no labels or retrieval scores", () => {
  const body = buildJevRerankRequest("claim", "evidence", "scifact");
  expect(body.state).toEqual({ query: "claim", candidateDocument: "evidence" });
  expect(body.questions.relevance.instructions).toContain("supporting OR refuting");
  expect(
    buildJevRerankRequest("argument", "rebuttal", "arguana").questions.relevance.instructions,
  ).toContain("counterargument");
});
test("remote scoring records model, request timings and usage without credentials", async () => {
  let sent: unknown;
  const scorer = createJevReranker({
    apiKey: "secret",
    baseUrl: "/api/playground/typesafe",
    fetch: async (url, init) => {
      expect(url).toBe("/api/playground/typesafe/v1/systemone");
      expect(init?.headers).toMatchObject({ Authorization: "Bearer secret" });
      if (typeof init?.body !== "string") throw new Error("Expected a JSON request body");
      sent = JSON.parse(init.body);
      return new Response(output(0.1));
    },
  });
  const value = await scorer.score("q", "d", "nfcorpus", new AbortController().signal);
  expect(sent).toEqual(buildJevRerankRequest("q", "d", "nfcorpus"));
  expect(value.relevanceProbability).toBe(0.1);
  expect(value.usage.input_tokens).toBe(123);
  expect(value.requestMs).toBeGreaterThanOrEqual(0);
  expect(value.backend).toBe("remote-api");
  expect(JSON.stringify(value)).not.toContain("secret");
});
test("permanent authentication failure is not retried and echoed credentials are redacted", async () => {
  let calls = 0;
  const scorer = createJevReranker({
    apiKey: "secret",
    fetch: async () => {
      calls++;
      return new Response("bad secret", { status: 401 });
    },
  });
  await expect(scorer.score("q", "d", "scifact", new AbortController().signal)).rejects.toThrow(
    "bad [redacted]",
  );
  expect(calls).toBe(1);
});
test("cancellation aborts the in-flight API call", async () => {
  const controller = new AbortController();
  const scorer = createJevReranker({
    apiKey: "secret",
    fetch: async (_url, init) =>
      new Promise((_resolve, reject) =>
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true }),
      ),
  });
  const pending = scorer.score("q", "d", "scifact", controller.signal);
  controller.abort();
  await expect(pending).rejects.toThrow();
});
