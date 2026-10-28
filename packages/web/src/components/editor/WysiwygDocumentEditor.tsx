import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from "react";

import { getOriginalDoc } from "@codemirror/merge";
import { EditorView, type ViewUpdate } from "@codemirror/view";
import * as stylex from "@stylexjs/stylex";
import {
  MarkdownEditor,
  type MarkdownEditorHandle,
  type WikiLinkOptions,
} from "memora-markdown-editor";
import { markdownDiff } from "memora-markdown-editor/diff";
import "memora-markdown-editor/styles.css";

import { parseMarkdownHeadings } from "@/components/editor/DocumentOutlineIndicator";
import { useResolvedTheme } from "@/hooks/theme/useResolvedTheme";
import { parseLineAnchor } from "@/lib/editor/referenceLinks";
import { tokens } from "../../styles/stylex.stylex";
import "./markdownEditor.css";

export interface WysiwygDocumentEditorHandle {
  revealLine: (lineNumber: number) => void;
}

/** Chat changes waiting for review, shown in the note as a diff against the saved text. */
export interface WysiwygDocumentReview {
  proposedText: string;
  // Called with the note after one change was accepted into it.
  onAcceptText: (text: string) => void;
  // Called with the proposal after a change was rejected or edited.
  onProposalChange: (proposal: string) => void;
}

interface WysiwygDocumentEditorProps {
  text: string;
  review?: WysiwygDocumentReview | null;
  onVisibleLineChange?: (lineNumber: number) => void;
  // Selected text while the editor has a range selection, or null once it collapses.
  onSelectionTextChange?: (text: string | null) => void;
  onTextChange: (text: string) => void;
  // Opens a link to another file in the workspace, such as `../notes/parser.md#L12`.
  onOpenReference?: (href: string) => void;
  wikiLinks?: WikiLinkOptions;
}

const OUTLINE_SCROLL_TOP_MARGIN_PX = 16;

// A scheme (`https:`, `mailto:`) or a protocol-relative URL; anything else is a workspace path.
const EXTERNAL_LINK_PATTERN = /^(?:[a-z][a-z\d+.-]*:|\/\/)/i;

const OPENABLE_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

// The link as an absolute URL when it is a web or mail link, or null for any other scheme.
const openableUrl = (href: string): string | null => {
  if (!URL.canParse(href, window.location.href)) {
    return null;
  }
  const url = new URL(href, window.location.href);
  return OPENABLE_PROTOCOLS.has(url.protocol) ? url.href : null;
};

// GitHub's heading anchors: lowercase, punctuation dropped, spaces as hyphens.
const headingSlug = (title: string): string =>
  title
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-");

const safeDecodeURIComponent = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const reportSelectionText = (
  update: ViewUpdate,
  onSelectionTextChange: ((text: string | null) => void) | undefined,
): void => {
  if (!onSelectionTextChange || !update.selectionSet || !update.view.hasFocus) {
    return;
  }
  const { from, to } = update.state.selection.main;
  onSelectionTextChange(from === to ? null : update.state.sliceDoc(from, to));
};

const reportVisibleLine = (
  update: ViewUpdate,
  onVisibleLineChange: ((lineNumber: number) => void) | undefined,
): void => {
  if (onVisibleLineChange && (update.viewportChanged || update.docChanged)) {
    onVisibleLineChange(update.state.doc.lineAt(update.view.viewport.from).number);
  }
};

// Accept moves a change into the original, which the merge view keeps in its own field.
const reportAcceptedChange = (update: ViewUpdate, review: WysiwygDocumentReview | null): void => {
  if (!review) {
    return;
  }
  let before;
  let after;
  try {
    before = getOriginalDoc(update.startState);
    after = getOriginalDoc(update.state);
  } catch {
    // The diff field is missing while the editor switches into or out of review.
    return;
  }
  if (before !== after) {
    review.onAcceptText(after.toString());
  }
};

const findScrollParent = (element: HTMLElement): HTMLElement | null => {
  let parent = element.parentElement;
  while (parent && !/(auto|scroll)/.test(getComputedStyle(parent).overflowY)) {
    parent = parent.parentElement;
  }
  return parent;
};

const styles = stylex.create({
  editor: {
    // Not transparent: controls such as the table's insert buttons draw their glyph in this color.
    "--mde-bg": tokens.canvas,
    "--mde-fg": tokens.text,
    "--mde-heading": tokens.textStrong,
    "--mde-muted": tokens.textMuted,
    "--mde-border": tokens.border,
    "--mde-accent": tokens.olive,
    "--mde-code-bg": tokens.surfaceMuted,
    "--mde-link": tokens.oliveText,
    "--mde-wikilink": tokens.oliveText,
    "--mde-wikilink-missing": tokens.textSoft,
    // Read by markdownEditor.css, which styles the task checkboxes.
    "--memora-task-border": tokens.borderStrong,
    "--memora-task-surface": tokens.surface,
    "--memora-task-checked": tokens.primaryBackground,
    "--memora-task-check": tokens.primaryText,
    "--mde-font": "var(--font-sans)",
    "--mde-mono": "var(--font-mono)",
    "--mde-font-size": "var(--document-editor-font-size, 16px)",
    "--mde-content-width": "none",
    // Keep the editor's own inline padding (table handles live in it) and pull the editor out by
    // the same amount, so text lines up with the title.
    "--mde-padding-inline": "24px",
    marginInline: "-24px",
    minHeight: "388px",
  },
});

