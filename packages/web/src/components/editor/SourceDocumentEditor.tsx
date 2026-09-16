import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";

import { markdown } from "@codemirror/lang-markdown";
import { StateEffect, StateField, type EditorState, type Range } from "@codemirror/state";
import { Decoration, EditorView, hoverTooltip, type DecorationSet } from "@codemirror/view";
import CodeMirror from "@uiw/react-codemirror";
import * as stylex from "@stylexjs/stylex";

import type { MarkdownSafetyDiagnostic } from "@/lib/editor/markdownRoundTripGuard";

const styles = stylex.create({
  root: { display: "flex", flexDirection: "column", gap: 16 },
  editorSurface: {
    backgroundColor: "var(--color-memora-surface-soft)",
    borderColor: "var(--color-memora-border-soft)",
    borderRadius: 12,
    borderStyle: "solid",
    borderWidth: 1,
    overflow: "hidden",
    paddingBlock: 4,
    paddingInline: 4,
  },
  diagnostic: { borderLeft: "1px solid var(--color-memora-warning-border)", paddingLeft: 12 },
  diagnosticTitle: {
    color: "var(--color-memora-warning-text)",
    fontSize: "0.75rem",
    fontWeight: 600,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
  },
  diagnosticList: { display: "flex", flexDirection: "column", gap: 4, marginTop: 4 },
  diagnosticLink: {
    borderRadius: 4,
    color: "var(--color-memora-warning-text)",
    fontSize: "0.875rem",
    outline: "none",
    paddingBlock: 2,
    paddingInline: 4,
    textAlign: "left",
    textDecorationColor: "var(--color-memora-warning-border)",
    textDecorationLine: "underline",
    textUnderlineOffset: 4,
    transition: "background-color 150ms",
    ":hover": { backgroundColor: "var(--color-memora-warning-surface)" },
    ":focus-visible": { boxShadow: "0 0 0 2px var(--color-memora-olive-soft)" },
  },
});

interface SourceDocumentEditorProps {
  text: string;
  onTextChange: (text: string) => void;
  onVisibleLineChange?: (lineNumber: number) => void;
  focusedLineStart?: number | null;
  focusedLineEnd?: number | null;
  diagnostics?: readonly MarkdownSafetyDiagnostic[];
  readOnly?: boolean;
}

export interface SourceDocumentEditorHandle {
  focusEditor: () => void;
  revealLine: (lineNumber: number) => void;
  revealDiagnostic: (index?: number) => void;
}

interface SafetyDiagnosticEditorState {
  decorations: DecorationSet;
  diagnostics: readonly MarkdownSafetyDiagnostic[];
}

const setSafetyDiagnosticsEffect = StateEffect.define<readonly MarkdownSafetyDiagnostic[]>();

const clampDiagnosticRange = (
  documentLength: number,
  diagnostic: MarkdownSafetyDiagnostic,
): { from: number; to: number } => {
  const from = Math.min(Math.max(diagnostic.from, 0), documentLength);
  const to = Math.min(Math.max(diagnostic.to, from), documentLength);
  return { from, to };
};

const createSafetyDiagnosticState = (
  viewState: EditorState,
  diagnostics: readonly MarkdownSafetyDiagnostic[],
): SafetyDiagnosticEditorState => {
  const ranges: Range<Decoration>[] = [];
  for (const diagnostic of diagnostics) {
    const { from, to } = clampDiagnosticRange(viewState.doc.length, diagnostic);
    const lineFrom = viewState.doc.lineAt(from).from;
    ranges.push(
      Decoration.line({
        attributes: {
          "data-markdown-safety-line": String(diagnostic.line),
        },
        class: "cm-markdown-safety-line",
      }).range(lineFrom),
    );
    if (from < to) {
      ranges.push(
        Decoration.mark({
          attributes: {
            "data-markdown-safety-message": diagnostic.message,
          },
          class: "cm-markdown-safety-diagnostic",
        }).range(from, to),
      );
    }
  }

  return {
    decorations: Decoration.set(ranges, true),
    diagnostics,
  };
};

