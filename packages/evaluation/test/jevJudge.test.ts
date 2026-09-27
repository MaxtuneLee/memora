import { describe, expect, it } from "vitest";

import {
  JEV_PROMPT_VERSION,
  buildJevRequest,
  createJevJudge,
  parseJevVerdict,
  type JudgeInput,
} from "../src/index";

const input: JudgeInput = {
  question: "Why use a bottleneck?",
  requiredPoints: ["It forces compression", "It drops noise"],
  disallowedClaims: ["It adds parameters"],
  citedCues: [
    { lectureId: "lec11", cueId: "11-40", startMs: 100_000, endMs: 103_000, text: " compress" },
  ],
  answer: "The bottleneck forces compression.",
};

const body = (answers: Record<string, unknown>) =>
  JSON.stringify({ model: "jev-1", answers, usage: { input_tokens: 1, output_tokens: 1 } });

describe("buildJevRequest", () => {
  it("asks one yes/no question per point, per disallowed claim, and one for unsupported claims", () => {
    const request = buildJevRequest(input, "jev-latest");

    expect(request.model).toBe("jev-latest");
    expect(request.state).toEqual({
      question: "Why use a bottleneck?",
      answer: "The bottleneck forces compression.",
      citedTranscript: [
        { lecture: "lec11", cue: "11-40", startSec: 100, endSec: 103, text: "compress" },
      ],
    });
    expect(Object.keys(request.questions)).toEqual([
      "point_0",
      "point_1",
      "disallowed_0",
      "unsupported",
    ]);
    for (const question of Object.values(request.questions)) expect(question.type).toBe("noul");
    expect(request.questions.point_1.instructions).toContain("It drops noise");
    expect(request.questions.disallowed_0.instructions).toContain("It adds parameters");
  });
});

describe("parseJevVerdict", () => {
  it("turns probabilities into decisions in input order with the confidence of each decision", () => {
    const raw = body({
      point_0: { type: "noul", noul: 0.9 },
      point_1: { type: "noul", noul: 0.2 },
      disallowed_0: { type: "noul", noul: 0.4 },
      unsupported: { type: "noul", noul: 0.5 },
    });

    expect(parseJevVerdict(input, raw)).toEqual({
      requiredPoints: [
        { point: "It forces compression", supported: true, confidence: 0.9 },
        { point: "It drops noise", supported: false, confidence: 0.8 },
      ],
      disallowedClaims: [{ claim: "It adds parameters", present: false, confidence: 0.6 }],
      unsupportedClaims: { present: true, confidence: 0.5 },
      rawOutput: raw,
    });
  });

  it("rejects malformed output with a reason", () => {
    expect(() => parseJevVerdict(input, "not json")).toThrow(/not JSON/);
    expect(() => parseJevVerdict(input, body({ point_0: { type: "noul", noul: 0.9 } }))).toThrow(
      /point_1/,
    );
    expect(() =>
      parseJevVerdict(
        input,
        body({
          point_0: { type: "noul", noul: 1.2 },
          point_1: { type: "noul", noul: 0.2 },
          disallowed_0: { type: "noul", noul: 0.4 },
          unsupported: { type: "noul", noul: 0.5 },
        }),
      ),
    ).toThrow(/point_0/);
  });
});

describe("createJevJudge", () => {
  it("posts to /v1/systemone with the key and reports API errors as failures", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const judge = createJevJudge({
      apiKey: "key",
      baseUrl: "/api/typesafe/",
      fetch: async (url, init) => {
        calls.push({ url, init });
        return new Response('{"detail":{"message":"Must supply an API key!"}}', { status: 403 });
      },
    });

    expect(judge.identity).toEqual({
      judge: "jev",
      model: "jev-latest",
      promptVersion: JEV_PROMPT_VERSION,
    });
    await expect(judge.judge(input, new AbortController().signal)).rejects.toThrow(
      /403.*Must supply an API key/,
    );
    expect(calls[0].url).toBe("/api/typesafe/v1/systemone");
    expect(calls[0].init?.headers).toMatchObject({ Authorization: "Bearer key" });
  });
});
