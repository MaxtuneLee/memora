// @vitest-environment jsdom
import { expect, test, vi } from "vite-plus/test";

import { createLessonQuiz, shuffle } from "@/lib/chat/lessonQuiz";

const click = (mount: HTMLElement, text: string): void => {
  const button = [...mount.querySelectorAll("button")].find((node) => node.textContent === text);
  if (!button) throw new Error(`No button "${text}"`);
  button.click();
};

test("shuffle moves the answer out of first place", () => {
  const positions = new Set<number>();
  for (let run = 0; run < 50; run += 1) {
    positions.add(shuffle(["answer", "b", "c", "d"]).indexOf("answer"));
  }
  expect(positions.size).toBeGreaterThan(1);
});

test("grades the first attempt, gives one retry, and reports the result", async () => {
  const mount = document.createElement("div");
  const sendPrompt = vi.fn(async () => undefined);
  let filters = 4;

  createLessonQuiz(mount, { title: "Filter bank", nextPart: "log and DCT" }, sendPrompt)
    .task({
      concept: "narrow low bands",
      prompt: "Put at least 8 filters below 1000 Hz.",
      check: () => filters >= 8,
      answer: () => `${filters} filters`,
      expected: "at least 8",
      hint: "Add filters.",
      why: "Mel spacing packs low frequencies.",
    })
    .choice({
      concept: "what the bank outputs",
      prompt: "What comes out?",
      answer: "Band energies",
      wrong: [
        { text: "Phase", why: "Phase is gone already." },
        { text: "Cepstrum", why: "That is after DCT." },
        { text: "Raw spectrum", why: "Bins are merged." },
      ],
      why: "Each triangle sums its bins.",
    })
    .start();

  click(mount, "Submit");
  expect(mount.textContent).toContain("Add filters.");
  filters = 10;
  click(mount, "Submit");
  click(mount, "Next");

  click(mount, "Submit");
  expect(mount.textContent).toContain("Pick one option first.");
  click(mount, "Band energies");
  click(mount, "Submit");
  click(mount, "See result");

  expect(mount.textContent).toContain("1 / 2");
  click(mount, "Continue ↗");
  expect(sendPrompt).toHaveBeenCalledWith(
    [
      "Lesson result: Filter bank — 1/2",
      "Q1 wrong: answered 4 filters, expected at least 8 (concept: narrow low bands)",
      "Q2 correct (concept: what the bank outputs)",
      "Next part: log and DCT",
    ].join("\n"),
  );
});

test("a multi question counts only the exact set of true options", () => {
  const mount = document.createElement("div");
  const sendPrompt = vi.fn(async () => undefined);
  createLessonQuiz(mount, { title: "Testing" }, sendPrompt)
    .multi({
      concept: "sensitivity versus predictive value",
      prompt: "Which are true?",
      answers: ["Sick people mostly test positive", "Healthy people sometimes test positive"],
      wrong: [{ text: "Positive tests are mostly right", why: "That is the predictive value." }],
      why: "Sensitivity and the false positive rate describe the test, not the result.",
    })
    .start();

  expect(mount.textContent).toContain("Select all that apply.");
  click(mount, "Sick people mostly test positive");
  click(mount, "Submit");
  expect(mount.textContent).toContain("Some true statements are not selected yet.");
  click(mount, "Healthy people sometimes test positive");
  click(mount, "Submit");
  click(mount, "See result");
  click(mount, "Continue ↗");
  expect(sendPrompt).toHaveBeenCalledWith(
    [
      "Lesson result: Testing — 0/1",
      "Q1 wrong: answered Sick people mostly test positive, expected Sick people mostly test positive; Healthy people sometimes test positive (concept: sensitivity versus predictive value)",
    ].join("\n"),
  );
});

test("a setup step keeps the options locked until it passes on the model", async () => {
  vi.useFakeTimers();
  const mount = document.createElement("div");
  let baseRate = 1;
  createLessonQuiz(
    mount,
    { title: "Base rate" },
    vi.fn(async () => undefined),
  )
    .choice({
      concept: "base rate",
      prompt: "What is the predictive value now?",
      answer: "About 53%",
      wrong: [{ text: "About 10%", why: "That is the base rate itself." }],
      why: "More sick people means more true positives.",
      setup: { prompt: "Drag the base rate to 10%.", check: () => baseRate >= 10 },
    })
    .start();

  const submit = [...mount.querySelectorAll("button")].find(
    (node) => node.textContent === "Submit",
  );
  expect(submit?.disabled).toBe(true);
  baseRate = 10;
  await vi.advanceTimersByTimeAsync(250);
  expect(submit?.disabled).toBe(false);
  expect(mount.textContent).toContain("Done.");
  vi.useRealTimers();
});
