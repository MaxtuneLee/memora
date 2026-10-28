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

| #   | Date (UTC)       | Evaluation   | Scope                      | Conc. | Code                  | Prompt   | Cases    | Passed  | Save TP / FP / FN / TN | Notices passed | Recall passed | Tokens (in / cached / out)      |
| --- | ---------------- | ------------ | -------------------------- | ----- | --------------------- | -------- | -------- | ------- | ---------------------- | -------------- | ------------- | ------------------------------- |
| M1  | 2026-09-27 11:15 | 922de5ef     | 4 × 3 (d01, o02, r02, r07) | 6     | e8860c1 + uncommitted | 13fa87f7 | f67ea437 | 11 / 12 | 3 / 0 / 0 / 3          | 3 / 3          | 5 / 6         | 37,979 / 122,751 / 13,597       |
| M2  | 2026-09-27 12:01 | dc70ba47     | 23 × 3                     | 9     | e8860c1 + uncommitted | 13fa87f7 | 84c23a4d | 68 / 69 | 18 / 0 / 0 / 30        | 18 / 18        | 20 / 21       | 238,475 / 1,173,872 / 82,563    |
| M3  | 2026-09-27 12:37 | 94d57ea8     | 1 × 3 (r05)                | 3     | e8860c1 + uncommitted | 8f750460 | c103186d | 3 / 3   | —                      | —              | 3 / 3         | 10,530 / 24,960 / 2,250         |
| M4  | 2026-10-19 17:10 | e6c52827 + 4 | 30 × 3 (LongMemEval)       | 2     | 44852c0               | 4aef83af | 80ea0cdf | 57 / 90 | —                      | —              | 57 / 90       | 1,110,403 / 6,370,420 / 175,537 |

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

### Run M4: LongMemEval subset (44852c0)

- **Setup**: 30 questions from the LongMemEval `oracle` split (MIT, `xiaowu0162/longmemeval-cleaned`), 5 per question type, abstention questions excluded, sampled with seed 7. Each question's evidence sessions become past sessions, so the agent sees all 44 at once; only `list_chat_sessions` and `read_chat_session` reach them. The question carries its date ("Today is …"); the answer rule is one hand-written pattern per question, and a pass also needs a read of an expected session. Model `deepseek-flash`. Cases and the two scripts that build them (`pick.py`, `build.py`) live in `~/memora-eval-data/`; the data is outside the repo. The run is five reports of 6 questions each (e6c52827, 5257b1e3, 7ee051fb, 1368c0b0, dd601799), because a single run of all 30 at concurrency 6 crashed the page (out of memory) and left no result. An earlier attempt failed on every call with a missing API key.
- **Showed**: 57 of 90 attempts passed. By type: single-session-assistant 15/15, knowledge-update 14/15, multi-session 12/15, temporal-reasoning 9/15, single-session-user 4/15, single-session-preference 3/15. 61 attempts read an expected session; 29 of the 33 failures never opened one, and 7 questions failed all 3 attempts that way.
- **Agent**: every 0/3 question has its evidence as a passing mention inside a session about something else (an IKEA bookshelf inside a coffee-table chat, yoga classes inside a self-care plan) or has no cue at all (the five preference questions never mention an earlier chat). The agent lists sessions and opens them by title. In the product `grep_files` can search `/chat/` (the access check has a branch for it), but the evaluation's chat stand-in serves its past sessions only to the two session tools, so a grep there finds nothing, and the system prompt does not send the agent to it; the 0/3 questions therefore do not show how the product behaves. The other 4 failures read the right session and answered wrongly (9ea5eabc, e25c3b8d ×2, 71017277); not looked at in detail.
- **Limits**: not comparable with published LongMemEval scores (oracle split, subset, 44 sessions instead of about 50 per question, one rule per answer). Passes were not audited beyond d6062bb9.
- **Next**: make the stand-in's past sessions reachable by `grep_files` under `/chat/sessions` and rerun the 7 questions at 0/3, with and without a prompt line that names it; the notice update change does not touch this benchmark, since notices hold only communication preferences, and needs its own cases (a preference that replaces an older one, a request to forget).

