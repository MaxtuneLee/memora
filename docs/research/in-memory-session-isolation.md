# What an in-memory agent session shares with other sessions

Research for issue #54 (map #52). Sources are the code at commit `657f1d3`; every claim cites `file:line`.

## Short answer

- `storage: "memory"` isolates the session's **history, snapshot and agent memory** (personality, notices, anything saved through `context.saveMemory`). It does this by giving the session its own fresh `InMemoryAdapter`, so the session starts with **no** personality and no notices and cannot write the global memory file through the adapter.
- It does **not** isolate **tools**. Every tool runs in whichever tab is the tool host, against the shared LiveStore, OPFS and vector index. One tool, `remember_user_preference`, writes the global memory file directly and would bypass the isolation if a memory session were given it.
- Today only the Grounded retrieval playground opens memory sessions, and it passes no tools.
- For evaluation: add a narrow agent adapter to `@memora/evaluation`, implement it in `evaluation.shared-worker.ts` by asking the Window (as the ASR adapter already does), and have the Window drive the agent runtime client with `storage: "memory"`, an explicit read-only tool list, and a `delete` at the end.

## 1. Agent memory in a memory session

How agent memory is keyed:

- `ContextManager.saveMemory/loadMemory` read and write one record under key `"memory"` for the agent id (`packages/ai-core/src/context.ts:5`, `:65-76`). Personality and notices are two fields of that record, read on every turn (`packages/ai-core/src/loop.ts:423-424`).
- The agent id is `memora-chat:<sessionId>` (`packages/web/src/hooks/chat/useAgent.ts:91`).
- For a normal session the adapter is `createOpfsSessionPersistenceAdapter` (`packages/web/src/workers/agent.shared-worker.ts:151`). That adapter ignores the agent id for `"memory"` and maps it to one global file: save goes to `saveGlobalMemory` (`packages/web/src/lib/chat/opfsSessionPersistenceAdapter.ts:26-30`), load reads the global memory or derives it from the personality document (`:46-61`), remove clears it (`:72-74`). The file is `/chat/profile/memory.json` (`packages/web/src/lib/settings/personalityStorage.ts:3-5`). So for normal sessions agent memory is shared across all sessions by design.

What changes with `storage: "memory"`:

- `getSession` creates a new `InMemoryAdapter` for that session and records it in `transientAdapters` (`agent.shared-worker.ts:113-114`), skips loading the stored chat record (`:115`), and makes `save` a no-op (`:137-138`).
- The runner uses that adapter for everything, including `"memory"` (`:151-152`). `InMemoryAdapter` is a per-instance map (`packages/ai-core/src/persistence.ts:55-57`), so `load("memory")` returns `null`: the session has **no personality and no notices** in its system prompt (`loop.ts:423-428`).
- Memory is read once per runner and frozen: later `load("memory")` calls return a clone of that first read (`agent.shared-worker.ts:152`, `:158-161`), while `save` goes to the adapter (`:154`). For a memory session both sides are the private map, so nothing leaks out and nothing from Settings leaks in.
- `reset` writes history into the private adapter instead of the chat record (`:296-299`), and `delete` drops the adapter instead of deleting a chat file (`:322`).
- The Window-side `saveMemory/loadMemory` on `useAgent` use `options.persistence` (`useAgent.ts:173-187`). Grounded retrieval passes none, so there they throw or return `null`; they never touch the worker's private adapter.

Conclusion: agent memory is isolated in both directions. The cost is that a memory session does not see the user's personality or notices, so it does not behave exactly like a real chat.

Caveats in the worker:

- The `storage` flag exists only on `subscribe` and `submit` (`packages/web/src/lib/agent-runtime/protocol.ts:39`, `:41`) and is honoured only when the session is first created (`agent.shared-worker.ts:110-111`, `:254-257`). If the worker restarts and the first message for that id is `reset`, `abort`, `patch-message` or `delete`, the session is created as a normal OPFS session; `reset` then writes a chat file through `updateChatSession`, which builds an empty record when none exists (`packages/web/src/lib/chat/chatSessionStorage.ts:364-371`).
- `transientAdapters` and `sessions` entries are removed only on `delete` (`agent.shared-worker.ts:322`, `:325`). A caller that never sends `delete` keeps the history in worker memory until the worker dies.
- Running status is broadcast to all ports for every session id, including memory sessions (`agent.shared-worker.ts:42-47`; client side `packages/web/src/lib/agent-runtime/client.ts:105-106`). Only the "finished" notice is suppressed for them (`agent.shared-worker.ts:48-52`).

## 2. Tool state shared regardless of storage mode

How tools run (ADR 0009, `docs/adr/0009-own-chat-execution-in-a-shared-worker.md`):

- The worker registers only the tool names listed in the submission (`agent.shared-worker.ts:166-174`; the list comes from `options.tools`, `useAgent.ts:94-101`).
- Each call goes to the **first** connected host port, not to the tab that submitted (`agent.shared-worker.ts:85`). The host is mounted in `AppLayout` (`packages/web/src/app/layouts/AppLayout.tsx:25-28`) and builds the full tool set from that tab's LiveStore on every call (`packages/web/src/hooks/chat/useAgentToolHost.ts:24-35`). Nothing in the host knows about storage mode.

Shared state reached by tools (`packages/web/src/lib/chat/tools.ts:24-31`):

