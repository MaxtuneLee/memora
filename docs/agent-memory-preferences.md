# Agent memory: keeping preferences current

The chat agent keeps the user's lasting communication preferences as notices in `/chat/profile/memory.json` and adds them to the system prompt of every chat. A preference can stop being true: the user asks for Chinese after asking for English, or says they no longer want bullet points. This document describes how a changed or withdrawn preference replaces the old notice instead of sitting next to it.

## Status

| Part                             | State       | Code                                                                |
| -------------------------------- | ----------- | ------------------------------------------------------------------- |
| Extractor sees the saved notices | Implemented | `extractNoticeChangesWithAI` in `lib/chat/noticeExtractor.ts`       |
| Add, replace, and remove notices | Implemented | `applyMemoryNoticeChanges` in `lib/settings/personalityStorage.ts`  |
| Tool and chat prompt wording     | Implemented | `lib/chat/tools/memoryTools.ts`, rule 5 in `lib/chat/tools.ts`      |
| Precedence in the system prompt  | Implemented | `mergeSystemPromptWithMemory` in `packages/ai-core/src/loop.ts`     |
| Memory evaluation "change" cases | Implemented | `SaveCase.notices` in `packages/evaluation/src/memoryEvaluation.ts` |
| Forget tool, edit in Settings    | Not started |                                                                     |

Web paths are relative to `packages/web/src`.

## The problem before this change

- The extractor only saw the current exchange, not what was already saved, so it could not tell that a new preference replaced an old one.
- Storage only added notices. It refreshed an existing notice only when the new text matched it exactly (ignoring case and trailing punctuation), which LLM-written sentences rarely do.
- Nothing could remove a notice except the user, one at a time, in Settings > Memory.
- The system prompt listed every notice under "Stable User Preferences" with no dates and no rule for conflicts, so "User prefers replies in English." and "User prefers replies in Chinese." could both reach the model.

## How it works now

### Writing

1. The chat model calls `remember_user_preference` when the user states a lasting preference, or changes or withdraws one listed under Stable User Preferences.
2. The tool reads the saved notices (`memoryNotices.list`) and passes them to the extractor, numbered from 1.
3. The extractor returns the changes, not a list of new notices:

   ```json
   { "add": ["..."], "replace": [{ "id": 1, "text": "..." }], "remove": [2] }
   ```

   `parseNoticeChanges` maps the numbers back to notice IDs. A replacement whose number names no saved notice becomes an addition; an unknown number in `remove` is dropped. The earlier `{"notices": [...]}` shape is still read as additions.

4. `applyMemoryNoticeChanges` applies them:
   - A replaced notice keeps its ID and `createdAt`, and gets the new text and `updatedAt`.
   - A notice named in both `replace` and `remove` is replaced, not removed.
   - A new or replacing text that matches another saved notice refreshes that notice instead of creating a duplicate.
   - `updated` is false when nothing changed, so the chat shows no "memory updated" notice.

The tool's storage is injected through `CreateChatToolsOptions.memoryNotices` (`list` and `apply`). Without it, the tool uses the user's global memory. The memory evaluation passes its own in-memory stand-in.

### Reading

`mergeSystemPromptWithMemory` now:

- sorts notices by `updatedAt`, newest first, and appends the date each was saved, for example `- User prefers replies in Chinese. (saved 2026-09-20)`;
- states the precedence under the heading: the newer of two conflicting notices wins, a request in the current conversation overrides them, and notices override the assistant style in the personality context (the last rule appears only when there is a personality).

The personality is not model-generated and is not changed by notices. Since ADR-0005 it is a fixed template filled from the Personalization settings (name, primary use case, assistant style, custom instructions) and rebuilt whenever the user edits them. The user keeps it current in settings; notices only need a rule for when the two disagree, and a preference stated in chat is the more specific of the two.

Notices given without a time, as in the evaluation profiles, keep their order and have no date. The system prompt changes only when the notices change, so the prompt cache is unaffected between those writes.

## Why notices are superseded, not expired

Communication preferences do not go stale with time. They go stale when the user says something new. Expiring notices after a fixed period would drop preferences the user still holds and would not fix a contradiction that arrives a day later. The change is therefore made at write time, when the conflicting statement is in front of the extractor, with the prompt precedence as a fallback for anything the extractor misses.

## Evaluation

A save case can list the preferences that are already saved before its message:

```json
{
  "caseId": "c01",
  "kind": "save",
  "category": "change",
  "message": "Actually, answer in Chinese from now on.",
  "notices": ["User prefers answers in English."],
  "expect": "save",
  "noticeChecks": [
    { "type": "pattern", "pattern": "chinese" },
    { "type": "pattern", "pattern": "english", "expect": "noMatch" }
  ]
}
```

- The adapter receives `notices`, shows them to the agent as its stored preferences, and starts the preference tool's stand-in from them.
- `MemoryReply.notices` is now the saved notices after the Run, not only the ones the tool produced. For cases without `notices` the two are the same.
- `stored` means the saved notices changed. `noticeChecks` run on all saved notices after the Run, so a `noMatch` check catches an old notice that was kept. The English check runs only on notices that were not in the case.

The cases file lives outside the repository (`~/memora-eval-data/memory/`), so the `change` cases still need to be written there and run (see `docs/EVAL.md`).

## Not done yet

- A way to forget a preference without stating a new one in chat, beyond `remove` from the extractor, and editing a notice in Settings > Memory (only deleting is possible).
- A cap on the number of notices.
