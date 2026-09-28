import * as stylex from "@stylexjs/stylex";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentRef,
  type ReactNode,
} from "react";

import { ArrowLeftIcon, ChatCircleIcon, CodeIcon, PenIcon } from "@phosphor-icons/react";

import { SourceDocumentEditor } from "@/components/editor/SourceDocumentEditor";
import {
  DocumentOutlineIndicator,
  parseMarkdownHeadings,
  type MarkdownHeading,
} from "@/components/editor/DocumentOutlineIndicator";
import { TxtToMarkdownConfirmDialog } from "@/components/editor/TxtToMarkdownConfirmDialog";
import {
  WysiwygDocumentEditor,
  type WysiwygDocumentEditorHandle,
} from "@/components/editor/WysiwygDocumentEditor";
import type { TextDocumentFileLike } from "@/lib/editor/documentPersistence";
import { getFileExtension } from "@/lib/editor/editableTextDocument";
import type { MarkdownSafetyDiagnostic } from "@/lib/editor/markdownRoundTripGuard";
import { tokens } from "../../styles/stylex.stylex";

type EditorMode = "source" | "wysiwyg";

const styles = stylex.create({
  root: { display: "flex", flexDirection: "column", gap: "1.5rem" },
  header: {
    display: "grid",
    gap: "1rem",
    gridTemplateColumns: {
      default: "minmax(0, 1fr)",
      "@media (min-width: 768px)": "minmax(0, 1fr) auto minmax(0, 1fr)",
    },
    alignItems: { default: "stretch", "@media (min-width: 768px)": "center" },
  },
  headerStart: {
    alignItems: "center",
    display: "flex",
    justifySelf: { default: "auto", "@media (min-width: 768px)": "start" },
  },
  backButton: {
    alignItems: "center",
    color: {
      default: tokens.textMuted,
      ":hover": tokens.textStrong,
    },
    display: "inline-flex",
    fontSize: "0.875rem",
    fontWeight: 500,
    gap: "0.5rem",
    lineHeight: "1.25rem",
    paddingBlock: "0.25rem",
    paddingInline: 0,
    transition: "color 200ms",
  },
  backIcon: { height: "1.125rem", width: "1.125rem" },
  modeSwitch: {
    backgroundColor: tokens.surfaceMuted,
    borderRadius: "9999px",
    boxShadow: `inset 0 0 0 1px ${tokens.borderSoft}`,
    display: "inline-flex",
    justifySelf: { default: "start", "@media (min-width: 768px)": "center" },
    padding: "0.25rem",
  },
  modeButton: {
    alignItems: "center",
    borderRadius: "9999px",
    color: { default: tokens.textMuted, ":hover": tokens.text },
    display: "inline-flex",
    fontSize: "0.875rem",
    fontWeight: 500,
    gap: "0.375rem",
    height: "2.25rem",
    lineHeight: "1.25rem",
    paddingInline: "0.75rem",
    transition: "background-color 200ms, color 200ms, box-shadow 200ms",
    ":focus-visible": { outline: `2px solid ${tokens.oliveSoft}`, outlineOffset: 2 },
  },
  modeButtonActive: {
    backgroundColor: tokens.canvas,
    boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
    color: tokens.text,
  },
  icon: { height: "1rem", width: "1rem" },
  headerEnd: {
    alignItems: "center",
    display: "flex",
    gap: "0.5rem",
    justifyContent: "flex-end",
    justifySelf: { default: "auto", "@media (min-width: 768px)": "end" },
  },
  menuTrigger: {
    alignItems: "center",
    backgroundColor: {
      default: tokens.surface,
      ":hover": tokens.hover,
    },
    borderColor: tokens.border,
    borderRadius: "9999px",
    borderStyle: "solid",
    borderWidth: 1,
    display: "flex",
    gap: "0.5rem",
    paddingBlock: "0.375rem",
    paddingInline: "0.625rem",
    "[data-open='true']": {
      backgroundColor: tokens.hover,
      borderColor: tokens.borderStrong,
    },
  },
  chatToggleActive: {
    backgroundColor: tokens.hover,
    borderColor: tokens.borderStrong,
  },
  menuTriggerIconFrame: {
    alignItems: "center",
    backgroundColor: tokens.surfaceMuted,
    borderRadius: "9999px",
    color: tokens.textMuted,
    display: "flex",
    flexShrink: 0,
    height: "1.75rem",
    justifyContent: "center",
    transition: "background-color 300ms, color 300ms",
    width: "1.75rem",
  },
  menuLargeIcon: { height: "18px", width: "18px" },
  menuTriggerLabel: {
    color: tokens.textStrong,
    fontSize: "0.875rem",
    fontWeight: 600,
    lineHeight: "1.25rem",
  },
  saveStatus: {
    alignItems: "center",
    color: tokens.textSoft,
    display: "flex",
    fontSize: "0.875rem",
    gap: "0.75rem",
    lineHeight: "1.25rem",
  },
  warningText: { color: tokens.warningText },
  titleInput: {
    backgroundColor: "transparent",
    color: tokens.textStrong,
    fontSize: "2.25rem",
    fontWeight: 600,
    letterSpacing: "-0.03em",
    lineHeight: "2.5rem",
    marginBottom: "1rem",
    minWidth: 0,
    outline: "none",
    transition: "color 200ms",
    width: "100%",
    "::placeholder": { color: tokens.textSoft },
    ":focus-visible": { outline: "none" },
  },
  titleError: {
    color: tokens.warningText,
    fontSize: "0.875rem",
    lineHeight: "1.25rem",
    marginTop: "0.5rem",
  },
  notice: {
    backgroundColor: tokens.warningSurface,
    borderLeftColor: tokens.warningBorder,
    borderLeftStyle: "solid",
    borderLeftWidth: 1,
    color: tokens.warningText,
    fontSize: "0.875rem",
    lineHeight: "1.25rem",
    paddingBlock: "0.75rem",
    paddingInline: "1rem",
  },
  editorLayout: {
    display: "grid",
    gap: "0.75rem",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    minWidth: 0,
  },
  editor: { minWidth: 0 },
});

