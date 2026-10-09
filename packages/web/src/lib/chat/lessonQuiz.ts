// The Check and Result stages of a lesson widget (see bundled-skills/show-widget-skills/guidelines/
// lesson.md). The model only supplies the questions; shuffling, grading, retries, and the result
// report live here, because models left to write them put the answer first and skip the
// hands-on questions.

export interface LessonTaskQuestion {
  concept: string;
  part?: string;
  prompt: string;
  // Reads the widget's own model when the learner submits.
  check: () => boolean;
  // What the learner set, for the report, such as "16 filters".
  answer?: () => string;
  expected: string;
  hint: string;
  why: string;
}

export interface LessonChoiceQuestion {
  concept: string;
  part?: string;
  prompt: string;
  answer: string;
  wrong: Array<{ text: string; why: string }>;
  why: string;
}

const DEFAULT_LABELS = {
  submit: "Submit",
  notYet: "Not yet.",
  correct: "Correct.",
  answer: "Answer:",
  next: "Next",
  seeResult: "See result",
  toReview: "To review:",
  continue: "Continue",
  nextPart: "Next:",
  pickFirst: "Pick one option first.",
};

export interface LessonQuizOptions {
  title: string;
  nextPart?: string;
  // Button and feedback text in the conversation's language.
  labels?: Partial<typeof DEFAULT_LABELS>;
  onResult?: (correct: number, total: number) => void;
}

interface LessonQuestion {
  kind: "task" | "choice";
  concept: string;
  part?: string;
}

export interface LessonRecord {
  question: LessonQuestion;
  correct: boolean;
  answer: string;
  expected: string;
}

export interface LessonQuiz {
  task: (question: LessonTaskQuestion) => LessonQuiz;
  choice: (question: LessonChoiceQuestion) => LessonQuiz;
  start: () => void;
}

export const shuffle = <T>(items: readonly T[], random = Math.random): T[] => {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [result[index], result[swap]] = [result[swap] as T, result[index] as T];
  }
  return result;
};

export const buildLessonReport = (
  options: LessonQuizOptions,
  records: readonly LessonRecord[],
): string => {
  const correct = records.filter((record) => record.correct).length;
  const lines = records.map((record, index) => {
    const about = record.question.part
      ? `part: ${record.question.part}, concept: ${record.question.concept}`
      : `concept: ${record.question.concept}`;
    return record.correct
      ? `Q${index + 1} correct (${about})`
      : `Q${index + 1} wrong: answered ${record.answer}, expected ${record.expected} (${about})`;
  });
  return [
    `Lesson result: ${options.title} — ${correct}/${records.length}`,
    ...lines,
    ...(options.nextPart ? [`Next part: ${options.nextPart}`] : []),
  ].join("\n");
};

type Step = (done: (record: LessonRecord) => void) => void;