const safetyDiagnosticField = StateField.define<SafetyDiagnosticEditorState>({
  create: (state) => createSafetyDiagnosticState(state, []),
  update: (value, transaction) => {
    let diagnostics = transaction.docChanged ? [] : value.diagnostics;
    for (const effect of transaction.effects) {
      if (effect.is(setSafetyDiagnosticsEffect)) {
        diagnostics = effect.value;
      }
    }
    return createSafetyDiagnosticState(transaction.state, diagnostics);
  },
  provide: (field) => EditorView.decorations.from(field, (value) => value.decorations),
});

const safetyDiagnosticTooltip = hoverTooltip((view, position) => {
  const diagnostic = view.state.field(safetyDiagnosticField).diagnostics.find((candidate) => {
    const { from, to } = clampDiagnosticRange(view.state.doc.length, candidate);
    return position >= from && position <= Math.max(from, to);
  });
  if (!diagnostic) {
    return null;
  }

  const { from, to } = clampDiagnosticRange(view.state.doc.length, diagnostic);
  return {
    above: true,
    end: to,
    pos: from,
    create: () => {
      const dom = document.createElement("div");
      dom.className = "cm-markdown-safety-tooltip";
      dom.textContent = diagnostic.message;
      return { dom };
    },
  };
});

const sourceEditorTheme = EditorView.theme({
  "&": {
    backgroundColor: "transparent",
    color: "var(--color-memora-text)",
    fontSize: "var(--document-editor-font-size, 16px)",
  },
  "&.cm-focused": {
    outline: "none",
  },
  ".cm-scroller": {
    fontFamily:
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
    lineHeight: "1.5rem",
    minHeight: "388px",
    overflow: "auto",
  },
  ".cm-content": {
    caretColor: "var(--color-memora-text)",
    padding: "0.25rem 0",
  },
  ".cm-gutters": {
    backgroundColor: "transparent",
    borderRight: "1px solid var(--color-memora-border-soft)",
    color: "var(--color-memora-text-soft)",
  },
  ".cm-activeLine, .cm-activeLineGutter": {
    backgroundColor: "var(--color-memora-hover-strong)",
  },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection": {
    backgroundColor: "var(--color-memora-olive-faint)",
  },
  ".cm-markdown-safety-line": {
    backgroundColor: "var(--color-memora-warning-surface)",
    boxShadow: "inset 2px 0 0 var(--color-memora-warning-text)",
  },
  ".cm-markdown-safety-diagnostic": {
    backgroundColor: "var(--color-memora-warning-surface)",
    textDecoration: "underline wavy var(--color-memora-warning-text)",
    textDecorationThickness: "1px",
    textUnderlineOffset: "3px",
  },
  ".cm-tooltip.cm-tooltip-hover": {
    backgroundColor: "var(--color-memora-surface)",
    border: "1px solid var(--color-memora-warning-border)",
    borderRadius: "0.75rem",
    boxShadow: "0 8px 24px rgba(34, 33, 29, 0.08)",
    color: "var(--color-memora-warning-text)",
    maxWidth: "32rem",
    padding: "0.5rem 0.75rem",
  },
  ".cm-markdown-safety-tooltip": {
    fontFamily: "inherit",
    fontSize: "0.8125rem",
    lineHeight: "1.25rem",
  },
});

const sourceEditorExtensions = [
  markdown(),
  EditorView.contentAttributes.of({
    "aria-label": "Document source",
    spellcheck: "false",
  }),
  safetyDiagnosticField,
  safetyDiagnosticTooltip,
  sourceEditorTheme,
];

const clampLineNumber = (lineNumber: number, lineCount: number): number => {
  return Math.max(1, Math.min(lineNumber, lineCount));
};

const OUTLINE_SCROLL_TOP_MARGIN_PX = 16;

export const SourceDocumentEditor = forwardRef<
  SourceDocumentEditorHandle,
  SourceDocumentEditorProps
