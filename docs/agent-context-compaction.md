# Agent context compaction

The model request is rebuilt from the session record on every turn. Compaction changes what that request shows, never what the session record holds: every original message stays in OPFS and the agent can recall it by ID.

## Status

| Part                          | State       | Code                                                                      |
| ----------------------------- | ----------- | ------------------------------------------------------------------------- |
| Write-time cap                | Implemented | `packages/ai-core/src/compaction.ts`                                      |
| Microcompact                  | Implemented | `compaction.ts`, `Agent.compactHistory` in `packages/ai-core/src/loop.ts` |
| Recall tool                   | Implemented | `recallMessage` in `compaction.ts`                                        |
| State after history rewrites  | Implemented | `rebaseCompaction`, the `reset` handler in `agent.shared-worker.ts`       |
| Summary                       | Not started |                                                                           |
| Provider overflow retry       | Not started |                                                                           |
| Idle recap and cold-cache run | Not started |                                                                           |

Compaction is enabled for chat sessions through `compaction: true` in the agent configuration (`useChatModelConfig.ts`). Other agents keep the previous behavior. Until the summary layer exists, anything microcompact cannot fit falls through to `fitToContextWindow`, which drops the oldest turns from that request without persisting the change.

## Principles

- Between compaction events the request only grows at the end, so the provider prompt cache keeps hitting.
- Compaction events are rare. They run only when the context passes the high watermark and the move frees at least the minimum savings, so one cache rewrite buys many cached turns.
- The compaction state is persisted with the session. Rendering is a pure function of the stored history and that state: the same record renders the same bytes, with no timestamps or relative times in placeholders.
- Recalled content is appended as a tool result. It is never put back at its original position.
- Editing an earlier message invalidates later thinking blocks on Claude models that bind thinking to the prompt prefix. Every compaction event strips reasoning and provider replay data from completed turns.
- Compaction runs only at a turn start: the last message is user input that does not follow a tool result. A tool round in progress keeps its reasoning, so it is never compacted mid-round.

## State

The state is saved under the `compaction` key of the agent store and holds two inclusive message IDs:

- `compactedThrough`: messages up to this one render in their shortened form.
- `strippedThrough`: messages up to this one render without reasoning or the stored provider message.

A compaction event sets `compactedThrough` to the message before the protected recent turns and `strippedThrough` to the message before the new user input. Neither moves backwards.

## Layers

### 1. Write-time cap

Every tool result above the write limit is sent with its head and tail and a placeholder in between, from the first time it is sent. It was never sent in full, so shortening it causes no cache rewrite. The stored history keeps up to 100,000 characters of each result for recall.

### 2. Microcompact

A compaction event renders every message up to `compactedThrough` in its shortened form:

- Tool results, assistant text, and long string values inside tool-call arguments keep their head and tail with a placeholder in between. Tool-call arguments stay valid JSON.
- Images become a placeholder. The most recent image in the conversation is always kept, because it is usually what the user is still asking about.
- User message text is not shortened.

Placeholder formats:

```
…[omitted 23,410 characters, recall ID: 1mf3k2-x8a9c1-4]…
[image/png image omitted, recall ID: 5d1c…]
```

No model call is made. If the move frees less than the minimum savings, the state does not change and the request is sent as before.

### 3. Summary

If microcompact leaves the context above the watermark, the oldest turns are replaced by one structured, multi-section summary. The summary request replays the current request prefix and appends the instruction as the last user message, so it reuses the prompt cache. The summarized turns remain recallable by ID.

After three consecutive failed compactions the runtime stops trying and reports that the context is full.

### Provider overflow

A context-overflow error from the provider runs the layers above and retries the request once.

## Idle recap

A recap is one short paragraph describing where the conversation stands. It is optional and separate from the compaction summary.

- The worker generates it when a session has been idle for `T_recap`, which is shorter than the provider cache TTL, so the recap request is served mostly from cache.
- It is generated only when the agent has finished its turn, the conversation is above the minimum size, and enough has happened since the last recap.
- It is stored with the session and replaced by the next recap.
- Timers run in the SharedWorker. If the worker has terminated, no recap is generated, and none is created later.
- The chat shows the latest recap after the last message when the user returns. It is not a chat message and is not added to the history except as described below.

On the next send:

| Gap since last model response      | Action                                                                                                   |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Within the cache TTL               | Send normally. The recap is not injected.                                                                |
| Beyond the cache TTL, recap exists | Run microcompact with the lower cold-cache threshold, then append the recap before the new user message. |
| Beyond the cache TTL, no recap     | Run microcompact with the lower cold-cache threshold only.                                               |

When the cache has expired, the full prefix is rewritten anyway, so the cold-cache run shortens more. Its limits must be persisted with the state, because rendering has to stay reproducible.

## Recall

`recall_message(id, start?, end?)` is registered by the agent when compaction is enabled. It returns the original content as a tool result, in pages of up to 7,000 characters so a recalled page is never shortened again. The result says where the page ends and how to read further. Images come back as images on the first page.

Recall IDs are IDs already stored in the agent history. They are unique within a session and do not change while the history is only appended to.

| Placeholder in               | Recall ID                | Returns                             |
| ---------------------------- | ------------------------ | ----------------------------------- |
| A tool result                | The tool call ID         | The stored result and its images    |
| Assistant text or tool calls | The assistant message ID | The message text and its tool calls |
| A user message image         | The user message ID      | The message text and its images     |

Editing and resending an earlier message cuts the stored history before that message; a user message shares its ID with the displayed message. The worker then rebases the state: an ID still in the history is kept, and an ID the cut removed is replaced by the last kept message, because every kept message was already sent in that form. Histories saved before user messages shared their displayed ID fall back to a text-only rebuild from the displayed messages and are rebased the same way.

## Parameters

Starting values, to be tuned against real sessions:

| Parameter                                 | Value                                              |
| ----------------------------------------- | -------------------------------------------------- |
| Write limit: threshold, head, tail        | 8,000 / 6,000 / 1,500 characters                   |
| Microcompact limit: threshold, head, tail | 2,000 / 1,000 / 500 characters                     |
| Stored tool result                        | 100,000 characters                                 |
| Recall page                               | 7,000 characters                                   |
| Protected recent turns                    | 3 user turns, counting the one being answered      |
| Input budget                              | Context window minus min(output limit, window ÷ 4) |
| High watermark                            | 80% of the input budget                            |
| Minimum savings                           | 10% of the input budget                            |
| Cache TTL                                 | Per provider; 5 minutes when unknown               |
| `T_recap`                                 | TTL minus 1 minute                                 |
| Minimum conversation size for a recap     | 8,000 tokens                                       |

Token estimates use `estimateContextTokens` from pi-ai, the same estimate that clamps the response limit.