export const createLessonQuiz = (
  mount: HTMLElement,
  options: LessonQuizOptions,
  sendPrompt: (text: string) => Promise<void>,
): LessonQuiz => {
  const doc = mount.ownerDocument;
  const t = { ...DEFAULT_LABELS, ...options.labels };
  const steps: Step[] = [];
  const records: LessonRecord[] = [];

  const el = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    style: string,
    text?: string,
  ): HTMLElementTagNameMap[K] => {
    const node = doc.createElement(tag);
    node.setAttribute("style", style);
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const verdict = (ok: boolean, label: string, detail: string): HTMLElement => {
    const line = el("p", "margin:12px 0 0;font-size:14px;line-height:1.7;");
    line.append(
      el(
        "span",
        `font-weight:500;color:var(--color-text-${ok ? "success" : "danger"});`,
        `${label} `,
      ),
      detail,
    );
    return line;
  };

  // One question card: the prompt, the learner's input, Submit, then feedback and Next.
  const card = (
    question: LessonQuestion,
    prompt: string,
    input: HTMLElement | null,
    // null while there is nothing to grade yet, such as no option picked.
    grade: () => { ok: boolean; answer: string } | null,
    hint: (answer: string) => string,
    expected: string,
    why: string,
  ): Step => {
    return (done) => {
      const index = records.length + 1;
      mount.replaceChildren();
      mount.append(
        el(
          "p",
          "margin:0 0 4px;font-size:13px;color:var(--color-text-tertiary);",
          `${index} / ${steps.length}`,
        ),
        el("p", "margin:0 0 12px;font-size:15px;line-height:1.7;", prompt),
      );
      if (input) mount.append(input);
      const feedback = el("div", "");
      const submit = el("button", "margin-top:12px;", t.submit);
      mount.append(submit, feedback);
      let first: LessonRecord | null = null;
      submit.addEventListener("click", () => {
        const graded = grade();
        if (!graded) {
          feedback.replaceChildren(verdict(false, "", t.pickFirst));
          return;
        }
        const { ok, answer } = graded;
        // Only the first attempt counts; a wrong one gets a hint and one more try.
        const isRetry = first !== null;
        const record: LessonRecord = first ?? { question, correct: ok, answer, expected };
        first = record;
        if (!ok && !isRetry) {
          feedback.replaceChildren(verdict(false, t.notYet, hint(answer)));
          return;
        }
        submit.disabled = true;
        if (input) input.style.pointerEvents = "none";
        const next = el(
          "button",
          "margin-top:12px;",
          index === steps.length ? t.seeResult : t.next,
        );
        next.addEventListener("click", () => done(record));
        feedback.replaceChildren(
          ok ? verdict(true, t.correct, why) : verdict(false, `${t.answer} ${expected}.`, why),
          next,
        );
      });
    };
  };

  const showResult = (): void => {
    const correct = records.filter((record) => record.correct).length;
    const missed = records.filter((record) => !record.correct).map((r) => r.question.concept);
    options.onResult?.(correct, records.length);
    mount.replaceChildren(
      el("p", "margin:0 0 8px;font-size:18px;font-weight:500;", `${correct} / ${records.length}`),
    );
    if (missed.length > 0) {
      mount.append(
        el(
          "p",
          "margin:0 0 12px;font-size:14px;line-height:1.7;color:var(--color-text-secondary);",
          `${t.toReview} ${[...new Set(missed)].join(", ")}`,
        ),
      );
    }
    const label =
      options.nextPart && missed.length === 0
        ? `${t.nextPart} ${options.nextPart} ↗`
        : `${t.continue} ↗`;
    const button = el("button", "", label);
    button.addEventListener("click", () => {
      button.disabled = true;
      void sendPrompt(buildLessonReport(options, records));
    });
    mount.append(button);
  };

  const run = (index: number): void => {
    const step = steps[index];
    if (!step) {
      showResult();
      return;
    }
    step((record) => {
      records.push(record);
      run(index + 1);
    });
  };

  const quiz: LessonQuiz = {
    task: (question) => {
      const read = (): string => {
        try {
          return question.answer?.() ?? "";
        } catch {
          return "";
        }
      };
      steps.push(
        card(
          { kind: "task", concept: question.concept, part: question.part },
          question.prompt,
          null,
          () => {
            let ok = false;
            try {
              ok = question.check() === true;
            } catch {
              ok = false;
            }
            return { ok, answer: read() || "a different setting" };
          },
          () => question.hint,
          question.expected,
          question.why,
        ),
      );
      return quiz;
    },
    choice: (question) => {
      const options = shuffle([
        { text: question.answer, why: question.why, correct: true },
        ...question.wrong.map((option) => ({ ...option, correct: false })),
      ]);
      const list = el("div", "display:flex;flex-direction:column;gap:8px;");
      let picked: (typeof options)[number] | null = null;
      for (const option of options) {
        const button = el(
          "button",
          "text-align:left;white-space:normal;justify-content:flex-start;height:auto;padding:8px 12px;",
          option.text,
        );
        button.setAttribute("aria-pressed", "false");
        button.addEventListener("click", () => {
          picked = option;
          for (const other of list.children) {
            const selected = other === button;
            other.setAttribute("aria-pressed", String(selected));
            (other as HTMLElement).style.borderColor = selected ? "var(--color-border-info)" : "";
          }
        });
        list.append(button);
      }
      steps.push(
        card(
          { kind: "choice", concept: question.concept, part: question.part },
          question.prompt,
          list,
          () => (picked ? { ok: picked.correct, answer: picked.text } : null),
          () => picked?.why ?? t.pickFirst,
          question.answer,
          question.why,
        ),
      );
      return quiz;
    },
    start: () => run(0),
  };
  return quiz;
};
