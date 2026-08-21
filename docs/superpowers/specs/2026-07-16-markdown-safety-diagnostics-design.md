# Markdown Safety Diagnostics Design

## Goal

When WYSIWYG preflight refuses Preview because the Markdown would change, Code mode must identify the source range that caused the refusal and explain the exact before/after change. The source document remains authoritative and is never rewritten by diagnostics.

## Scope

- Replace the current textarea-backed source surface with the already-installed `@uiw/react-codemirror` editor.
- Preserve controlled text updates, read-only behavior, reference navigation, external line selection, scrolling, and imperative focus.
- Extend WYSIWYG preflight results with deterministic source diagnostics when round-tripped Markdown differs.
- Show diagnostics only for the canonical document snapshot that was checked.
- Clear stale diagnostics immediately after an edit or successful preflight.
- Keep conversion exceptions as document-level notices because no trustworthy source range is available.

## Diff Model

Each diagnostic contains:

- `from` and `to`: zero-based offsets in the original Markdown.
- `line` and `column`: one-based display coordinates derived from `from`.
- `sourceText`: the affected original text; insertions use the nearest meaningful token as their visible range.
- `replacementText`: the corresponding round-trip text.
- `message`: concise copy such as ``Line 4: `- [] item` would become `- [ ] item`.``

The first implementation uses a deterministic character diff with shared prefix/suffix trimming for each changed block. It must support insertions, deletions, replacements, and multiple non-adjacent line changes. Line-level anchors keep diagnostics understandable when a formatter changes a whole Markdown construct.

## Data Flow

1. `preflightMarkdownForWysiwyg` imports and exports the canonical Markdown.
2. If normalized text differs, it returns `content-changed`, the round-tripped text, and source diagnostics.
3. `DocumentEditorPage` verifies that the before/after canonical snapshots still match.
4. On a current unsafe result, the page stays in Code mode and stores the diagnostics alongside the safety notice.
5. `MarkdownDocumentEditor` passes diagnostics to `SourceDocumentEditor`.
6. CodeMirror renders a warning decoration and line marker; hovering or focusing the marked range exposes the message. The notice can focus the first diagnostic.
7. Any document edit clears the old result before the next preflight.

## Source Editor

`SourceDocumentEditor` remains the compatibility boundary. Its public props and ref stay stable while its implementation moves to CodeMirror 6. Markdown language support comes from `@codemirror/lang-markdown`. Diagnostics use existing `@codemirror/state` and `@codemirror/view` primitives, avoiding a new dependency.

The visual treatment follows Memora's warning tokens: a restrained amber underline/background, a narrow gutter marker, accessible focus styling, and a tooltip containing plain text. It must remain legible in light and dark themes.

## Safety and Edge Cases

- Clamp every range to the current document length.
- Never display diagnostics produced for an older file, session, revision, or text snapshot.
- Avoid zero-width invisible markers by expanding insertions to the nearest token or one-character range.
- For an empty document, attach the marker to offset zero and keep the explanation in the notice.
- Large or structurally rewritten documents may receive line-level ranges instead of misleading character precision.
- Conversion errors retain the existing generic message and no source decoration.

## Testing

- Unit tests for insertion, deletion, replacement, multiple changes, and line/column mapping.
- Preflight regression for `- [] item` becoming `- [ ] item`.
- Source editor tests for controlled editing, read-only mode, external selection, focus, diagnostic rendering, and stale-diagnostic clearing.
- Page integration tests proving unsafe Preview focuses Code mode, shows the exact change, clears it after editing, and rejects stale preflight results.
- Run the complete editor test suite plus targeted formatting, lint, and TypeScript checks.
