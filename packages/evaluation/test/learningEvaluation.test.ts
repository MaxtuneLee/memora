import { describe, expect, it } from "vitest";

import {
  lessonFacts,
  parseLearningCases,
  runLearningEvaluation,
  scoreLearningReply,
  type LearningAdapter,
  type LearningReply,
} from "../src/index";

const WIDGET_CODE = `
<div id="quiz"></div>
<script>
const quiz = lesson.quiz(el("quiz"), {
  title: "DBSCAN part 1: core points",
  nextPart: "growing clusters",
  labels: { submit: "Submit", nextPart: "Next: " },
});
quiz.task({
  concept: "core point",
  prompt: "Drag ε until the red point becomes a core point.",
  check: () => isCore(red),
});
quiz.choice({
  concept: "minPts",
  prompt: "What happens to core points when minPts goes up?",
  answer: "Fewer points have enough neighbors within ε to count as core points",
  wrong: [
    { text: "More points become core points", why: "" },
    { text: "The circles get larger", why: "" },
    { text: "Nothing changes", why: "" },
  ],
});
</script>`;

const widget = (code = WIDGET_CODE, error?: string) => ({
  name: "show_widget",
  args: { title: "Core points", widget_code: code },
  ...(error ? { error } : {}),
});

const reply = (overrides: Partial<LearningReply> = {}): LearningReply => ({
  answer: "Part 1 of 4: core points\n\nA core point has enough neighbors.",
  toolCalls: [{ name: "search_files", args: {} }, widget()],
  sessionId: "eval-session",
  runId: "run-1",
  fallbackTrims: 0,
  ...overrides,
});

describe("lessonFacts", () => {
  it("reads questions, title, nextPart, and prompts from the last accepted widget", () => {
    const facts = lessonFacts(reply({ toolCalls: [widget(), widget("broken", "refused")] }));
    expect(facts).toMatchObject({
      widgets: 1,
      rejectedWidgets: 1,
      tasks: 1,
      choices: 1,
      title: "DBSCAN part 1: core points",
      nextPart: "growing clusters",
      withPart: 0,
      prompts: [
        "Drag ε until the red point becomes a core point.",
        "What happens to core points when minPts goes up?",
      ],
      longestAnswerChoices: 1,
    });
  });

  it("does not take the nextPart button label for the quiz's nextPart", () => {
    const code = WIDGET_CODE.replace('  nextPart: "growing clusters",\n', "");
    expect(lessonFacts(reply({ toolCalls: [widget(code)] })).nextPart).toBeUndefined();
  });

  it("finds nothing in a reply without a widget", () => {
    expect(lessonFacts(reply({ toolCalls: [] }))).toMatchObject({ widgets: 0, tasks: 0 });
  });
});

describe("scoreLearningReply", () => {
  it("passes a part-one lesson against the large-concept checks", () => {
    const { checks } = scoreLearningReply(
      [
        { type: "widgets", count: [1, 1] },
        { type: "quiz", tasks: [1, 3], choices: [0, 1], questions: [2, 3], nextPart: "set" },
        { type: "readLibrary" },
        { type: "pattern", pattern: String.raw`part 1 of [3-5]` },
      ],
      reply(),
    );
    expect(checks.filter((check) => !check.passed)).toEqual([]);
  });

  it("fails a repeated question and a missing roadmap", () => {
    const { checks } = scoreLearningReply(
      [
        { type: "quiz", notRepeating: ["drag ε until the red point becomes a core point"] },
        { type: "roadmap" },
      ],
      reply(),
    );
    expect(checks.map((check) => check.passed)).toEqual([true, false, false]);
  });

  it("fails an empty reply even when every case check passes", () => {
    const { checks } = scoreLearningReply(
      [{ type: "widgets", count: [0, 0] }],
      reply({ answer: "", toolCalls: [] }),
    );
    expect(checks.map((check) => check.passed)).toEqual([false, true]);
  });

  it("counts a 2–6 item roadmap in English or Chinese numbering", () => {
    const roadmap = [{ type: "roadmap" } as const];
    const en = "1. Core points\n2. Growing clusters\n3. Border and noise\n4. Choosing ε";
    const zh = "1、核心点\n2、扩展成簇\n3、边界点和噪声";
    expect(scoreLearningReply(roadmap, reply({ answer: en })).checks[0].passed).toBe(true);
    expect(scoreLearningReply(roadmap, reply({ answer: zh })).checks[0].passed).toBe(true);
  });
});

describe("runLearningEvaluation", () => {
  it("keeps report-only cases out of the pass count and passes history to the agent", async () => {
    const histories: number[] = [];
    const agent: LearningAdapter = {
      identity: { adapter: "fake", model: "m", promptRevision: "p", tools: [], settings: {} },
      converse: async ({ history }) => {
        histories.push(history.length);
        return reply();
      },
    };
    const cases = parseLearningCases({
      cases: [
        {
          caseId: "r01",
          category: "result",
          history: [
            { role: "user", content: "Teach me DBSCAN." },
            { role: "assistant", content: "Part 1 of 4 …" },
          ],
          message: "Lesson result: DBSCAN part 1 — 3/3",
          checks: [{ type: "widgets", count: [1, 1] }],
        },
        {
          caseId: "p01",
          category: "prerequisite",
          message: "Teach me MFCC.",
          checks: [{ type: "pattern", pattern: "fourier" }],
          report: true,
        },
      ],
    });
    const result = await runLearningEvaluation({ cases, revisions: { cases: "x" }, agent });
    expect(histories).toContain(2);
    expect(result.summary).toMatchObject({
      passed: 3,
      gatingAttempts: 3,
      reportPassed: 0,
      reportAttempts: 3,
    });
  });
});
