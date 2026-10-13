import { describe, expect, it } from "vitest";

import { parseEvaluationQuestions } from "../src/agentQuestions";

const question = () => ({
  questionId: "q01",
  question: "Where does the lecture compare brain depth with networks?",
  lectureIds: ["lec11"],
  evidence: [
    [
      {
        lectureId: "lec11",
        startCueId: "lec11-0592",
        endCueId: "lec11-0601",
        startMs: 1553373,
        endMs: 1578030,
      },
    ],
  ],
  requiredPoints: ["The brain has roughly seven layers"],
  kind: "localized",
});

describe("parseEvaluationQuestions", () => {
  it("returns the questions of a valid file and ignores file-level notes", () => {
    const file = { status: "draft", revision: "v1", questions: [question()] };

    expect(parseEvaluationQuestions(file)).toEqual([question()]);
  });

  it("rejects a malformed question with a readable path", () => {
    const bad = {
      ...question(),
      kind: "guess",
      evidence: [[{ ...question().evidence[0][0], endMs: "x" }]],
    };

    expect(() => parseEvaluationQuestions({ questions: [bad] })).toThrow(
      /Invalid questions file\. .*questions\.0\.evidence\.0\.0\.endMs/,
    );
    expect(() => parseEvaluationQuestions({ questions: [bad] })).toThrow(/questions\.0\.kind/);
  });

  it("rejects evidence outside the question's lectures and duplicate IDs", () => {
    const outside = { ...question(), lectureIds: ["lec12"] };
    expect(() => parseEvaluationQuestions({ questions: [outside] })).toThrow(
      /evidence must only cite the question's lectureIds/,
    );
    expect(() => parseEvaluationQuestions({ questions: [question(), question()] })).toThrow(
      /questionId values must be unique/,
    );
  });

  it("rejects a file without questions", () => {
    expect(() => parseEvaluationQuestions([question()])).toThrow(/Invalid questions file/);
  });
});