interface MarkdownDocumentEditorProps {
  file: TextDocumentFileLike;
  text: string;
  editorMode: EditorMode;
  onTextChange: (text: string) => void;
  onTitleChange: (name: string) => Promise<void>;
  onRequestSource: () => void;
  onRequestWysiwyg: () => void;
  onGoBack: () => void;
  saveState: "idle" | "dirty" | "saving" | "error";
  saveError?: string | null;
  referenceNotice?: string | null;
  wysiwygSafetyNotice?: string | null;
  wysiwygSafetyDiagnostics?: readonly MarkdownSafetyDiagnostic[];
  focusedLineStart?: number | null;
  focusedLineEnd?: number | null;
  txtUpgradeDialogOpen: boolean;
  onConfirmTxtUpgrade: () => void;
  onCancelTxtUpgrade: () => void;
  isChatOpen?: boolean;
  onToggleChat?: () => void;
  // Shown in place of the editor while chat suggestions wait for review.
  changeReview?: ReactNode;
  onSelectionTextChange?: (text: string | null) => void;
}

const getSaveStatusLabel = (saveState: MarkdownDocumentEditorProps["saveState"]): string => {
  switch (saveState) {
    case "dirty":
      return "Unsaved changes";
    case "saving":
      return "Saving...";
    case "error":
      return "Save failed";
    default:
      return "Saved";
  }
};

const getDocumentTitleParts = (name: string): { title: string; extension: string } => {
  const extension = getFileExtension(name);
  return {
    title: extension ? name.slice(0, -extension.length) : name,
    extension,
  };
};