## Learning mode evaluation

Design and findings: [learning-mode-evaluation.md](learning-mode-evaluation.md). From 2026-10-11 learning mode is checked against its own protocol (`packages/web/src/lib/chat/learningMode.ts` and `guidelines/lesson.md`): whether a message gets a lesson, roadmaps for large concepts, the shape of the quiz, and each branch after a `Lesson result:` message. 17 cases × 3, scored by code over the reply and the last accepted `show_widget` call, no judge. The concepts are base rates (small) and DBSCAN (large, 4 parts), both from documents in the library; p01 (MFCC without the prerequisites) is report-only. Cases and documents live in `~/memora-eval-data/learning/`.

- **Passed** counts gating cases only (16 × 3 = 48 attempts). From L10 there is no check on text after the widget.
- **Longest answer**: choice questions whose correct option is longer than every wrong one, against all choice questions. `lesson.md` forbids it; reported, not gating.

### Learning runs

| #   | Date (UTC)       | Evaluation | Scope                                | Conc. | Code                  | Model            | Prompt   | Cases    | Passed  | Empty replies | Longest answer | Refused widgets | Tokens (in / cached / out)    | Median latency |
| --- | ---------------- | ---------- | ------------------------------------ | ----- | --------------------- | ---------------- | -------- | -------- | ------- | ------------- | -------------- | --------------- | ----------------------------- | -------------- |
| L1  | 2026-10-11 08:26 | bcca8574   | 17 × 3                               | 6     | ba71b17 + uncommitted | gemini-3.8-flash | 83ab92e2 | 100cf092 | 35 / 48 | 7 / 51        | 18 / 25        | 3               | 3,006,822 / 196,559 / 205,999 | 16.8 s         |
| L2  | 2026-10-11 08:34 | de6103c9   | 17 × 3                               | 6     | ba71b17 + uncommitted | gemini-3.8-flash | 83ab92e2 | d46fef6a | 34 / 48 | 8 / 51        | 21 / 28        | 1               | 2,738,578 / 248,165 / 191,662 | 15.0 s         |
| L3  | 2026-10-11 08:47 | bc9a6ab9   | 5 × 3 (s01, s02, l01, l02, p01)      | 6     | ba71b17 + uncommitted | gemini-3.8-flash | 83ab92e2 | d46fef6a | 8 / 12  | 2 / 15        | 9 / 13         | 2               | 1,438,602 / 331,075 / 101,032 | 68.0 s         |
| L4  | 2026-10-11 08:52 | 710e59ca   | 5 × 3 (same)                         | 6     | ba71b17 + uncommitted | gemini-3.8-flash | 83ab92e2 | d46fef6a | 7 / 12  | 3 / 15        | 9 / 12         | 3               | 1,446,832 / 323,577 / 101,220 | 65.3 s         |
| L5  | 2026-10-11 08:59 | becf6205   | 5 × 3 (same)                         | 6     | ba71b17 + uncommitted | gemini-3.8-flash | 83ab92e2 | d46fef6a | 5 / 12  | 3 / 15        | 6 / 12         | 0               | 1,181,654 / 239,796 / 87,879  | 61.9 s         |
| L6  | 2026-10-11 09:03 | 83e7ba51   | 2 × 3 (r04, r06)                     | 6     | ba71b17 + uncommitted | gemini-3.8-flash | d71c36f4 | d46fef6a | 5 / 6   | 0 / 6         | 8 / 15         | 0               | 733,770 / 0 / 67,063          | 109.3 s        |
| L7  | 2026-10-11 09:07 | c136c932   | 4 × 3 (s01, l01, r01, r06)           | 6     | ba71b17 + uncommitted | gemini-3.8-flash | d71c36f4 | d46fef6a | 12 / 12 | 0 / 12        | 0 / 21         | 5               | 1,445,016 / 261,614 / 150,267 | 99.4 s         |
| L8  | 2026-10-11 09:12 | 5988819f   | 2 × 3 (s02, l02)                     | 6     | ba71b17 + uncommitted | gemini-3.8-flash | 25a9b089 | d46fef6a | 5 / 6   | 1 / 6         | 0 / 5          | 1               | 495,829 / 114,145 / 53,250    | 80.2 s         |
| L9  | 2026-10-11 09:28 | 7b5e0fea   | 3 × 3 (s01, l01, l02)                | 6     | ba71b17 + uncommitted | deepseek-flash   | 25a9b089 | d46fef6a | 0 / 9   | 0 / 9         | 0 / 9          | 0               | 265,564 / 1,525,500 / 274,576 | 128.8 s        |
| L10 | 2026-10-13 08:31 | f5f2938f   | 17 × 3                               | 3     | ba71b17 + uncommitted | gemini-3.8-flash | 25a9b089 | 804ffa65 | 45 / 48 | 0 / 51        | 0 / 34         | 13              | 3,975,167 / 555,200 / 403,408 | 83.7 s         |
| L11 | 2026-10-13 09:28 | 21610f3a   | 17 × 3                               | 3     | ba71b17 + uncommitted | deepseek-flash   | 25a9b089 | 804ffa65 | 37 / 48 | 0 / 51        | 0 / 29         | 5               | 782,872 / 5,599,860 / 870,957 | 97.4 s         |
| L12 | 2026-10-13 09:58 | 5af5630e   | 6 × 3 (s01, s02, l01, l02, r01, n04) | 3     | ba71b17 + uncommitted | deepseek-flash   | 65ea4ec0 | 323f2920 | 11 / 18 | 0 / 18        | 0 / 15         | 1               | 416,036 / 2,834,048 / 441,707 | 126.0 s        |

