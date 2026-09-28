import { describe, expect, it } from "vitest";

import {
  answerProse,
  memoryAttemptReasons,
  parseMemoryCases,
  parseMemoryProfiles,
  runMemoryEvaluation,
  runTextChecks,
  type MemoryAdapter,
  type MemoryCase,
  type MemoryReply,
} from "../src/index";

const identity = {
  adapter: "fake",
  model: "fake-model",
  promptRevision: "prompt-1",
  tools: ["remember_user_preference", "read_chat_session"],
  settings: {},
};

const reply = (overrides: Partial<MemoryReply> = {}): MemoryReply => ({
  answer: "OK.",
  toolCalls: [],
  notices: [],
  sessionId: "eval-session",
  runId: "run-1",
  fallbackTrims: 0,
  ...overrides,
});

const agent = (answer: (caseId: string) => MemoryReply): MemoryAdapter => ({
  identity,
  converse: async ({ caseId }) => answer(caseId),
});

const remember = { name: "remember_user_preference", args: {} };

describe("runTextChecks", () => {
  it("tells Chinese prose with English terms from English prose, once citation tags are removed", () => {
    const zh = answerProse(
      '对比学习（contrastive learning）把正样本拉近。<memora-jump file-id="a" start="1" end="2" />',
    );
    const en = "Contrastive learning pulls positive pairs together.";
    const language = [{ type: "language", language: "zh" } as const];
    expect(runTextChecks(zh, language)[0].passed).toBe(true);
    expect(runTextChecks(en, language)[0].passed).toBe(false);
    expect(runTextChecks(en, [{ type: "language", language: "en" }])[0].passed).toBe(true);
  });

  it("counts Latin words and CJK characters as words", () => {
    expect(runTextChecks("one two three", [{ type: "maxWords", value: 3 }])[0].passed).toBe(true);
    expect(runTextChecks("one 两个", [{ type: "maxWords", value: 2 }])[0]).toMatchObject({
      passed: false,
      detail: "3 words",
    });
  });

  it("checks patterns case-insensitively by default, either way round", () => {
    const text = "- first\n- second";
    expect(runTextChecks(text, [{ type: "pattern", pattern: "^- ", flags: "m" }])[0].passed).toBe(
      true,
    );
    expect(
      runTextChecks("BATCH SIZE 512", [{ type: "pattern", pattern: "256", expect: "noMatch" }])[0]
        .passed,
    ).toBe(true);
  });
});

describe("memory files", () => {
  it("rejects an invalid pattern and a recall case naming an unknown session", () => {
    expect(() =>
      parseMemoryProfiles({
        profiles: [{ profileId: "p", notices: ["n"], checks: [{ type: "pattern", pattern: "(" }] }],
      }),
    ).toThrow(/valid regular expression/);
    expect(() =>
      parseMemoryCases({
        sessions: [],
        cases: [
          {
            caseId: "r1",
            kind: "recall",
            category: "recall",
            message: "What did we decide?",
            sessionIds: ["missing"],
            checks: [{ type: "pattern", pattern: "512" }],
          },
        ],
      }),
    ).toThrow(/sessionIds/);
  });
});

describe("runMemoryEvaluation", () => {
  const cases: MemoryCase[] = [
    {
      caseId: "s-durable",
      kind: "save",
      category: "durable",
      message: "From now on, answer in Chinese.",
      expect: "save",
      noticeChecks: [{ type: "pattern", pattern: "chinese" }],
    },
    {
      caseId: "s-oneoff",
      kind: "save",
      category: "one-off",
      message: "Answer this one in a table.",
      expect: "skip",
    },
    {
      caseId: "r-latest",
      kind: "recall",
      category: "latest",
      message: "What batch size did we settle on?",
      sessionIds: ["later"],
      checks: [{ type: "pattern", pattern: "512" }],
    },
  ];
  const run = (answer: (caseId: string) => MemoryReply) =>
    runMemoryEvaluation({
      cases,
      sessions: [],
      revisions: { cases: "sha" },
      agent: agent(answer),
    });

  it("passes correct decisions, well-formed notices, and recalls that read the right session", async () => {
    const result = await run((caseId) =>
      caseId === "s-durable"
        ? reply({ toolCalls: [remember], notices: ["User prefers answers in Chinese."] })
        : caseId === "r-latest"
          ? reply({
              answer: "We settled on 512.",
              toolCalls: [{ name: "read_chat_session", args: { session_id: "later" } }],
            })
          : reply(),
    );
    expect(result.summary).toMatchObject({
      plannedAttempts: 9,
      passed: 9,
      save: { truePositive: 3, trueNegative: 3, noticeChecked: 3, noticePassed: 3 },
      recall: { passed: 3, readExpected: 3 },
    });
  });

  it("fails a one-off save, a missing or non-English notice, and a recall without reading", async () => {
    const result = await run((caseId) =>
      caseId === "s-durable"
        ? reply({ toolCalls: [remember], notices: ["用户希望用中文回答。"] })
        : caseId === "s-oneoff"
          ? reply({ toolCalls: [remember] })
          : reply({ answer: "We settled on 512." }),
    );
    expect(result.summary.passed).toBe(0);
    expect(result.summary.save).toMatchObject({ falsePositive: 3, noticePassed: 0 });
    const byCase = (caseId: string) => {
      const attempt = result.attempts.find((item) => item.caseId === caseId);
      const item = cases.find((entry) => entry.caseId === caseId);
      return attempt && item ? memoryAttemptReasons(item, attempt) : [];
    };
    expect(byCase("s-oneoff")).toEqual(["Saved a one-off message as a preference"]);
    expect(byCase("s-durable").join("\n")).toMatch(/Notice in English.*failed/);
    expect(byCase("r-latest")).toEqual(["Did not read later"]);
  });

  it("passes a changed preference only when the old notice is gone, and hands the adapter the saved notices", async () => {
    const change: MemoryCase = {
      caseId: "s-change",
      kind: "save",
      category: "change",
      message: "Actually, answer in Chinese from now on.",
      notices: ["User prefers answers in English."],
      expect: "save",
      noticeChecks: [
        { type: "pattern", pattern: "chinese" },
        { type: "pattern", pattern: "english", expect: "noMatch" },
      ],
    };
    const given: Array<string[] | undefined> = [];
    const answers = [
      ["User prefers answers in Chinese."],
      ["User prefers answers in English.", "User prefers answers in Chinese."],
      ["User prefers answers in English."],
    ];
    const result = await runMemoryEvaluation({
      cases: [change],
      sessions: [],
      revisions: { cases: "sha" },
      agent: {
        identity,
        converse: async ({ notices }) => {
          given.push(notices);
          return reply({ toolCalls: [remember], notices: answers[given.length - 1] });
        },
      },
      concurrency: 1,
    });

    expect(given).toEqual([change.notices, change.notices, change.notices]);
    expect(result.attempts.map(({ passed }) => passed)).toEqual([true, false, false]);
    expect(result.attempts[1].save?.noticeChecks.find(({ passed }) => !passed)?.label).toMatch(
      /english/,
    );
    expect(memoryAttemptReasons(change, result.attempts[2]).join("\n")).toMatch(
      /the saved notices did not change/,
    );
  });
});