export function MarkdownDocumentEditor({
  file,
  text,
  editorMode,
  onTextChange,
  onTitleChange,
  onRequestSource,
  onRequestWysiwyg,
  onGoBack,
  saveState,
  saveError,
  referenceNotice,
  wysiwygSafetyNotice,
  wysiwygSafetyDiagnostics = [],
  focusedLineStart = null,
  focusedLineEnd = null,
  txtUpgradeDialogOpen,
  onConfirmTxtUpgrade,
  onCancelTxtUpgrade,
  isChatOpen = false,
  onToggleChat,
  changeReview = null,
  onSelectionTextChange,
}: MarkdownDocumentEditorProps) {
  const sourceRef = useRef<ComponentRef<typeof SourceDocumentEditor> | null>(null);
  const wysiwygRef = useRef<WysiwygDocumentEditorHandle | null>(null);
  const isSourceMode = editorMode === "source";
  const titleParts = getDocumentTitleParts(file.name);
  const [titleValue, setTitleValue] = useState(titleParts.title);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [activeHeadingIndex, setActiveHeadingIndex] = useState<number | null>(null);
  const headings = useMemo(() => parseMarkdownHeadings(text), [text]);
  const activeHeadingId =
    activeHeadingIndex === null ? null : (headings[activeHeadingIndex]?.id ?? null);

  useEffect(() => {
    setTitleValue(titleParts.title);
    setTitleError(null);
  }, [titleParts.title]);

  useEffect(() => {
    setActiveHeadingIndex((currentHeadingIndex) => {
      if (currentHeadingIndex !== null && headings[currentHeadingIndex]) {
        return currentHeadingIndex;
      }
      return headings[0]?.index ?? null;
    });
  }, [headings]);

  const handleOutlineNavigate = useCallback(
    (heading: MarkdownHeading): void => {
      setActiveHeadingIndex(heading.index);
      if (isSourceMode) {
        sourceRef.current?.revealLine(heading.line);
        return;
      }
      wysiwygRef.current?.revealHeading(heading.index);
    },
    [isSourceMode],
  );

  const setActiveHeadingFromLine = useCallback(
    (lineNumber: number): void => {
      let nextHeadingIndex: number | null = null;
      for (const heading of headings) {
        if (heading.line > lineNumber) {
          break;
        }
        nextHeadingIndex = heading.index;
      }
      setActiveHeadingIndex((currentHeadingIndex) => {
        return currentHeadingIndex === nextHeadingIndex ? currentHeadingIndex : nextHeadingIndex;
      });
    },
    [headings],
  );

  const handleActiveHeadingChange = useCallback((headingIndex: number): void => {
    setActiveHeadingIndex((currentHeadingIndex) => {
      return currentHeadingIndex === headingIndex ? currentHeadingIndex : headingIndex;
    });
  }, []);

  const commitTitle = async () => {
    const nextTitle = titleValue.trim();
    if (!nextTitle) {
      setTitleValue(titleParts.title);
      setTitleError(null);
      return;
    }

    const nextName = `${nextTitle}${titleParts.extension}`;
    if (nextName === file.name) {
      setTitleValue(titleParts.title);
      setTitleError(null);
      return;
    }

    try {
      await onTitleChange(nextName);
      setTitleError(null);
    } catch (error) {
      setTitleError(error instanceof Error ? error.message : "Unable to rename document.");
      setTitleValue(titleParts.title);
    }
  };

  return (
    <div {...stylex.props(styles.root)} data-mode={editorMode}>
      <header {...stylex.props(styles.header)}>
        <div {...stylex.props(styles.headerStart)}>
          <button
            type="button"
            className={`memora-interactive ${stylex.props(styles.backButton).className}`}
            onClick={onGoBack}
          >
            <ArrowLeftIcon
              size={18}
              weight="bold"
              className={stylex.props(styles.backIcon).className}
            />
            <span>Go back</span>
          </button>
        </div>

        <div {...stylex.props(styles.modeSwitch)}>
          <button
            type="button"
            aria-pressed={isSourceMode}
            className={
              stylex.props(styles.modeButton, isSourceMode && styles.modeButtonActive).className
            }
            onClick={onRequestSource}
          >
            <CodeIcon className={stylex.props(styles.icon).className} weight="bold" />
            <span>Code</span>
          </button>
          <button
            type="button"
            aria-pressed={!isSourceMode}
            className={
              stylex.props(styles.modeButton, !isSourceMode && styles.modeButtonActive).className
            }
            onClick={onRequestWysiwyg}
          >
            <PenIcon className={stylex.props(styles.icon).className} weight="bold" />
            <span>Preview</span>
          </button>
        </div>

        <div {...stylex.props(styles.headerEnd)}>
          {onToggleChat ? (
            <button
              type="button"
              aria-pressed={isChatOpen}
              title={isChatOpen ? "Close chat" : "Chat about this note"}
              className={`memora-interactive ${
                stylex.props(styles.menuTrigger, isChatOpen && styles.chatToggleActive).className
              }`}
              onClick={onToggleChat}
            >
              <span {...stylex.props(styles.menuTriggerIconFrame)}>
                <ChatCircleIcon
                  className={stylex.props(styles.menuLargeIcon).className}
                  weight="bold"
                />
              </span>
              <span {...stylex.props(styles.menuTriggerLabel)}>Chat</span>
            </button>
          ) : null}
        </div>
      </header>

      <div {...stylex.props(styles.saveStatus)}>
        <span>{getSaveStatusLabel(saveState)}</span>
        {saveError ? <span {...stylex.props(styles.warningText)}>{saveError}</span> : null}
      </div>

      <div>
        <input
          type="text"
          aria-label="Document title"
          value={titleValue}
          className={stylex.props(styles.titleInput).className}
          placeholder="Untitled note"
          onChange={(event) => {
            setTitleValue(event.currentTarget.value);
            setTitleError(null);
          }}
          onBlur={() => {
            void commitTitle();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.blur();
            }
            if (event.key === "Escape") {
              event.preventDefault();
              setTitleValue(titleParts.title);
              setTitleError(null);
              event.currentTarget.blur();
            }
          }}
        />
        {titleError ? <p {...stylex.props(styles.titleError)}>{titleError}</p> : null}
      </div>

      {referenceNotice ? <div {...stylex.props(styles.notice)}>{referenceNotice}</div> : null}

      {wysiwygSafetyNotice ? (
        <div
          role="status"
          aria-live="polite"
          className={stylex.props(styles.notice).className}
          data-testid="wysiwyg-safety-notice"
        >
          {wysiwygSafetyNotice}
        </div>
      ) : null}

      <div {...stylex.props(styles.editorLayout)}>
        <div {...stylex.props(styles.editor)}>
          {changeReview ? (
            changeReview
          ) : isSourceMode ? (
            <SourceDocumentEditor
              ref={sourceRef}
              text={text}
              onTextChange={onTextChange}
              onVisibleLineChange={setActiveHeadingFromLine}
              onSelectionTextChange={onSelectionTextChange}
              focusedLineStart={focusedLineStart}
              focusedLineEnd={focusedLineEnd}
              diagnostics={wysiwygSafetyDiagnostics}
            />
          ) : (
            <WysiwygDocumentEditor
              ref={wysiwygRef}
              text={text}
              onActiveHeadingChange={handleActiveHeadingChange}
              onSelectionTextChange={onSelectionTextChange}
              onTextChange={onTextChange}
            />
          )}
        </div>
        <DocumentOutlineIndicator
          activeHeadingId={activeHeadingId}
          headings={headings}
          onNavigate={handleOutlineNavigate}
        />
      </div>

      <TxtToMarkdownConfirmDialog
        fileName={file.name}
        isOpen={txtUpgradeDialogOpen}
        onConfirm={onConfirmTxtUpgrade}
        onCancel={onCancelTxtUpgrade}
      />
    </div>
  );
}
