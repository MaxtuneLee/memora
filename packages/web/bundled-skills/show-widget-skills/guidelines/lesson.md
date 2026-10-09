# Lesson widgets — explain, explore, check

Read this on top of `guidelines/interactive.md` when learning mode is on, or whenever the widget's job is to teach a concept rather than just show it.

A lesson widget is one chat widget that walks the learner through three stages, one at a time. The explanation itself stays in your response text, above the widget.

## One idea per lesson

A lesson covers the one idea your explanation just taught, and nothing else. If the concept has several parts (a pipeline, a model with stages), the lesson is about the current part only; the other parts get their own lessons later.

- The model shows only that idea, with at most two controls. A model with four toggles for four different steps teaches none of them.
- Every task and every question must be about something the learner can see change in this model, or that your explanation stated in plain words. If the model cannot show it, it does not belong in this lesson.

## Stages

Show a small step indicator at the top (`1 Explore · 2 Check · 3 Result`, sentence case, current step in `--color-text-primary`, others in `--color-text-tertiary`). The model stays visible the whole time; the area under it shows the current stage only. Never show the questions before the learner has explored.

### 1. Explore — guided tasks

The interactive model (sliders, toggles, draggable points, step-through animation) plus a task card under it:

- 2–3 tasks, shown one at a time. Each is one concrete action and what to watch: "Drag the learning rate above 0.8 and watch the loss curve."
- Detect completion from the model's state (a value enters a range, a button was pressed, an animation reached the end). When a task completes, show one sentence on what just happened and why, then reveal the next task.
- A "Skip" text button on each task, so a learner who already gets it is never stuck.
- After the last task, a "Check my understanding" button moves to stage 2.

### 2. Check — questions on the same model

Build the Check and Result stages with the `lesson.quiz` helper, available in chat widget scripts. It shows one question at a time, shuffles choice options, grades, gives one retry with a hint, records the first attempt, shows the score, and sends the report with `sendPrompt` when the learner clicks the button. Do not write any of that yourself; `show_widget` refuses a lesson that reports a result without `lesson.quiz`, or that has no `.task(...)`.

Keep the model visible above the quiz so task questions can be answered on it. Mount the quiz in an empty element and call `start()` when the learner leaves the Explore stage:

```js
const quiz = lesson.quiz(el("quiz"), {
  title: "MFCC part 3: filter bank",
  nextPart: "log and DCT",
  labels: {
    submit: "提交",
    notYet: "还不对。",
    correct: "正确。",
    answer: "答案：",
    next: "下一题",
    seeResult: "看结果",
    toReview: "需要复习：",
    continue: "继续",
    nextPart: "下一节：",
    pickFirst: "先选一个选项。",
  },
  onResult: () => setStep(3),
});

quiz.task({
  concept: "低频滤波器更窄",
  prompt: "调整滤波器个数，让 1000 Hz 以下至少有 8 个滤波器。",
  check: () => countBelow(1000) >= 8,
  answer: () => `${countBelow(1000)} 个`,
  expected: "至少 8 个",
  hint: "梅尔间距下低频更密，把个数往右拖，再看 1000 Hz 左边。",
  why: "梅尔刻度在低频接近线性、在高频压缩，所以同样的个数里大多数落在低频。",
});

quiz.choice({
  concept: "滤波器组的作用",
  prompt: "把 FFT 功率谱乘上梅尔滤波器组并求和，主要得到了什么？",
  answer: "按人耳分辨率合并后的几十个频带能量",
  wrong: [
    { text: "按线性间距合并后的几十个频带能量", why: "间距是梅尔刻度，不是线性的。" },
    { text: "去掉相位之后的完整功率谱", why: "相位在取幅度时就去掉了，这一步是在合并频点。" },
    { text: "已经去相关的倒谱系数", why: "去相关发生在后面的 DCT。" },
  ],
  why: "每个三角滤波器把一段频点合成一个能量值，低频窄、高频宽。",
});

el("go-check").onclick = () => {
  setStep(2);
  quiz.start();
};
```

- `title` is the report title. Set `nextPart` when the lesson is one part of a roadmap; after the last part it is `"final review"`. Pass `labels` in the conversation's language.
- `task` is a question answered by changing the model. `check` reads the model's current state when the learner submits; `answer` describes that state for the report; `expected` is what a correct state looks like, in words.
- `choice` takes the correct `answer` and 3 `wrong` options, each with the misconception it reveals. The helper shuffles them.
- Add `part` to a question in a final review so the report says which part it tests.

