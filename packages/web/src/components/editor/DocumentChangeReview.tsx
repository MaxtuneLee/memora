import { useMemo, type ReactNode } from "react";
import * as stylex from "@stylexjs/stylex";
import { CheckIcon, XIcon } from "@phosphor-icons/react";

import {
  computeDiffHunks,
  computeWordSegments,
  type DiffHunk,
  type DiffSegment,
} from "@/lib/editor/textDiff";
import { tokens } from "../../styles/stylex.stylex";

// When unchanged text is less than this share of the shorter side, a change reads better as all
// removed, then all added.
const MIN_INLINE_EQUAL_RATIO = 0.4;

const styles = stylex.create({
  root: { display: "flex", flexDirection: "column", gap: 16, minWidth: 0 },
  bar: {
    alignItems: "center",
    backgroundColor: tokens.canvas,
    borderBottomColor: tokens.borderSoft,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    paddingBlock: 8,
    position: "sticky",
    top: 0,
    zIndex: 5,
  },
  barText: { color: tokens.textMuted, flex: 1, fontSize: "0.875rem" },
  barButton: {
    alignItems: "center",
    borderRadius: 8,
    display: "inline-flex",
    fontSize: "0.8125rem",
    fontWeight: 500,
    gap: 4,
    paddingBlock: 5,
    paddingInline: 10,
    ":focus-visible": { outline: `2px solid ${tokens.focusRing}`, outlineOffset: 1 },
  },
  acceptAll: {
    backgroundColor: tokens.primaryBackground,
    color: tokens.primaryText,
    opacity: { default: 1, ":hover": 0.9 },
  },
  rejectAll: {
    backgroundColor: { default: "transparent", ":hover": tokens.hover },
    color: tokens.text,
  },
  document: {
    color: tokens.text,
    fontSize: "var(--document-editor-font-size, 16px)",
    lineHeight: "1.75rem",
    overflowWrap: "anywhere",
    whiteSpace: "pre-wrap",
  },
  deleted: {
    backgroundColor: tokens.dangerSurface,
    color: tokens.dangerText,
    textDecorationColor: tokens.dangerText,
    textDecorationLine: "line-through",
  },
  inserted: {
    backgroundColor: tokens.successSurface,
    color: tokens.successText,
    textDecorationLine: "none",
  },
  actions: {
    display: "inline-flex",
    gap: 2,
    marginInlineStart: 6,
    verticalAlign: "middle",
    whiteSpace: "nowrap",
  },
  actionButton: {
    alignItems: "center",
    borderColor: tokens.border,
    borderRadius: 6,
    borderStyle: "solid",
    borderWidth: 1,
    display: "inline-flex",
    height: 22,
    justifyContent: "center",
    width: 22,
    ":focus-visible": { outline: `2px solid ${tokens.focusRing}`, outlineOffset: 1 },
  },
  acceptButton: {
    backgroundColor: { default: tokens.surface, ":hover": tokens.successSurface },
    color: { default: tokens.textMuted, ":hover": tokens.successText },
  },
  rejectButton: {
    backgroundColor: { default: tokens.surface, ":hover": tokens.dangerSurface },
    color: { default: tokens.textMuted, ":hover": tokens.dangerText },
  },
});

interface DocumentChangeReviewProps {
  baseText: string;
  proposedText: string;
  onAcceptHunk: (hunk: DiffHunk) => void;
  onRejectHunk: (hunk: DiffHunk) => void;
  onAcceptAll: () => void;
  onRejectAll: () => void;
}

const renderSegments = (segments: readonly DiffSegment[]): ReactNode[] => {
  return segments.map((segment, index) => {
    if (segment.type === "delete") {
      return (
        <del key={index} {...stylex.props(styles.deleted)}>
          {segment.text}
        </del>
      );
    }
    if (segment.type === "insert") {
      return (
        <ins key={index} {...stylex.props(styles.inserted)}>
          {segment.text}
        </ins>
      );
    }
    return <span key={index}>{segment.text}</span>;
  });
};

