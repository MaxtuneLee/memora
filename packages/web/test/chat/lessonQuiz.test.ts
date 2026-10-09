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