### Run L1: first learning-mode run (uncommitted)

- **Infrastructure**: three scoring bugs, fixed before L2. "Widget ends the reply" used the page snapshot's length when `show_widget` was called, which can lag the stream (r04 #2 and r05 #1 failed on text that came before the widget); it is now read from the Trace. The quiz's `nextPart` was read from the `labels` object's button text (r06 #1). A Chinese roadmap heading "第一节" did not match the part-line pattern (l02 #1).
- **Agent**: 7 empty replies (s01, s02 ×2, l01, p01 ×3). Six stop right after `activate_skill`: Gemini answers the skill's instructions with `STOP`, 27 output tokens, no text and no tool call. r01 #2 asked two choice questions where one is allowed. l02 #3 looked only at file names with `query_db` and never read the document.
- **Answer key**: n04's 80-word limit was a guess, not a rule in `lesson.md`; raised to 100 (one attempt at 87 words).

### Run L2: scoring fixes (uncommitted)

- **Changed**: the three scoring fixes above; cases file d46fef6a (Chinese part-line pattern, n04 limit 100).
- **Showed**: 34/48. With the scoring fixed, the failures are the agent's:
  - Empty replies, 8 of 51, the largest cause: s01 0/3 here, l01, l02, p01 ×2, n04 #3. n04 #3 passed because an empty reply meets "no widget" and the word limit; since this run every case also requires a non-empty reply, which makes L2 33/48.
  - r06 0/3 in both runs: for the final review the agent calls `show_widget` first and writes the one-sentence introduction after it, in the next model turn.
  - Choice questions ignore "Writing choices": the correct option is the longest in 21 of 28 (18 of 25 in L1). r01 asked two choices in 2 of 3 attempts.
  - s02 #2 taught base rates as a roadmap with parts; n04 answered a one-line follow-up in 109 and 118 words and offered the next part.
  - p01 never asks about the missing prerequisites (0/3 in both runs), as expected: the prompt has no rule for it.
- **Next**: retry an empty final reply in the session runtime (or treat it as a provider failure) before tuning prompts, since it hides everything else; in `lesson.md`, say to write the final review's introduction before calling `show_widget`; make the length rule for choices concrete.