const trimFinalLineBreak = (text: string): string => {
  return text.endsWith("\n") ? text.slice(0, -1) : text;
};

// One change marked in place: removed text struck through, added text highlighted, and the
// accept and reject buttons at the end of the change, before its line break.
export function InlineChange({
  index,
  removed: removedLines,
  added: addedLines,
  onAccept,
  onReject,
}: {
  index: number;
  removed: string;
  added: string;
  onAccept: () => void;
  onReject: () => void;
}) {
  const removed = trimFinalLineBreak(removedLines);
  const added = trimFinalLineBreak(addedLines);
  const lineBreak = removedLines.endsWith("\n") || addedLines.endsWith("\n") ? "\n" : "";
  const segments = useMemo(() => computeWordSegments(removed, added), [removed, added]);
  const equalLength = segments
    .filter((segment) => segment.type === "equal")
    .reduce((length, segment) => length + segment.text.length, 0);
  const isMostlyRewritten =
    removed !== "" &&
    added !== "" &&
    equalLength / Math.max(Math.min(removed.length, added.length), 1) < MIN_INLINE_EQUAL_RATIO;

  return (
    <span data-testid="document-change">
      {isMostlyRewritten ? (
        <>
          <del {...stylex.props(styles.deleted)}>{removed}</del>
          <ins {...stylex.props(styles.inserted)}>{added}</ins>
        </>
      ) : (
        renderSegments(segments)
      )}
      <span {...stylex.props(styles.actions)}>
        <button
          type="button"
          aria-label={`Accept change ${index + 1}`}
          title="Accept"
          onClick={onAccept}
          {...stylex.props(styles.actionButton, styles.acceptButton)}
        >
          <CheckIcon size={13} weight="bold" />
        </button>
        <button
          type="button"
          aria-label={`Reject change ${index + 1}`}
          title="Reject"
          onClick={onReject}
          {...stylex.props(styles.actionButton, styles.rejectButton)}
        >
          <XIcon size={13} weight="bold" />
        </button>
      </span>
      {lineBreak}
    </span>
  );
}

export function DocumentChangeReview({
  baseText,
  proposedText,
  onAcceptHunk,
  onRejectHunk,
  onAcceptAll,
  onRejectAll,
}: DocumentChangeReviewProps) {
  const hunks = useMemo(() => computeDiffHunks(baseText, proposedText), [baseText, proposedText]);

  const parts: ReactNode[] = [];
  let baseOffset = 0;
  hunks.forEach((hunk, index) => {
    parts.push(
      <span key={`text-${baseOffset}`}>{baseText.slice(baseOffset, hunk.baseFrom)}</span>,
      <InlineChange
        key={`change-${hunk.baseFrom}-${hunk.proposedFrom}`}
        index={index}
        removed={baseText.slice(hunk.baseFrom, hunk.baseTo)}
        added={proposedText.slice(hunk.proposedFrom, hunk.proposedTo)}
        onAccept={() => onAcceptHunk(hunk)}
        onReject={() => onRejectHunk(hunk)}
      />,
    );
    baseOffset = hunk.baseTo;
  });
  parts.push(<span key={`text-${baseOffset}`}>{baseText.slice(baseOffset)}</span>);

  return (
    <section
      aria-label="Suggested changes"
      {...stylex.props(styles.root)}
      data-testid="document-change-review"
    >
      <div {...stylex.props(styles.bar)} role="status">
        <span {...stylex.props(styles.barText)}>
          Chat suggested {hunks.length} {hunks.length === 1 ? "change" : "changes"}
        </span>
        <button
          type="button"
          onClick={onRejectAll}
          {...stylex.props(styles.barButton, styles.rejectAll)}
        >
          Reject all
        </button>
        <button
          type="button"
          onClick={onAcceptAll}
          {...stylex.props(styles.barButton, styles.acceptAll)}
        >
          Accept all
        </button>
      </div>
      <div {...stylex.props(styles.document)}>{parts}</div>
    </section>
  );
}
