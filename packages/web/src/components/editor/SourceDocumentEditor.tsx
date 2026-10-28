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
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { Compartment, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import CodeMirror from "@uiw/react-codemirror";
import * as stylex from "@stylexjs/stylex";

import { useResolvedTheme } from "@/hooks/theme/useResolvedTheme";
import { tokens } from "../../styles/stylex.stylex";

const styles = stylex.create({
  root: { display: "flex", flexDirection: "column", gap: 16 },
  editorSurface: {
    backgroundColor: tokens.surfaceSoft,
    borderColor: tokens.borderSoft,
    borderRadius: 12,
    borderStyle: "solid",
    borderWidth: 1,
    overflow: "hidden",
    paddingBlock: 4,
    paddingInline: 4,
  },
});

interface SourceDocumentEditorProps {
  text: string;
  onTextChange: (text: string) => void;
  onVisibleLineChange?: (lineNumber: number) => void;
  // Selected text while the editor has focus, or null once the selection collapses.
  onSelectionTextChange?: (text: string | null) => void;
  focusedLineStart?: number | null;
  focusedLineEnd?: number | null;
  readOnly?: boolean;
}

export interface SourceDocumentEditorHandle {
  focusEditor: () => void;
  revealLine: (lineNumber: number) => void;
}

// Surfaces, gutters, and selection all read CSS custom
// properties, so they repaint automatically when the resolved theme flips the document root's
// variable values - no reconfiguration needed for those. The `dark` flag passed to
// `EditorView.theme` still needs to change per theme, though: it drives CodeMirror's own
// built-in extensions (e.g. the default panel/tooltip base themes), so it's threaded through
// a Compartment the component reconfigures on theme change instead of recreating the view.
const buildSourceEditorTheme = (dark: boolean): Extension =>
  EditorView.theme(
    {
      "&": {
        backgroundColor: "transparent",
        color: tokens.text,
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
        caretColor: tokens.text,
        padding: "0.25rem 0",
      },
      ".cm-gutters": {
        backgroundColor: "transparent",
        borderRight: `1px solid ${tokens.borderSoft}`,
        color: tokens.textSoft,
      },
      ".cm-activeLine, .cm-activeLineGutter": {
        backgroundColor: tokens.hoverStrong,
      },
      ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection": {
        backgroundColor: tokens.selectionBackground,
      },
      ".cm-searchMatch": {
        backgroundColor: `color-mix(in srgb, ${tokens.oliveSoft} 35%, transparent)`,
      },
      ".cm-searchMatch.cm-searchMatch-selected": {
        backgroundColor: `color-mix(in srgb, ${tokens.olive} 45%, transparent)`,
      },
      ".cm-selectionMatch": {
        backgroundColor: `color-mix(in srgb, ${tokens.oliveSoft} 22%, transparent)`,
      },
    },
    { dark },
  );

// Colors are CSS variables, so the style repaints with the resolved theme without reconfiguring.
const sourceEditorHighlightStyle = HighlightStyle.define([
  { tag: tags.heading, color: tokens.textStrong, fontWeight: "700" },
  { tag: tags.strong, fontWeight: "700" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: [tags.link, tags.url], color: tokens.oliveText },
  { tag: tags.monospace, color: tokens.warningText },
  {
    tag: [tags.processingInstruction, tags.meta, tags.contentSeparator, tags.quote],
    color: tokens.textMuted,
  },
]);

const sourceEditorExtensions = [
  syntaxHighlighting(sourceEditorHighlightStyle),
  markdown(),
  EditorView.contentAttributes.of({
    "aria-label": "Document source",
    spellcheck: "false",
  }),
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
    onSelectionTextChange,
    focusedLineStart = null,
    focusedLineEnd = null,
    readOnly = false,
  },
  ref,
) {
  const [editorView, setEditorView] = useState<EditorView | null>(null);
  const onVisibleLineChangeRef = useRef(onVisibleLineChange);
  const onSelectionTextChangeRef = useRef(onSelectionTextChange);
  const resolvedTheme = useResolvedTheme();
  const themeCompartment = useMemo(() => new Compartment(), []);
  // Computed once: later theme changes are applied through the compartment's reconfigure
  // effect below rather than by re-deriving this array (which would only matter if `@uiw/
  // react-codemirror` recreated the view on an `extensions` prop change).
  const [themedExtensions] = useState<Extension[]>(() => [
    ...sourceEditorExtensions,
    themeCompartment.of(buildSourceEditorTheme(resolvedTheme === "dark")),
  ]);

  useEffect(() => {
    onVisibleLineChangeRef.current = onVisibleLineChange;
  }, [onVisibleLineChange]);

  useEffect(() => {
    onSelectionTextChangeRef.current = onSelectionTextChange;
  }, [onSelectionTextChange]);

  // Reconfigures the theme compartment in place on theme change - the document, selection,
  // undo history, and focus all live on the rest of the editor state and are untouched.
  useEffect(() => {
    if (!editorView) {
      return;
    }
    editorView.dispatch({
      effects: themeCompartment.reconfigure(buildSourceEditorTheme(resolvedTheme === "dark")),
    });
  }, [editorView, resolvedTheme, themeCompartment]);

  const visibleLineExtension = useMemo(() => {
    return EditorView.updateListener.of((update) => {
      if (update.selectionSet && update.view.hasFocus) {
        const { from, to } = update.state.selection.main;
        onSelectionTextChangeRef.current?.(from === to ? null : update.state.sliceDoc(from, to));
      }
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

  useImperativeHandle(
    ref,
    () => ({
      focusEditor: () => editorView?.focus(),
      revealLine,
    }),
    [editorView, revealLine],
  );

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
            syntaxHighlighting: false,
          }}
          editable={!readOnly}
          readOnly={readOnly}
          extensions={[...themedExtensions, visibleLineExtension]}
          onCreateEditor={(view) => setEditorView(view)}
          onChange={(value) => onTextChange(value)}
        />
      </div>
    </section>
  );
});