export const WysiwygDocumentEditor = forwardRef<
  WysiwygDocumentEditorHandle,
  WysiwygDocumentEditorProps
>(function WysiwygDocumentEditor(
  {
    text,
    review = null,
    onVisibleLineChange,
    onSelectionTextChange,
    onTextChange,
    onOpenReference,
    wikiLinks,
  },
  ref,
) {
  const editorRef = useRef<MarkdownEditorHandle | null>(null);
  const resolvedTheme = useResolvedTheme();
  const callbacksRef = useRef({ onVisibleLineChange, onSelectionTextChange, review });

  useEffect(() => {
    callbacksRef.current = { onVisibleLineChange, onSelectionTextChange, review };
  }, [onVisibleLineChange, onSelectionTextChange, review]);

  const listener = useMemo(
    () =>
      EditorView.updateListener.of((update) => {
        const { onVisibleLineChange, onSelectionTextChange, review } = callbacksRef.current;
        reportSelectionText(update, onSelectionTextChange);
        reportVisibleLine(update, onVisibleLineChange);
        reportAcceptedChange(update, review);
      }),
    [],
  );

  const isReviewing = review !== null;
  const extensions = useMemo(
    () => (isReviewing ? [listener, markdownDiff({ original: text })] : [listener]),
    // ponytail: the original is read once per review; later accepts update it inside the editor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isReviewing, listener],
  );

  const handleChange = useCallback(
    (markdown: string): void => {
      const currentReview = callbacksRef.current.review;
      if (currentReview) {
        currentReview.onProposalChange(markdown);
        return;
      }
      onTextChange(markdown);
    },
    [onTextChange],
  );

  const scrollToLine = useCallback((lineNumber: number): void => {
    const view = editorRef.current?.view;
    if (!view) {
      return;
    }
    const doc = view.state.doc;
    const line = doc.line(Math.min(Math.max(lineNumber, 1), doc.lines));
    // Scroll the page rather than move the caret, which would show the heading's Markdown.
    // ponytail: lines far off screen have estimated heights, so a long jump can land a bit off.
    const top = view.documentTop + view.lineBlockAt(line.from).top;
    const scroller = findScrollParent(view.dom);
    const scrollerTop = scroller ? scroller.getBoundingClientRect().top : 0;
    (scroller ?? window).scrollBy({
      top: top - scrollerTop - OUTLINE_SCROLL_TOP_MARGIN_PX,
      behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  }, []);

  const handleOpenLink = useCallback(
    (href: string): void => {
      if (EXTERNAL_LINK_PATTERN.test(href)) {
        const url = openableUrl(href);
        if (url) {
          // fallow-ignore-next-line security-sink -- openableUrl allows only http, https and mailto links, opened without an opener.
          window.open(url, "_blank", "noopener,noreferrer");
        }
        return;
      }
      if (!href.startsWith("#")) {
        // Markdown link targets spell spaces as %20; workspace paths use the plain names.
        onOpenReference?.(safeDecodeURIComponent(href));
        return;
      }
      const lineAnchor = parseLineAnchor(href);
      if (lineAnchor?.startLine) {
        scrollToLine(lineAnchor.startLine);
        return;
      }
      const slug = headingSlug(safeDecodeURIComponent(href.slice(1)));
      const heading = parseMarkdownHeadings(editorRef.current?.getValue() ?? "").find(
        (candidate) => headingSlug(candidate.title) === slug,
      );
      if (heading) {
        scrollToLine(heading.line);
      }
    },
    [onOpenReference, scrollToLine],
  );

  useImperativeHandle(ref, () => ({ revealLine: scrollToLine }), [scrollToLine]);

  // New options mean the workspace changed, so links resolved before may have appeared or gone.
  useEffect(() => {
    editorRef.current?.refreshWikiLinks();
  }, [wikiLinks]);

  return (
    <section data-surface="wysiwyg-document-editor" data-testid="wysiwyg-document-editor">
      <MarkdownEditor
        ref={editorRef}
        value={review?.proposedText ?? text}
        onChange={handleChange}
        theme={resolvedTheme}
        placeholder="Start writing..."
        onOpenLink={handleOpenLink}
        wikiLinks={wikiLinks}
        extensions={extensions}
        {...stylex.props(styles.editor)}
      />
    </section>
  );
});
