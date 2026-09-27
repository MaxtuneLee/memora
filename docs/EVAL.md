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

## Memory evaluation

From 2026-09-27 the agent's memory is evaluated alongside QA, with rules instead of a judge:

- **Using stored preferences**: QA questions answered under a memory profile (`zh`, `brief`, `bullets`, `zh-bullets`); an attempt passes only if it passes QA and follows the profile's rules. Runs are logged in the runs table with the profile in the scope column.
- **Saving preferences**: 16 single-message cases (6 lasting preferences, 4 one-off requests, 3 profile facts, 3 sensitive details). Scored on whether the agent calls `remember_user_preference` exactly when it should, and whether the saved notice is English and names the preference.
- **Cross-session recall**: 7 cases over 6 fixed past sessions: plain recall, a decision that was later changed (must give the latest), a Chinese question about an English chat, and a topic never discussed (must say so).

Neither writes to the user's memory or reads the user's chats. Cases and profiles live in `~/memora-eval-data/memory/`.

### Memory runs

| #   | Date (UTC)       | Evaluation | Scope                      | Conc. | Code                  | Prompt   | Cases    | Passed  | Save TP / FP / FN / TN | Notices passed | Recall passed | Tokens (in / cached / out)   |
| --- | ---------------- | ---------- | -------------------------- | ----- | --------------------- | -------- | -------- | ------- | ---------------------- | -------------- | ------------- | ---------------------------- |
| M1  | 2026-09-27 11:15 | 922de5ef   | 4 × 3 (d01, o02, r02, r07) | 6     | e8860c1 + uncommitted | 13fa87f7 | f67ea437 | 11 / 12 | 3 / 0 / 0 / 3          | 3 / 3          | 5 / 6         | 37,979 / 122,751 / 13,597    |
| M2  | 2026-09-27 12:01 | dc70ba47   | 23 × 3                     | 9     | e8860c1 + uncommitted | 13fa87f7 | 84c23a4d | 68 / 69 | 18 / 0 / 0 / 30        | 18 / 18        | 20 / 21       | 238,475 / 1,173,872 / 82,563 |
| M3  | 2026-09-27 12:37 | 94d57ea8   | 1 × 3 (r05)                | 3     | e8860c1 + uncommitted | 8f750460 | c103186d | 3 / 3   | —                      | —              | 3 / 3         | 10,530 / 24,960 / 2,250      |

### Run M1: smoke run of the memory evaluation (uncommitted)

- **Showed**: saves and skips were all right; d01's notices were English ("User prefers the assistant to respond in Simplified Chinese."). r02 gave 512 each time, from the later of two batch-size chats. Every recall attempt read the expected session. The user's real memory stayed empty.
- **Answer key**: r07 #1 correctly said diffusion was never discussed, then summarised other chats with "we agreed", which the "does not invent a conclusion" rule caught. The rule now only matches a conclusion about diffusion (cases file 84c23a4d); all three answers pass it.
- **Next**: the full memory set, and QA runs under the `zh` and `brief` profiles.

### Run M2: full memory set (uncommitted)

- **Showed**: 68/69. Saving was perfect: 18 of 18 lasting preferences saved, none of the 30 one-off, personal-fact, or sensitive messages saved, and all 18 notices well-formed (d02, asked in Chinese, came back as "User prefers answers to state the conclusion first…"). Every recall attempt read the expected session; r02 took the later decision (512) and r07 said diffusion never came up, all 3/3. Median latency 43.2 s at concurrency 9, 7.8 min in all.
- **Answer key**: r05 #3 answered correctly in Chinese ("10 月 3 日"), which the date pattern did not allow; it now accepts spaces around 月 and 日, and a word boundary keeps "13 October" out (cases file c103186d). With it, the run is 69/69.
- **Agent**: asked "Remind me when my exam is.", every r05 attempt searched the library first (13 to 19 tool calls) and reached `list_chat_sessions` only near the end; the prompt sends only questions about "previous chats" to the session tools, so personal facts are looked for in files first. r05 #3 also answered an English question in Chinese.
- **Next**: like QA, the set passes almost everything; harder cases would separate agents (combining two chats, a preference that replaces an older one, a message mixing a lasting preference with a one-off request). Profile runs under `zh` and `brief` still need a run after the Memora tabs reload.

### Run M3: chat history before the library (uncommitted)

- **Changed**: the system prompt now says that a question about the user themselves (their plans, dates, decisions, or anything they may have told the agent, such as "remind me…") checks `list_chat_sessions` and `read_chat_session` before searching the library. Prompt revision 13fa87f7 → 8f750460.
- **Showed**: r05 3/3, each attempt starting with `list_chat_sessions`: 2 to 4 tool calls instead of 13 to 19, 4 to 8 s instead of about 160 s (concurrency 3 here, 9 in M2, so latency is only roughly comparable), and 10.5k uncached input tokens for all three instead of 37.0k. Two attempts still ran `search_files` alongside. All answers were in English.
- **Next**: the rest of the recall cases and the full QA set, to check that lecture questions do not now start in chat history.

## Open follow-ups

- Harder questions (#59): questions the library cannot answer (needs questions without evidence), questions that need three or more passages, exact-quote questions.
- The chat UI still undercounts tokens: `toTokenUsage` in ai-core drops prompt-cache hits; only the evaluation and Trace views derive them.
- The agent cannot see who is speaking; speaker labels exist in the cues but not in the transcript text it reads.
- k is fixed at 3 (`ATTEMPTS_PER_QUESTION`); make it a run option if variance needs more attempts.
