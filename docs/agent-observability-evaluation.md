# Agent observability and evaluation, first version

## Goal and scope

Given a session and Run ID, a developer must be able to reconstruct the task's original request, every later pending or steer input, each effective model request, every context compression step, every tool call and its result, and the final outcome. The trace should make the first unsupported claim or wrong retrieval step locatable. A chat message projection remains the product view; the trace is an operational record with its own read and export API. This follows the distinction in [Flue's observability guide](https://flueframework.com/docs/guide/observability/) without adopting its runtime or event names wholesale.

The first evaluation uses fixed, reviewed transcript text from [MIT 6.7960 Deep Learning, Fall 2024](https://ocw.mit.edu/courses/6-7960-deep-learning-fall-2024/download/). Transcription production and ASR quality are outside this evaluation. The transcript version, segment timestamps, source video URL, and question rubric are frozen before a run. A later correction creates a new dataset revision instead of silently changing old scores.

## Trace contract

Store one append-only, versioned Trace per Run. Every record has `formatVersion`, `sessionId`, `runId`, a monotonically increasing `sequence`, `timestamp`, and `type`; `submissionId`, `turnId`, and `toolCallId` are present where applicable. A reader sorts by sequence, never by wall-clock time. A Run can absorb Steer messages, so it can cover several Submissions; a Submission's outcome is the outcome of the Run it ran in. `attemptId` is reserved for a future recovery attempt and is omitted while every Submission has one Attempt.

`@memora/ai-core` produces the records through an optional `trace` callback in the agent configuration. It calls the callback with raw content at the points only the loop can see (after the request is rendered, around compaction, around each tool call) and knows nothing about sessions. The Agent SharedWorker, as session owner, adds the envelope fields, allocates sequence numbers, and writes the Trace. The existing `AgentEvent` stream is not used, so UI subscribers never receive the large records. If the callback throws, `ai-core` records a trace gap and the agent's decisions are unaffected.

| Event                           | Emitted by | Required evidence                                                                                                                                               |
| ------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `run.started`                   | worker     | Run ID, the Submission that started it, app version, compaction rendering parameters                                                                            |
| `input.applied`                 | ai-core    | Submission ID, delivery mode, acceptance time, and the model turn that first saw it; a Steer message is applied where the loop emits `steer-consumed`           |
| `message.added`                 | ai-core    | Full content of a message the first time it enters the history; for a tool result, the stored result (up to the stored cap)                                     |
| `context.compacted`             | ai-core    | Layer (`microcompact`, `cold`, `summary`), trigger, compaction state before and after, estimated tokens before and after, and for a summary its attempt outcome |
| `context.trimmed`               | ai-core    | Fallback only: message IDs `fitToContextWindow` dropped from this request, estimated tokens before and after, and the context window                            |
| `model.request`                 | ai-core    | Purpose (`reply` or `summary`), ordered message IDs, the compaction state it rendered with, model identity and inference settings                               |
| `model.response`                | ai-core    | Complete text, complete reasoning, tool calls, web search queries and results, usage, finish reason, duration, and error                                        |
| `tool.started` / `tool.settled` | ai-core    | Tool name, call ID, arguments; on settle the raw result length, the stored result, duration, error, and `outcome: known \| unknown`                             |
| `run.settled`                   | worker     | One terminal `completed`, `failed`, `aborted`, or `interrupted` outcome, error, and final message ID                                                            |

Capture `model.request` immediately before calling the model, after prompt assembly, memory insertion, steering, compaction, and any fallback trimming. Recording earlier hook state would not answer what the model actually saw. A message's content is recorded once, in `message.added`; a request lists message IDs, and records the system prompt and tool definitions in full only when they differ from the previous request in the Run. Images are recorded as name, media type, and size. Streaming deltas are not recorded; a live view of a running Run reads the existing session snapshots. A tool left at `tool.started` when its Run settles is marked `unknown`, since it may have produced a side effect.

### Context compaction

Compaction ([Agent context compaction](agent-context-compaction.md)) changes how the request renders a message without changing the stored history. Rendering is a pure function of the stored history and the compaction state (`compactedThrough`, `coldThrough`, `strippedThrough`, `summary`, `recaps`), so a Trace stays reproducible without storing every rendered request:

- `model.request` carries the compaction state it rendered with. The Trace view renders the request with the same `projectHistory` code the loop uses.
- The rendering parameters (the write, compact, and cold limits and the protected turn count), now module constants in `compaction.ts`, become one exported object that `projectHistory` takes as an argument. `run.started` records that object, and the Trace view renders with the recorded values, so tuning a limit does not change how an older Trace renders. `run.started` also records the app version, which identifies a change to the rendering logic itself, such as the placeholder format.
- Each compaction event emits `context.compacted` before the request it affects. A microcompact that frees less than the minimum savings changes no state and emits nothing.
- A summary is a model call of its own. Its request and reply are recorded as `model.request`/`model.response` with purpose `summary`, and the resulting `context.compacted` points at the summary text. A failed summary records the failure and the running failure count; after the third, later requests fall back to `fitToContextWindow` and emit `context.trimmed`.
- A cold-cache run records `layer: "cold"` and, when a recap is appended before the new user message, the recap ID and its full text.
- The write-time cap shortens a tool result the first time it is sent. That shortening follows from the stored result and fixed limits, so `tool.settled` records only the raw result length and the stored result; the sent form is rendered like any other message.
- `recall_message` is an ordinary tool call. The Trace view links a recall ID to the message or tool call it names.
- An idle recap is written after the queue drains, outside any Run, and its generation is not traced in v1. What the model sees of it is recorded when a later Run appends it.
- Provider overflow retry is not implemented. When it is, the failed `model.response`, the resulting `context.compacted` with trigger `overflow`, and the retried `model.request` appear in order.

### Storage and API

Content is stored inline in v1. Model credentials, authorization headers, and provider secrets are excluded. Export is `full` only; a content policy is added before any Trace leaves the device. The trace writer must not change an agent decision if observation fails; it records a visible trace gap and the run continues.

The initial reader API exposes `listRuns(sessionId)`, `readTrace(sessionId, runId)`, and `exportTrace(sessionId, runId)`. The development-mode chat inspector groups events by model turn and shows the rendered input, compaction, tool arguments and results, and the answer. The trace format does not itself determine correctness.

## Recovery boundary

The current SharedWorker stores an admission receipt, message projection, and periodic execution snapshot. A fresh worker marks unfinished work `interrupted` and retains queued message text for manual resend. It does not replay an uncertain tool effect or promise a terminal completion after every crash. A completed tool result must be recorded before future automatic recovery can safely skip it. An unresolved ordinary tool call must be marked `unknown`, since it may have produced a side effect. These constraints align with the conservative repair rule in [Flue's durability guide](https://flueframework.com/docs/guide/durability/). Automatic continuation requires a later attempt ledger, bounded retry policy, idempotent tool boundaries, and a wake mechanism that survives the last browser tab closing.

## Transcript dataset

The dataset is prepared offline and imported into Memora's evaluation page as local Parquet files; it is not published to Hugging Face. Neither the transcripts nor the question set exist yet. If the course does not provide usable transcripts, they are produced with ASR and then reviewed by hand; the review, not the ASR output, is what gets frozen.

Local import needs a `DatasetSource` in `@memora/datasets` that reads user-selected Parquet files: `inspect` and `resolveSplit` read the Parquet footer through the existing `parquetReader`, and `download` returns the file stream. `installDataset`, verification, and `openDataset` are unchanged. `source` widens from `"huggingface"` to `"huggingface" | "local"` in the types and manifest schema. A local split has no commit hash, so its revision is the SHA-256 digest of its file contents; any edit produces a new revision.

Keep transcript segments as stable rows with `courseId`, `lectureId`, `segmentId`, `startMs`, `endMs`, `text`, `sourceUrl`, `transcriptVersion`, and a source digest. Store evaluation examples in a separate split with `questionId`, `question`, `lectureId` or permitted lecture set, one or more acceptable timestamp windows, required answer points, optional disallowed claims, and supporting segment IDs. Keep answer keys out of the agent-visible corpus.

The agent reads transcripts in the app format, `{ text, words: [{ text, timestamp: [startSec, endSec] }] }`, not as segment rows. A versioned conversion step turns segment rows into one transcript file per lecture and imports them into the library. The import records a `fileId → lectureId` mapping, which the scorer needs to map citations back to lectures. The conversion version is pinned in the run result, since segment boundaries and unit conversion can change retrieval.

Start with questions whose evidence is localized and independently checkable. Include paraphrases, terms shared by several lectures, and questions that require combining two segments. Record reviewer notes for ambiguous timestamps or reasonable alternative answers before running models. A description file shipped with the Parquet files identifies the source course, transcription method and revision, timestamp granularity, review process, and attribution. The course download page lists the lecture videos separately from the course package, so video assets and text dataset preparation remain explicit inputs.

## Evaluation run

Runs happen in a dedicated browser profile that contains only the imported corpus. The agent's library search, memory, and vector index are shared across the origin, so a regular profile would let personal files and earlier memory leak into retrieval. Examples run sequentially within that profile or reset memory between examples, so history and memory stay independent.

Add an agent-specific runner beside the existing audio `runEvaluation` API in `@memora/evaluation`. The current runner expects WAV input and computes WER/CER; its result schema should remain valid for ASR runs. The agent runner accepts an installed question split, an adapter that creates an independent SharedWorker session for each example, a model/config identity, a corpus revision, an `AbortSignal`, and progress callback. Each example runs three times. The result records, per attempt, the session/submission IDs, trace reference, retrieved segment IDs, parsed citations, final answer, latency, usage, which compaction layers ran and whether the fallback trimmed context, and any failure. Pin the agent prompt, retrieval/index configuration, model identity, corpus revision, conversion version, scorer version, and dataset revision in the run result. Temperature is not controlled in this version.

Citations come from the `<memora-jump />` tags in the final answer, parsed with the existing `packages/web/src/lib/chat/memoraJump.ts` parser. Each tag's `fileId` maps to a lecture through the import mapping, and `startSec`/`endSec` give the cited window. An answer with no jump tag has no citation, even if its text mentions a time; a missing citation is not treated as zero distance.

Score three separate dimensions per attempt: (1) evidence retrieval, whether a cited window overlaps an accepted evidence window in the correct lecture; (2) timestamp accuracy, the absolute distance to the nearest accepted window, with an explicit tolerance matching segment granularity; and (3) answer coverage, required points supported by the cited segments, plus unsupported claims. Dimensions 1 and 2 are deterministic. Dimension 3 needs a judgment: a reviewer, or an LLM judge that records its own judge model, prompt, and raw judgment, reported separately from the deterministic metrics. Report each example as passes out of three plus the mean, with counts and denominators. Break results down by whether compaction ran, so failures caused by compression are distinguishable from retrieval failures. Inspect traces for false positives and failures before changing retrieval or prompts.

The first meaningful run is a small reviewed slice from at least two lectures. Freeze it, run each example three times, inspect a sample of successful and failed traces, then expand. Do not report an agent score until transcript text and question rubrics exist at pinned revisions.