### Runs L3 to L5: retrying an empty reply (uncommitted)

- **Changed**: the agent loop (`packages/ai-core/src/loop.ts`) sends the request again when a turn ends with no text and no tool call. L3 ran the first version (one plain retry after any empty turn).
- **Showed**: s01 went from 0/3 to 3/3, but the Trace showed most retries came after `show_widget`, where an empty turn is the normal end of a lesson, and that a plain retry gets the same empty answer back (the same 15 or 27 output tokens). The loop now retries only while the Run has written no text, up to twice, and ends each retry request with a one-line nudge that is never stored in the history.
- **Infrastructure**: L4 and L5 still ran the L3 worker: no nudge appears in their Traces. A SharedWorker restarts only when every Memora tab is closed or reloaded, and another tab kept the old one alive. Their empty-reply numbers measure the first version, not the current one.

### Run L6: widget last (uncommitted)

- **Changed**: the learning prompt says to write all text first and call `show_widget` as the very last step; `lesson.md` says the final review's introduction comes before the call. Prompt d71c36f4.
- **Showed**: r06 0/3 → 3/3. r04 #3 still called the widget before writing anything and explained after it.

### Run L7: refusing giveaway choices (uncommitted)

- **Changed**: `validateShowWidgetCall` refuses a lesson whose choice answer is more than a fifth longer than its longest wrong option, and says why. The report's "Longest answer" uses the same rule from this run; under it L2 had 9 of 28 (L1 to L6 above were counted with "strictly longest").
- **Showed**: 12/12. 5 refusals; each attempt rewrote the options and the next call was accepted. 0 of 21 choice questions can be told by length. r01 asked at most one choice question in all three attempts.

### Run L8: reading the library first (uncommitted)

- **Changed**: before explaining a new concept the agent searches the library with the concept's usual technical name as well as the user's wording, and reads a file that covers it; a file name alone is not enough. Prompt 25a9b089.
- **Showed**: s02 0/3 → 3/3, and every attempt searched. Two s02 attempts searched only in Chinese and never opened the English document; `readLibrary` counts a search as reading, so it is a loose check. l02 #3 was an empty reply on the old worker.
- **Next**: reload every Memora tab so the nudge version of the retry runs, rerun s01, l01, l02, then the full set.

### Run L9: a different chat model (uncommitted)

