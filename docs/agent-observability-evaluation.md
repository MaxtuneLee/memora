# Agent observability and evaluation, first version

## Goal and scope

Given a session and submission ID, a developer must be able to reconstruct the task's original request, every later pending or steer input, each effective model request, every tool call and its result, and the final outcome. The trace should make the first unsupported claim or wrong retrieval step locatable. A chat message projection remains the product view; the trace is an operational record with its own read and export API. This follows the distinction in [Flue's observability guide](https://flueframework.com/docs/guide/observability/) without adopting its runtime or event names wholesale.

The first evaluation uses fixed, reviewed transcript text from [MIT 6.7960 Deep Learning, Fall 2024](https://ocw.mit.edu/courses/6-7960-deep-learning-fall-2024/download/). Transcription production and ASR quality are outside this evaluation. The transcript version, segment timestamps, source video URL, and question rubric are frozen before a run. A later correction creates a new dataset revision instead of silently changing old scores.

## Trace contract

Store an append-only, versioned sequence per submission. Every record has `formatVersion`, `sessionId`, `submissionId`, `attemptId`, a monotonically increasing `sequence`, `timestamp`, and `type`. `turnId` and `toolCallId` are present where applicable. The writer allocates sequence numbers inside the session owner. A trace reader sorts by sequence, never by wall-clock time. Separate `submissionId` and `attemptId` so a future recovery attempt cannot be mistaken for a new user request.

The minimum event families are:

| Event                           | Required evidence                                                                                                                                            |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `submission.accepted`           | Original input, selected delivery mode, admission order, parent run if steered, and reference scope                                                          |
| `input.applied`                 | Input ID, whether it started a run or entered an existing run, and the model turn that first saw it                                                          |
| `model.request`                 | The effective system prompt, messages after context-window trimming, tool definitions, model identity and inference settings, with stable content references |
| `model.response`                | Complete text, reasoning if retained by the product policy, tool calls, usage, finish reason, duration, and error                                            |
| `tool.started` / `tool.settled` | Tool name, call ID, validated arguments, effective result passed back to the model, duration, error, and `outcome: known                                     | unknown` |
| `submission.settled`            | One terminal `completed`, `failed`, `aborted`, or `interrupted` outcome, error, and final message ID                                                         |

Capture `model.request` immediately before calling the model, after prompt assembly, memory insertion, steering, and context-window trimming. Recording earlier hook state would not answer what the model actually saw. Capture both the raw tool result and the truncated value inserted into model history, or mark a content reference as unavailable; a preview alone cannot explain a later answer. Streaming deltas are optional live events and cannot replace completed request/response records. A failed tool can be followed by a successful run, so tool failure and submission settlement remain separate.

Store large content in local OPFS blobs keyed by a digest, and keep size, digest, media type, and an availability/redaction marker in the trace event. Images and other binary input use references rather than inline bytes. Model credentials, authorization headers, and provider secrets are excluded. Local export requires an explicit content policy (`metadata`, `redacted`, or `full`) so future telemetry integrations cannot silently send private source material away. The trace writer must not change an agent decision if observation fails; it records a visible trace gap and the run continues.

The initial reader API should expose `listSubmissions(sessionId)`, `readTrace(sessionId, submissionId)`, and `exportTrace(..., policy)`. The trace view groups events by model turn and shows effective input, tool arguments/results, and the answer. A reviewer can annotate the first event where the task diverged, with a reason and expected evidence. The trace format does not itself determine correctness.

## Recovery boundary

The current SharedWorker stores an admission receipt, message projection, and periodic execution snapshot. A fresh worker marks unfinished work `interrupted` and retains queued message text for manual resend. It does not replay an uncertain tool effect or promise a terminal completion after every crash. A completed tool result must be recorded before future automatic recovery can safely skip it. An unresolved ordinary tool call must be marked `unknown`, since it may have produced a side effect. These constraints align with the conservative repair rule in [Flue's durability guide](https://flueframework.com/docs/guide/durability/). Automatic continuation requires a later attempt ledger, bounded retry policy, idempotent tool boundaries, and a wake mechanism that survives the last browser tab closing.

## Transcript dataset

Use a public, declarative Parquet split compatible with `@memora/datasets`; pin its resolved revision. Keep transcript segments as stable rows with `courseId`, `lectureId`, `segmentId`, `startMs`, `endMs`, `text`, `sourceUrl`, `transcriptVersion`, and a source digest. The agent's indexed corpus is built only from that frozen transcript revision. Store evaluation examples in a separate pinned split with `questionId`, `question`, `lectureId` or permitted lecture set, one or more acceptable timestamp windows, required answer points, optional disallowed claims, and supporting segment IDs. Keep answer keys out of the agent-visible corpus.

Start with questions whose evidence is localized and independently checkable. Include paraphrases, terms shared by several lectures, and questions that require combining two segments. Record reviewer notes for ambiguous timestamps or reasonable alternative answers before running models. The dataset card should identify the source course, transcription method and revision, timestamp granularity, review process, and license/provenance. The course download page lists the lecture videos separately from the course package, so video assets and text dataset preparation remain explicit inputs.

## Evaluation run

Add an agent-specific runner beside the existing audio `runEvaluation` API in `@memora/evaluation`. The current runner expects WAV input and computes WER/CER; its result schema should remain valid for ASR runs. The agent runner accepts an installed question split, an adapter that creates an independent SharedWorker session for each example, a model/config identity, a corpus revision, an `AbortSignal`, and progress callback. Run examples concurrently with a fixed internal scheduler; each example has isolated history and memory. The result records the session/submission IDs, trace reference, retrieved segment IDs, cited timestamp, final answer, latency, usage, and any failure. Pin the agent prompt, retrieval/index configuration, model identity, corpus revision, scorer version, and dataset revision in the run result.

Score three separate dimensions per example: (1) evidence retrieval, whether a cited segment overlaps an accepted evidence window and points to the correct lecture; (2) timestamp accuracy, the absolute distance to the nearest accepted window, with an explicit tolerance matching segment granularity; and (3) answer coverage, required points supported by the cited segments, plus unsupported claims. Report counts and rates with their denominators; a missing timestamp is not treated as zero distance. Keep a small reviewed rubric set as the first deterministic gate. Any LLM-assisted judging records its own judge model, prompt, and raw judgment, and remains separate from deterministic metrics. Inspect traces for false positives and failures before changing retrieval or prompts.

The first meaningful run is a small reviewed slice from at least two lectures. Freeze it, execute examples concurrently, inspect a sample of successful and failed traces, then expand. Do not report an agent score until transcript text and question rubrics exist at pinned revisions.
