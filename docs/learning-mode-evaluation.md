# Learning mode evaluation

## What it measures

Learning mode turns a chat reply into a lesson: an explanation, then an interactive widget that walks the learner through tasks and a short quiz, then a reply to the quiz result. Its effect can be judged at three levels, from cheapest to most telling:

1. **Protocol**: does the agent follow what learning mode asks of it (when to teach, how to split a large concept, the shape of the quiz, what to do with each kind of result)? Checked by code over the reply and its tool calls.
2. **Lesson quality**: does each widget run, can every task be completed, are the questions sound?
3. **Learning**: does a learner who holds a misconception get it right after the remediation turn?

Only level 1 is built. It catches regressions when the prompt, the model, or a tool changes, and it has already found and fixed several real problems (see "What it found"). Levels 2 and 3 are next.

The protocol under test is `packages/web/src/lib/chat/learningMode.ts` (the prompt segment added while the composer's learning mode is on) and `packages/web/bundled-skills/show-widget-skills/guidelines/lesson.md` (the lesson widget guideline).

## Concepts and library

The concepts were chosen to need no prior knowledge, so a failure points at the teaching rather than at a missing prerequisite, and to have well-known misconceptions for a later simulated learner:

- **Base rates** (small concept): a positive screening test for a rare disease. The usual mistake is answering with the test's sensitivity and ignoring how rare the disease is.
- **DBSCAN** (large concept): density-based clustering in four ideas (core points, growing clusters, border points and noise, choosing ε and minPts). Common mistakes: expecting to choose the number of clusters, expecting every point to join a cluster.
- **MFCC** is kept as one report-only case, to see whether the agent notices missing prerequisites (Fourier transform, spectrum). The prompt has no rule for that yet.

Both documents are in `~/memora-eval-data/learning/library/` and must be added to the Memora library once, by hand. `<memora-jump />` cites timestamped media only, so grounding is checked by whether the agent reads the library, not by citations.

## Cases

17 cases, each run three times (`~/memora-eval-data/learning/cases-v1.json`, explained in `cases-v1.md`):

| Group                  | Cases                                                                               | What a pass needs                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Teaching a new concept | s01, s02 (base rates, English and Chinese), l01, l02 (DBSCAN, English and Chinese)  | One lesson widget with 2–3 questions, at least one hands-on task and at most one choice; the library read; the user's language. A small concept has no roadmap and no next part. A large one opens with a roadmap of 2–6 parts, says "Part 1 of N", and teaches part 1 only.                                                                                                  |
| Not a lesson           | n01 greeting, n02 factual lookup, n03 question about a file, n04 one-line follow-up | No widget; the fact asked for; a short answer.                                                                                                                                                                                                                                                                                                                                |
| After a lesson result  | r01 to r08                                                                          | Each branch of "When the result comes back" in `lesson.md`: all correct moves to the next part; some wrong re-explains and asks at most two new questions without repeating any; all wrong re-teaches with exactly one task; the last part leads to a final review of 5–7 questions with a part on each; the review result names weak parts or ends with a transfer question. |
| Prerequisites          | p01 (MFCC)                                                                          | Report only: does the reply check what the learner already knows?                                                                                                                                                                                                                                                                                                             |

Result cases start from a fixture history: earlier turns as plain text, with the widget written as a `[Lesson widget: …]` stand-in, and a `Lesson result:` message in the format `lesson.quiz` sends.

## How it is scored

All checks are code; there is no judge. A case passes when every check passes, and every reply must also be non-empty (an empty reply would otherwise pass "no widget" cases).

The quiz is read from the last accepted `show_widget` call's source: the number of `.task(` and `.choice(` calls, the quiz's `title` and `nextPart` (ignoring the button labels, which have their own `nextPart`), each question's `prompt` and `part`. It is read by pattern, not by running the widget, so a quiz built in a loop is undercounted; read the widget code in the export before blaming the agent.

Reported but never gating:

- **Longest answer**: choice questions whose correct option is more than a fifth longer than every wrong one, so it can be picked by length.
- **Refused widgets**: `show_widget` calls the tool refused (and the agent then corrected).

There is deliberately no check on text after the widget: a closing line such as "move the sliders below" does no harm, and the check failed correct lessons.

## Code

| Part                                                                                                                                                   | Where                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Cases, checks, scoring, runner                                                                                                                         | `packages/evaluation/src/learningEvaluation.ts`, tests in `packages/evaluation/test/learningEvaluation.test.ts` |
| Adapter: fresh in-memory session, learning prompt, skill and widget tools, fixture history seeded with the runtime's `reset` command                   | `createWebLearningAdapter` in `packages/web/src/lib/playground/agentEvaluationAdapter.ts`                       |
| Development API: `runLearning()`, `learningStatus()`, results written to `~/memora-eval-data/results/learning-evaluation-<id>.json` and `.report.json` | `packages/web/src/lib/playground/evaluationDevApi.ts`                                                           |
| Running it from Claude Code                                                                                                                            | section 4b of the `agent-eval` skill                                                                            |
| Run log                                                                                                                                                | "Learning mode evaluation" in [EVAL.md](EVAL.md)                                                                |

The evaluation has no controls on the playground page yet; it runs through `window.__memoraEval` and its sessions never reach the chat list. Changes to anything the agent SharedWorker imports (for example `@memora/ai-core`) take effect only after every Memora tab is closed or reloaded.

## What it found

| Problem                                                                                                                 | Before                                | After                        | Fix                                                                                                                                                                                                                       |
| ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gemini ends a turn with no text and no tool call, mostly right after `activate_skill`; the Run ends with an empty reply | 8 of 51 replies empty (L2)            | 0 of 51 (L10)                | `packages/ai-core/src/loop.ts`: while a Run has written no text, an empty turn is retried up to twice, each retry ending with a one-line nudge sent only with that request. A plain retry got the same empty answer back. |
| The correct choice is the longest option, so it can be guessed                                                          | 9 of 28 choices (L2)                  | 0 of 34 (L10)                | `validateShowWidgetCall` refuses such a lesson and says why; the agent rewrote the options every time.                                                                                                                    |
| The final review's introduction is written after the widget                                                             | r06 0/3                               | 3/3                          | The prompt says to write all text first and call `show_widget` last.                                                                                                                                                      |
| A Chinese question about a document in English never opens the document                                                 | s02 0/3                               | 3/3                          | Before explaining, search with the concept's usual technical name as well as the user's wording, and read a file that covers it.                                                                                          |
| DeepSeek sends the same widget two or three times, rewriting the explanation each time                                  | 2 of 18 lesson attempts (L11)         | 0 (L12)                      | `show_widget` returns `{ success: true, message }`, the message saying the widget is shown and must not be sent again, instead of `{ ok: true, title }`.                                                                  |
| DeepSeek splits concepts by the sections of the document it read (base rates into four parts)                           | 4 of 6 base-rate attempts split (L11) | 2 of 6, into two parts (L12) | The sizing rule no longer fixes 3–5 parts: the agent decides from the concept whether to split and how far, and a document's sections are not the concept's parts.                                                        |
| The lesson after a 0/3 result was undefined ("do not quiz again" against "as a new lesson")                             | —                                     | —                            | `lesson.md`: re-teach the first missed idea, then a widget with exactly one task and no choice.                                                                                                                           |

The evaluation itself had bugs that L1 exposed and later runs fixed: the quiz's `nextPart` was read from the button labels, a Chinese part heading ("第一节") was not recognized, and a "text after the widget" check read the page snapshot, which can lag the stream.

## Results

Full runs, 48 gating attempts each:

| Run | Model            | Passed  | Notes                                                                                                                        |
| --- | ---------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------- |
| L2  | gemini-3.8-flash | 37 / 48 | Before the fixes, rescored under the current cases (34 as originally scored).                                                |
| L10 | gemini-3.8-flash | 45 / 48 | After all fixes. Uncached input tokens up by a third (2.74M to 3.98M), mostly from refused widgets resent and library reads. |
| L11 | deepseek-flash   | 37 / 48 | Same code as L10. No empty replies; fails on sizing, repeated widgets, long follow-ups. Output 871k tokens, twice Gemini's.  |

L12 reran the six DeepSeek cases those two fixes target: 11/18, against 7/18 in L11.

## Open issues

- **English preamble in Chinese replies** (DeepSeek): the sentence written before the first tool call ("I'll first check whether your library has anything on DBSCAN.") is in English. The language check misses it because the rest of the reply is Chinese.
- **Long answers to follow-ups**: n04 answers a one-line question in 110 to 200 words. The 100-word limit is the evaluation's guess; the guideline sets none.
- **Sizing is now the model's judgment**: base rates were split into two parts in 2 of 6 DeepSeek attempts. Whether that counts as wrong is open; one attempt set a next part without any roadmap, which is inconsistent either way.
- **Prerequisites**: the agent rarely checks what the learner knows (p01 at most 1/3). Needs a rule before it can be scored.
- **`readLibrary` is loose**: a search counts as reading, even when the agent never opens the file.
- **Provider instability**: one run lost all 9 attempts to "upstream error: do request failed"; full runs now use concurrency 3.
- **Levels 2 and 3** are not built: running each widget headlessly (script errors, can every task be completed) and a simulated learner with an injected misconception, scored on a held-out question after the remediation turn.