- **Infrastructure**: after the Memora tabs reloaded, the chat model in Settings was deepseek-flash, not gemini-3.8-flash; L9 is not comparable with L1 to L8. There were no empty replies and so no retries: the empty-reply retry is still unmeasured on Gemini.
- **Showed**: 0/9, every attempt failing only "Widget ends the reply" (and l01 #1 the part line too): DeepSeek writes a closing line after `show_widget` returns ("Move the two sliders below…", "第 2 步想接着学的时候告诉我一声").
- **Changed after this run**: the "Widget ends the reply" check is removed; text after the widget is allowed (cases file 804ffa65). Rescored without it, L9 is 8/9. The prompt still asks for nothing after the widget.

### Run L10: full set after all fixes (uncommitted)

- **Changed since L2**: empty-reply retry with a nudge (`loop.ts`), widget-last prompt, giveaway choices refused by `show_widget`, library first, and the widget-last check removed (cases 804ffa65). Before it, s01, l01, l02 on the reloaded worker went 8/9: 2 nudged retries, both answered, no empty reply; the ninth attempt timed out before its first request. A run just before that failed all 9 attempts with the provider's "upstream error: do request failed"; one case at concurrency 1 then passed 3/3, so this run used concurrency 3. Latency is not comparable with L1 and L2 (concurrency 6).
- **Showed**: 45/48, against 37/48 for L2 rescored under the same cases. No empty replies (3 nudged retries, all recovered); 0 of 34 choice questions can be told by length, after 13 refused widget calls that were each rewritten; r06 3/3. Tokens are up by a third (3.98M uncached against 2.74M), mostly from the refused widget calls and the library reads.
  - l02 #3 asked two choice questions; r01 #3 failed on "Google stream ended without a finish reason" (infrastructure); n04 #1 answered a one-line follow-up in 110 words.
  - p01 1/3: one attempt asked about prerequisites without a rule telling it to.
- **Next**: the protocol is mostly followed now. Layer 2 (does each widget run and can each task be completed) and layer 3 (does a simulated learner with an injected misconception get it right after the remediation turn) are what can still separate a better learning mode from a worse one.

### Run L11: the same set on deepseek-flash (uncommitted)

- **Changed**: nothing but the chat model; same code, prompt, and cases as L10.
- **Showed**: 37/48 against 45/48 for gemini-3.8-flash. No empty replies, no errors; 0 of 29 choices can be told by length (5 refused and rewritten). DeepSeek fails differently from Gemini:
  - Sizing: it taught base rates as a 4-part roadmap in 4 of 6 s01/s02 attempts, and l02 took a 5-part roadmap from the document's own sections. It follows the structure of the library file it read rather than the concept's size.
  - Repeated widgets: l02 #3 and r01 #3 called `show_widget` two and three times with the same code, r01 #3 rewriting the whole explanation before each call; the reader would see the lesson twice.
  - l02 #1 activated the skill and ended after the roadmap with no lesson.
  - Follow-ups grow into lessons: n04 #1 answered "noise points don't belong to any cluster?" by starting part 3 with a widget (269 words); r02 #3 ran to 154 words.
  - Language: three Chinese replies open with an English sentence written before the first tool call ("I'll first check whether your library has anything on DBSCAN."), which the language check does not catch because the rest is Chinese.
  - p01 0/3, r08 #3 ended with an offer rather than a question.
- **Tokens**: 5.6M of the 6.4M input were cache hits (DeepSeek caches the prefix well), but output was 871k, more than twice Gemini's 403k.
- **Next**: if DeepSeek is to be supported, the `show_widget` result should say the widget is shown and must not be sent again, and the sizing rule should say a document's sections do not make a concept large.

### Run L12: widget result and looser sizing, on deepseek-flash (uncommitted)

- **Changed**: `show_widget` returns `{ success: true, message }`, the message saying the widget is shown and must not be sent again (was `{ ok: true, title }`). The sizing rule no longer fixes 3–5 parts: the agent decides from the concept whether to split and into how many parts, two often being enough, and a document's sections are not the concept's parts. Prompt 65ea4ec0. The checks follow: a roadmap is 2–6 numbered parts and "Part 1 of N" takes any N (cases 323f2920).
- **Showed**: 11/18 against 7/18 for the same cases in L11.
  - Repeated widgets gone: exactly one widget in every lesson attempt; r01 3/3 (2/3).
  - Sizing: base rates split in 2 of 6 s01/s02 attempts, into two parts (L11: 4 of 6, into four). One s02 attempt set a next part with no roadmap. l02 3/3 (1/3) with 2 or 3 parts; l01 #2 set a next part but wrote no numbered roadmap.
  - n04: no lesson for the follow-up any more, but 146 to 201 words where a sentence would do.
  - l02 opened with an English sentence in all three attempts.

## Open follow-ups

- Harder questions (#59): questions the library cannot answer (needs questions without evidence), questions that need three or more passages, exact-quote questions.
- The chat UI still undercounts tokens: `toTokenUsage` in ai-core drops prompt-cache hits; only the evaluation and Trace views derive them.
- The agent cannot see who is speaking; speaker labels exist in the cues but not in the transcript text it reads.
- k is fixed at 3 (`ATTEMPTS_PER_QUESTION`); make it a run option if variance needs more attempts.
- Searching past chats by content works only through `grep_files` with `cwd` under `/chat/`, which the prompt never mentions and the memory evaluation's stand-in cannot serve (run M4).
- A memory run writes nothing until it ends, and 90 attempts at concurrency 6 crashed the tab (out of memory; the cause was not traced). Write partial results, or lower the default concurrency.
