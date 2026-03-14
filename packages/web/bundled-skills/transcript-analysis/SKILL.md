---
name: transcript-analysis
description: Use when the user wants deeper transcript analysis, timestamped evidence, structured notes from recordings, or extraction of action items from spoken content.
---

# Transcript Analysis

Use this skill when the request is centered on understanding or transforming transcript content, not just locating a file.

## Workflow

1. Identify candidate files before reading content.
2. Prefer transcript-aware tools when the user needs evidence or timestamps.
3. Keep answers grounded in quoted or timestamped transcript evidence.
4. Never expose internal paths, row ids, or storage details.

## Output Guidance

If the user wants a structured transcript-derived deliverable, read `references/answer-format.md` and follow the closest matching format.

## Quality Bar

- Prioritize timestamps and file names over vague summaries.
- Separate evidence from inference when the transcript is ambiguous.
- If the transcript does not support a claim, say so directly.
