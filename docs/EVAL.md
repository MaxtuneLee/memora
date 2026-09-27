# Agent evaluation log

Every run of the agent evaluation, in order, with what changed before it and what it showed. The evaluation asks the chat agent questions about two MIT 6.7960 lectures (lec11 and lec12), runs each question k = 3 times, scores citations against answer-key evidence windows (±5 s), and has Jev judge coverage. Design: [agent-observability-evaluation.md](agent-observability-evaluation.md). The questions, transcripts, and full results live outside the repository in `~/memora-eval-data/` because the transcripts are CC BY-NC-SA; this log holds aggregate numbers only.

Runs are driven and recorded with the `agent-eval` skill (`.agents/skills/agent-eval`), which also bundles the script that produces these numbers.

## How to read the numbers

- **Passed**: retrieval hit every evidence group, every required point is supported, and no disallowed claim was made, each with judge confidence of at least 0.6.
- **Uncertain**: would have passed except that a gating judge decision fell below 0.6 confidence. Counted apart from passed and failed (from run 2).
- **Unsupported**: attempts the judge says state a fact the cited transcript does not support. Reported only, not gating (from run 2).
- **Tokens**: uncached input / prompt-cache hits / output, summed over every model call in the Traces. Before run 2 the cache hits were not recorded.
- Revisions: _prompt_ is the agent system prompt hash, _judge_ the Jev prompt version, _questions_ the SHA-256 prefix of the questions file. Results are only comparable when these match or the difference is noted.

## Runs

| #   | Date (UTC)       | Evaluation | Scope            | Conc. | Code    | Prompt   | Judge          | Questions | Passed  | Uncertain | Failed | Retrieval | Unsupported | Tokens (in / cached / out)       | Median latency |
| --- | ---------------- | ---------- | ---------------- | ----- | ------- | -------- | -------------- | --------- | ------- | --------- | ------ | --------- | ----------- | -------------------------------- | -------------- |
| 1   | 2026-09-27 05:08 | ca6cfe15   | 24 × 3           | 3     | 8706ed3 | 34415086 | jev-coverage-1 | 473a31c4  | 9 / 72  | —         | 63     | 69        | 63          | 516,900 / not recorded / 155,960 | 16.4 s         |
| 2   | 2026-09-27 05:46 | f7ca7641   | 24 × 3           | 3     | 44701d0 | 34415086 | jev-coverage-2 | 3c6e8eb8  | 69 / 72 | 1         | 2      | 71        | 14          | 536,466 / 3,262,848 / 173,889    | 22.6 s         |
| 3   | 2026-09-27 06:28 | 8a76bcd5   | 2 × 3 (q15, q20) | 36    | a387dac | 13fa87f7 | jev-coverage-2 | 64cc3afe  | 5 / 6   | 1         | 0      | 6         | 1           | 58,299 / 284,544 / 17,652        | 20.5 s         |
| 4   | 2026-09-27 06:36 | 917b0f6f   | 25 × 3           | 9     | 1f0b413 | 13fa87f7 | jev-coverage-2 | b502a703  | 71 / 75 | 1         | 3      | 72        | 10          | 535,045 / 2,732,160 / 172,279    | 16.7 s         |
| 5   | 2026-09-27 07:25 | f6ba44e4   | 2 × 3 (q15, q25) | 6     | 55884ae | 13fa87f7 | jev-coverage-2 | c44ce355  | 6 / 6   | 0         | 0      | 6         | 2           | 66,636 / 313,088 / 20,352        | 21.7 s         |
| 6   | 2026-09-27 07:43 | 231c7f5c   | 25 × 3           | 9     | d436c6d | 13fa87f7 | jev-coverage-2 | c44ce355  | 75 / 75 | 0         | 0      | 75        | 10          | 493,499 / 2,410,880 / 153,985    | 10.9 s         |

## Trend

The pass rate went from 9/72 to 71/75 in one day, but most of that was the evaluation, not the agent. Retrieval was already 69/72 in run 1: the agent found the right passages from the start. What moved the number was, in order, a judge rule that failed correct answers (run 1 → 2), agent grounding and tool fixes (run 2 → 3), and three answer-key corrections (runs 2, 4, 5). At 71/75 the question set no longer separates a better agent from a worse one; the next step is harder questions, not more agent tuning.

## Run notes

### Run 1: first full run