Which questions to ask:

- 2–3 questions. At least one `task`; at most one `choice`, except in a final review.
- A `task` can be "reach the target" (set the parameters so the curve passes the marked point) or "predict, then check" (set the model to where you think X happens).
- Write `check` first, then phrase the prompt from it. If the prompt says "at least 8 filters below 1000 Hz", check exactly that.
- Never invent a target number. Every expected value either appears in your explanation or can be read off the model while answering.
- Each question tests one named `concept`.
- Order questions from recall to transfer: the first checks what the explore stage showed, the last applies it to a new case.

### Writing choices

A choice question tests understanding only if someone who half-understands could pick a wrong option. Every option must look like an answer a classmate might give.

- Build each wrong option from a real misconception about this idea: the right mechanism in the wrong step, a true statement that answers a different question, a confused cause and effect, or a near-miss number. Never use options that are absurd or off-topic ("makes all values negative", "converts analog to digital" for a question about DCT).
- All options have the same length, structure, and level of detail. The correct option is not the longest, the most qualified, or the only one using the vocabulary from your explanation. If it is, rewrite the others to match, not the correct one to shrink.
- Each wrong option is plausible on its own, but wrong for one specific reason you can state in the feedback.
- Do not echo the question's wording in only the correct option.
- After a wrong pick, the feedback names that option's specific misconception, not just the right answer.

Bad, the answer is obvious from length and the others are absurd:

- A. Turns the convolution of excitation and vocal tract into a sum, so the two can be separated linearly
- B. Converts the signal from analog to digital
- C. Makes every value negative so the computer runs faster

Good, every option is something a learner who half-remembers might believe:

- A. It turns the product of source and filter spectra into a sum
- B. It compresses loud bands so the filter bank outputs are evenly weighted
- C. It removes the phase so only the magnitude spectrum is left
- D. It turns the convolution of source and filter into a product

### 3. Result — report back

`lesson.quiz` shows the score and the concepts to review, and its button sends a report like this:

```
Lesson result: Gradient descent — 2/3
Q1 correct (concept: learning rate too high diverges)
Q2 wrong: answered 0.9, expected 0.1–0.3 (concept: choosing a learning rate)
Q3 correct (concept: local minima)
Next part: momentum
```

## State

Keep the Explore stage in one plain object (`{ stage, task }`) and re-render from it. No persistence; a lesson lives in the chat.

## When the result comes back

The learner's next message starts with `Lesson result:`. Keep the reply short; the learner just finished an exercise and wants to know what to fix.

- Everything correct and a `Next part:` line: one line of acknowledgement, then teach that part as a new lesson (explanation and widget). For `Next part: final review`, build the final review below instead.
- Everything correct, no next part: one line of acknowledgement, then offer one harder follow-up (a transfer question or a related concept).
- Something wrong: for each missed concept, 2–3 sentences: what the answer shows the learner believes, and why it does not hold, from a different angle than the first explanation. At most one `<memora-jump />` per concept. Then build a short lesson widget (Check stage only) with one new question per missed concept, at most two. Do not repeat the same question.
- 0 correct, or every question missed: the lesson was too big or unclear. Do not quiz again. Re-teach the first missed idea alone, more slowly, as a new lesson.

## Final review

After the last part of a roadmap, test the whole concept once, so the learner sees the parts work together and you see what did not stick.

- One sentence of introduction in text, then a Check-stage-only widget titled `<concept> final review`. No new explanation, no explore stage.
- 5–7 questions, harder than the part lessons:
  - At least one question per part, phrased differently from that part's lesson.
  - At least two questions that need two parts at once: what breaks downstream if a step changes, which step a symptom comes from, or putting the whole pipeline in order.
  - Every concept the learner missed in an earlier part gets a question here, so the review shows whether it stuck.
- Build it with `lesson.quiz` too: title `<concept> final review`, no `nextPart`, and a `part` on every question. At least two `task` questions; a whole-pipeline model where the learner switches steps on or off makes good questions that need two parts at once. Choices follow "Writing choices".

When the final review result comes back: list in one line each which parts are solid and which are not. If any part missed more than one question, offer to re-teach that part as a new lesson; otherwise end with one transfer question the learner can think about on their own.