>(function SourceDocumentEditor(
  {
    text,
    onTextChange,
    onVisibleLineChange,
    focusedLineStart = null,
    focusedLineEnd = null,
    diagnostics = [],
    readOnly = false,
  },
  ref,
) {
  const [editorView, setEditorView] = useState<EditorView | null>(null);
  const onVisibleLineChangeRef = useRef(onVisibleLineChange);

  useEffect(() => {
    onVisibleLineChangeRef.current = onVisibleLineChange;
  }, [onVisibleLineChange]);

  const visibleLineExtension = useMemo(() => {
    return EditorView.updateListener.of((update) => {
      if (!update.viewportChanged && !update.docChanged) {
        return;
      }
      const lineNumber = update.state.doc.lineAt(update.view.viewport.from).number;
      onVisibleLineChangeRef.current?.(lineNumber);
    });
  }, []);

  const revealLine = useCallback(
    (lineNumber: number): void => {
      if (!editorView) {
        return;
      }
      const line = editorView.state.doc.line(
        clampLineNumber(lineNumber, editorView.state.doc.lines),
      );
      editorView.focus();
      editorView.dispatch({
        effects: EditorView.scrollIntoView(line.from, {
          y: "start",
          yMargin: OUTLINE_SCROLL_TOP_MARGIN_PX,
        }),
        selection: { anchor: line.from },
      });
    },
    [editorView],
  );

  const revealDiagnostic = useCallback(
    (index = 0): void => {
      const diagnostic = diagnostics[index];
      if (!editorView || !diagnostic) {
        return;
      }
      const { from, to } = clampDiagnosticRange(editorView.state.doc.length, diagnostic);
      editorView.focus();
      editorView.dispatch({
        effects: EditorView.scrollIntoView(from, { y: "center" }),
        selection: { anchor: from, head: to },
      });
    },
    [diagnostics, editorView],
  );

  useImperativeHandle(
    ref,
    () => ({
      focusEditor: () => editorView?.focus(),
      revealLine,
      revealDiagnostic,
    }),
    [editorView, revealDiagnostic, revealLine],
  );

  useEffect(() => {
    if (!editorView) {
      return;
    }
    editorView.dispatch({
      effects: setSafetyDiagnosticsEffect.of(diagnostics),
    });
    if (diagnostics.length > 0) {
      revealDiagnostic();
    }
  }, [diagnostics, editorView, revealDiagnostic]);

  useEffect(() => {
    if (!editorView || focusedLineStart === null) {
      return;
    }
    const lineCount = editorView.state.doc.lines;
    const startLine = editorView.state.doc.line(clampLineNumber(focusedLineStart, lineCount));
    const endLine = editorView.state.doc.line(
      clampLineNumber(focusedLineEnd ?? focusedLineStart, lineCount),
    );
    editorView.focus();
    editorView.dispatch({
      effects: EditorView.scrollIntoView(startLine.from, { y: "center" }),
      selection: {
        anchor: startLine.from,
        head: endLine.to,
      },
    });
  }, [editorView, focusedLineEnd, focusedLineStart]);

  useEffect(() => {
    if (!editorView) {
      return;
    }
    const lineNumber = editorView.state.doc.lineAt(editorView.viewport.from).number;
    onVisibleLineChangeRef.current?.(lineNumber);
  }, [editorView]);

  return (
    <section {...stylex.props(styles.root)} data-surface="source-document-editor">
      <div {...stylex.props(styles.editorSurface)}>
        <CodeMirror
          value={text}
          height="auto"
          minHeight="388px"
          width="100%"
          theme="none"
          basicSetup={{
            foldGutter: false,
            highlightActiveLine: true,
            highlightActiveLineGutter: true,
          }}
          editable={!readOnly}
          readOnly={readOnly}
          extensions={[...sourceEditorExtensions, visibleLineExtension]}
          onCreateEditor={(view) => setEditorView(view)}
          onChange={(value) => onTextChange(value)}
        />
      </div>

      {diagnostics.length > 0 ? (
        <div aria-label="Markdown safety issues" {...stylex.props(styles.diagnostic)}>
          <div {...stylex.props(styles.diagnosticTitle)}>Preview changes</div>
          <ol {...stylex.props(styles.diagnosticList)}>
            {diagnostics.map((diagnostic, index) => (
              <li key={`${diagnostic.from}:${diagnostic.to}:${diagnostic.message}`}>
                <button
                  type="button"
                  {...stylex.props(styles.diagnosticLink)}
                  aria-label={diagnostic.message}
                  onClick={() => revealDiagnostic(index)}
                >
                  {diagnostic.message}
                </button>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </section>
  );
});