- **Showed**: 63 of 72 attempts failed, 53 of them only because Jev judged "unsupported claims". Jev saw only the cues inside each citation, so any background sentence counted as unsupported; confidences sat between 0.5 and 0.9, and two near-identical answers to q01 got 0.38 and 0.63. Retrieval passed 69/72 and every required point was supported in 61/72.
- **Infrastructure**: tokens were undercounted about fivefold. DeepSeek reports prompt-cache hits only in the total, and `toTokenUsage` kept only `input`; the recorded 673k was about 3.42M from the Traces' totals.
- **Agent**: 18 `search_transcript` calls failed on `context_chars` above the 200 limit; 10 `read_file` calls used guessed paths (`/files/<id>/transcript.json`); 61 transcript searches returned nothing (for example, searching a lecturer's name, which the transcript text does not contain).
- **Answer key**: q23 missed an alternative window (58:56 "autoencoders are the deep learning version of PCA").

### Run 2: evaluation fixes (44701d0)

- **Changed**: unsupported claims report-only; the judge sees 30 s around each citation, with speakers and lecture names; the unsupported question ignores titles, file names, and timestamps (jev-coverage-2); gating decisions under 0.6 count as uncertain; cached tokens recorded. q23 key fixed.
- **Showed**: 69/72. Unsupported fell to 14, and those were real uncited extras (for example, a figure stated without its citation).
- **Agent**: q15 #2 answered from general knowledge with no tool call and no citation. Tool errors were unchanged (19 `context_chars`, 10 guessed paths).
- **Answer key**: q20's disallowed claim ("normalizing embeddings for cosine similarity (that is lec12)") was judged present in answers that correctly attributed it to lec12.
- **Ceiling**: 22 of 24 questions passed 3/3; only 2 of 189 required-point decisions were under 0.8 confidence.

### Run 3: agent fixes on q15 and q20 (a387dac)

- **Changed**: system prompt asks to search the library before answering about saved content and to cite each claim; `read_file` only with stored paths; `search_transcript` caps `context_chars` at 200. Questions: lecturer names removed from questions, q17 and q18 replaced by q26 to q28, q20's disallowed claim reworded.
- **Showed**: q15 3/3, every attempt searched first. q20 1 uncertain on the reworded disallowed claim (0.52) for a correct answer. One guessed path left.
- **Infrastructure**: concurrency recorded as 36: typing 6 after the default 3 was accepted; fixed in 65318d9 (1 to 10).

### Run 4: full set with new questions (1f0b413)

- **Changed**: `read_file` lists the folder's files when a path does not exist; q20's disallowed claim removed.
- **Showed**: 71/75; q26 to q28 all 3/3. `context_chars` errors 0. Six guessed paths; after seeing the folder listing, four read the right file next and two switched to search. One call to a tool name that does not exist.
- **Answer key**: q25 #1 and #2 missed group 2 because the key accepted only the conclusion at 53:56; the direct answer at 52:15 to 52:50 was added as an alternative after this run (both attempts would pass).
- **Agent**: q15 #3 cited the projection-head definition and a later recap but skipped the explanation; a real citation miss.
- **Judge noise**: q24 #3 uncertain at 0.52.

### Run 5: first run driven by the agent-eval loop (55884ae)

- **Changed**: `window.__memoraEval` API and dev-server data endpoint (02ee408); results saved to disk when a run ends (55884ae, run on the uncommitted change). The first attempt at this run stalled with every session stuck on its first tool call: the agent worker sent tool calls to the first tab that connected, a background tab the browser had frozen. Tool calls now go to the tab that submitted (02ee408).
- **Showed**: q15 and q25 both 3/3 with the fixed key; 36 s for 6 attempts at concurrency 6; no tool errors.

### Run 6: full set after the key fixes (d436c6d)

- **Changed**: no agent or judge change since run 4; the q25 key fix (run 4) and the tool-call routing fix (02ee408) are now measured on the full set.
- **Showed**: 75/75, no uncertain decisions, retrieval 75/75. Unsupported claims 10, same as run 4. Median latency 10.9 s against 16.7 s in run 4 at the same concurrency, and fewer tokens (493k against 535k uncached); likely provider-side variance, since nothing in the agent changed.
- **Agent**: three `read_file` calls still guessed `/files/<id>/transcript.json`; each attempt recovered through search. One `recall_message` with an unknown recall ID and one `grep_files` on a file path instead of a folder; neither affected the answer.
- **Next**: the set is saturated. Harder questions (#59) are the only way to see further agent changes.

## Open follow-ups

- Harder questions (#59): questions the library cannot answer (needs questions without evidence), questions that need three or more passages, exact-quote questions.
- The chat UI still undercounts tokens: `toTokenUsage` in ai-core drops prompt-cache hits; only the evaluation and Trace views derive them.
- The agent cannot see who is speaking; speaker labels exist in the cues but not in the transcript text it reads.
- k is fixed at 3 (`ATTEMPTS_PER_QUESTION`); make it a run option if variance needs more attempts.