| Tool | Shared state | Source |
| --- | --- | --- |
| `describe_table`, `query_db` | LiveStore tables (files, folders, collections) | `packages/web/src/lib/chat/tools/dbTools.ts:108`, `:128`, `:147` |
| `read_file`, `grep_files`, `read_extracted_content` | OPFS library files, LiveStore file rows | `packages/web/src/lib/chat/tools/fileTools.ts:37`, `:74`, `:92`, `:230`, `:243` |
| `modify_text_file` (write approval) | Writes OPFS files | `fileTools.ts:123`, `:166`, `:178` |
| `search_files` | Vector index in the `memora-vector-db` SharedWorker, plus settings from LiveStore | `fileTools.ts:190`, `:208-216`; `packages/web/src/lib/model-worker/factory.ts:127`; `packages/web/src/lib/vector-db/client.ts:292-298` |
| `search_transcript` | LiveStore file rows and transcript files | `packages/web/src/lib/chat/tools/transcriptTools.ts:115`, `:148` |
| `list_chat_sessions`, `read_chat_session` | All persisted chat sessions under `/chat/sessions` | `packages/web/src/lib/chat/tools/sessionTools.ts:10-34`; `chatSessionStorage.ts:13`, `:341` |
| `remember_user_preference` | Writes global memory **directly**, not through the adapter | `packages/web/src/lib/chat/tools/memoryTools.ts:13`, `:50`; `personalityStorage.ts:283` |
| `show_widget` and other widget tools | Widget data sources from LiveStore | `packages/web/src/lib/chat/tools/widgetTools.ts:13`, `:34` |

Other worker-wide state: `allowedSessions` ("allow for this session") is keyed by session id (`agent.shared-worker.ts:37`, `:233-235`, `:275`), so it does not cross sessions. Reference scope is captured per submission (`useAgent.ts:72`, `agent.shared-worker.ts:104`) and read by the host per call (`useAgentToolHost.ts:25`).

Conclusion: a memory session reads the same library, index and chat history as every other session, and can write files. `remember_user_preference` is the one tool that would break memory isolation; `list_chat_sessions` and `read_chat_session` would pull other sessions' content into it.

## 3. Who opens memory sessions today

- Only `GroundedRetrieval` (`packages/web/src/components/playground/GroundedRetrieval.tsx:915`, `:928-936`): session id `experiment-<uuid>`, `sessionStorage: "memory"`, `maxIterations: 1`, one grounded-retrieval prompt, and **no tools**. It is the playground's grounded-answer experiment, which should not create chat history or touch user memory. There is no other `sessionStorage: "memory"` caller in `packages/`.
- `noticeExtractor` also uses `createInMemoryAdapter` (`packages/web/src/lib/chat/noticeExtractor.ts:104`), but that is a local one-shot agent, not a SharedWorker session.

## 4. A path for the evaluation SharedWorker

Constraints:

- ADR 0001: `@memora/evaluation` stays independent of Web, gets predictions through narrow adapters, and the Window bridges to other SharedWorkers (`docs/adr/0001-keep-dataset-and-evaluation-independent-of-web.md`).
- Existing pattern: `ModelAdapter` is `{ identity, initialize?, predict(input, signal) => Promise<string> }` (`packages/evaluation/src/types.ts:17-21`). `evaluation.shared-worker.ts` implements it by posting `model-request` to the Window and awaiting `model-result`, with `model-cancel` on abort (`packages/web/src/workers/evaluation.shared-worker.ts:19-50`, `:52-90`, `:96-101`); the Window answers through its local-model client (`packages/web/src/lib/playground/evaluationClient.ts:20-67`).
- The agent runtime has one entry point: the `memora-agent-v2` SharedWorker reached through `agent-runtime/client.ts` (`client.ts:51-61`). Its tools need a Window with LiveStore (ADR 0009; `useAgentToolHost.ts:11`), so the evaluation worker cannot run tools itself.

Path:

1. In `@memora/evaluation`, add an agent adapter shaped like `ModelAdapter`: `identity` plus `answer(example, signal) => Promise<{ answer, sessionId, submissionId, trace? }>`. This matches the agent runner in `docs/agent-observability-evaluation.md:42` ("an adapter that creates an independent SharedWorker session for each example ... each example has isolated history and memory").
2. In `evaluation.shared-worker.ts`, implement it like `createLocalAsrAdapter`: post an `agent-request` to the Window and await `agent-result`, with cancel handled like `model-cancel`.
3. In the Window (`evaluationClient.ts`), handle `agent-request` with the agent runtime client: `subscribe(id, listener, "memory")`, `command({ type: "submit", sessionId: id, storage: "memory", submission })`, wait until the snapshot has no `activeRunId` and no pending work, read the last assistant message, then `command({ type: "delete", sessionId: id })`. Use a fresh id per example (for example `eval-<uuid>`).
4. Build the submission with an explicit tool list of read-only retrieval tools. Leave out `remember_user_preference` (writes global memory), `list_chat_sessions` and `read_chat_session` (read other sessions), and `modify_text_file` (writes files and waits for approval). If a personality should apply, pin it as a prompt segment, since a memory session does not load global memory.
5. Worker fixes worth making first: carry `storage` on `reset`/`abort`/`delete` (or refuse to create a persistent session for an id that was transient), and always send `delete` (in a `finally`) so `transientAdapters` does not grow.

Open points:

- Tools still search the user's whole library and vector index. A frozen evaluation corpus (`docs/agent-observability-evaluation.md:36`) needs either a reference scope limited to the corpus files (`packages/web/src/lib/chat/tools/shared.ts:4-19`) or a separate index config; neither is wired today.
- Tool calls go to the first host tab (`agent.shared-worker.ts:85`), not the tab running the evaluation. With several tabs open, tools run in another tab's store; the data is the same, but cancellation and approval prompts land there.
