# Nemotron joins local-model-runtime with a streaming ASR protocol

Status: supersedes ADR-0003.

## Context

ADR-0003 kept Nemotron as a standalone `ModelAdapter`, bypassing `local-model-runtime` entirely, scoped to the evaluation playground only — with an explicit note to revisit "if Nemotron proves worth using for real transcription." Nemotron's adapter now produces word-level timestamps, which is what live transcription needs to satisfy `TranscriptionProvider`'s capability contract. This ADR is that revisit: Nemotron becomes a selectable local model for live/mic transcription (`modelRouting.ts` / `transcriptionRuntime.ts`), not just the evaluation playground — reversing ADR-0003's core claim rather than just extending its boundary.

## Decision

**Nemotron becomes a real `local-model-runtime` ASR adapter, not a standalone bypass.** Checking `local-model-runtime/src/cache.ts` showed the package is already network-unrelated for Whisper: it defines a `LocalModelAssetCache` interface and `setLocalModelAssetCache()` DI seam, while the actual OPFS-backed implementation lives in `packages/web`. Dispatch (`handlers/runtime.ts`) is a plain per-adapter branch, not a rigid enum. So folding Nemotron in doesn't require the "runtime-kind abstraction" ADR-0003 worried about — it requires one more manifest entry, one more handler (`handlers/asr/nemotron.ts`, peer of `whisper.ts`, using `onnxruntime-web` as a real dependency of the package), and a Nemotron-shaped asset-cache interface (multi-file + external-data blobs, unlike Whisper's single-response-per-request shape) injected from `packages/web` the same way. Both the evaluation playground and live transcription now go through this one implementation; the standalone adapter under `packages/web/src/lib/playground/nemotron/` is retired, and `evaluation.shared-worker.ts` calls through `localModelClient` like any other local model.

**Live transcription streams continuously; it does not re-decode fixed windows.** Nemotron's encoder/decoder are cache-aware by design — resetting that state on a fixed window schedule (matching Whisper's current 30s-window behavior) reintroduces a cold-start artifact at every window boundary, and papering over it with overlapping windows plus timestamp-based stitching redundantly decodes the overlap and only approximates continuity. The actual protocol gap was narrow enough to close directly: `local-model-runtime`'s shared-worker protocol gains a long-lived task shape (`asr.stream-open`, which does not resolve until the client ends it) and two message types — `stream-chunk` to push audio into the running task, `stream-close` to flush the final decode and complete it. Encoder cache and RNN-T decoder state persist for the life of one recording, only resetting at `stream-open`. Client-side, `ModelWorkerFactory.run()` exposes a push/close handle for this task kind, which maps directly onto `TranscriptionSession`'s existing `write()`/`finish()`/`abort()`.

**The stream runs on the existing `asr` pool, not a dedicated one.** The pool's dispatch loop is single-flight (one active task at a time); a windowed design would only hold that lock briefly per window, but an open-ended stream holds it for the recording's full duration, blocking concurrent eval runs or other ASR tasks. A dedicated `asr-live` pool would isolate this at near-zero cost (pools are already just parallel independent SharedWorkers), but is deliberately not built now: concurrent live-recording-plus-eval use is expected to be rare, and the isolation can be added later without disturbing this design if that assumption turns out wrong.

Device allocation is unchanged from ADR-0003: the encoder attempts webgpu with wasm fallback; the decoder and joint network always run on wasm, per-session rather than per-model, for the same autoregressive-decode-loop reasons.

## Considered options

- Keep Nemotron standalone for live transcription too (extending ADR-0003's original shape rather than reversing it) — rejected once the existing `LocalModelAssetCache` DI seam showed integration was cheap, not speculative.
- Buffered short windows (2-4s), reusing the one-shot task protocol unchanged — rejected: still resets cache/decoder state at every boundary, just more often than Whisper's 30s windows.
- Overlapping windows with timestamp-based dedup/stitching — rejected as a workaround for a protocol gap narrow enough to fix directly, at the cost of redundantly decoding every overlap region.

## Consequences

- `@memora/local-model-runtime` gains `onnxruntime-web` as a dependency and a second value in its runtime union — no longer transformers.js-only.
- A live Nemotron recording exclusively occupies the `asr` pool for its full duration; concurrent eval runs or other ASR tasks queue behind it until the recording ends.
- The evaluation playground's Nemotron path changes from a standalone in-worker adapter to a call through `localModelClient`, sharing one implementation with live transcription.
