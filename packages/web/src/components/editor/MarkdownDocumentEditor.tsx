import * as stylex from "@stylexjs/stylex";
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from "react";

import {
  ArrowLeftIcon,
  CaretDownIcon,
  CodeIcon,
  DotsThreeVerticalIcon,
  FloppyDiskIcon,
  ImageIcon,
  PenIcon,
  TableIcon,
} from "@phosphor-icons/react";

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
import { AppMenu, AppMenuContent, AppMenuItem, AppMenuTrigger } from "@/components/menu/AppMenu";
import type { TextDocumentFileLike } from "@/lib/editor/documentPersistence";
import { getFileExtension } from "@/lib/editor/editableTextDocument";
import type { MarkdownSafetyDiagnostic } from "@/lib/editor/markdownRoundTripGuard";

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
      default: "var(--color-memora-text-muted)",
      ":hover": "var(--color-memora-text-strong)",
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
    backgroundColor: "var(--color-memora-surface-muted)",
    borderRadius: "9999px",
    boxShadow: "inset 0 0 0 1px var(--color-memora-border-soft)",
    display: "inline-flex",
    justifySelf: { default: "start", "@media (min-width: 768px)": "center" },
    padding: "0.25rem",
  },
  modeButton: {
    alignItems: "center",
    borderRadius: "9999px",
    color: { default: "var(--color-memora-text-muted)", ":hover": "var(--color-memora-text)" },
    display: "inline-flex",
    fontSize: "0.875rem",
    fontWeight: 500,
    gap: "0.375rem",
    height: "2.25rem",
    lineHeight: "1.25rem",
    paddingInline: "0.75rem",
    transition: "background-color 200ms, color 200ms, box-shadow 200ms",
    ":focus-visible": { outline: "2px solid var(--color-memora-olive-soft)", outlineOffset: 2 },
  },
  modeButtonActive: {
    backgroundColor: "var(--color-memora-canvas)",
    boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
    color: "var(--color-memora-text)",
  },
  icon: { height: "1rem", width: "1rem" },
  headerEnd: {
    alignItems: "center",
    display: "flex",
    justifyContent: "flex-end",
    justifySelf: { default: "auto", "@media (min-width: 768px)": "end" },
  },
  menuTrigger: {
    alignItems: "center",
    backgroundColor: {
      default: "var(--color-memora-surface)",
      ":hover": "var(--color-memora-hover)",
    },
    borderColor: "var(--color-memora-border)",
    borderRadius: "9999px",
    borderStyle: "solid",
    borderWidth: 1,
    display: "flex",
    gap: "0.5rem",
    paddingBlock: "0.375rem",
    paddingInline: "0.625rem",
    "[data-open='true']": {
      backgroundColor: "var(--color-memora-hover)",
      borderColor: "var(--color-memora-border-strong)",
    },
  },
  menuTriggerIconFrame: {
    alignItems: "center",
    backgroundColor: "var(--color-memora-surface-muted)",
    borderRadius: "9999px",
    color: "var(--color-memora-text-muted)",
    display: "flex",
    flexShrink: 0,
    height: "1.75rem",
    justifyContent: "center",
    transition: "background-color 300ms, color 300ms",
    width: "1.75rem",
  },
  menuLargeIcon: { height: "18px", width: "18px" },
  menuTriggerLabel: {
    color: "var(--color-memora-text-strong)",
    fontSize: "0.875rem",
    fontWeight: 600,
    lineHeight: "1.25rem",
  },
  caret: {
    color: "var(--color-memora-text-soft)",
    flexShrink: 0,
    height: "0.875rem",
    width: "0.875rem",
  },
  menuContent: { width: "248px" },
  menuItem: {
    alignItems: "center",
    borderRadius: "1rem",
    color: "var(--color-memora-text)",
    display: "flex",
    fontSize: "0.875rem",
    gap: "0.75rem",
    padding: "0.75rem",
    textAlign: "left",
    transition: "background-color 300ms",
    width: "100%",
    ":hover": { backgroundColor: "var(--color-memora-hover)" },
    ":disabled": { cursor: "not-allowed", opacity: 0.4 },
  },
  menuItemIcon: {
    alignItems: "center",
    backgroundColor: "var(--color-memora-surface-muted)",
    borderRadius: "9999px",
    color: "var(--color-memora-text-muted)",
    display: "flex",
    flexShrink: 0,
    height: "2.25rem",
    justifyContent: "center",
    width: "2.25rem",
  },
  menuItemCopy: { minWidth: 0 },
  menuItemTitle: {
    color: "var(--color-memora-text-strong)",
    display: "block",
    fontSize: "14px",
    fontWeight: 600,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  menuItemDescription: {
    color: "var(--color-memora-text-muted)",
    display: "block",
    fontSize: "13px",
    lineHeight: "1.25rem",
    marginTop: "0.25rem",
  },
  saveStatus: {
    alignItems: "center",
    color: "var(--color-memora-text-soft)",
    display: "flex",
    fontSize: "0.875rem",
    gap: "0.75rem",
    lineHeight: "1.25rem",
  },
  warningText: { color: "var(--color-memora-warning-text)" },
  titleInput: {
    backgroundColor: "transparent",
    color: "var(--color-memora-text-strong)",
    fontSize: "2.25rem",
    fontWeight: 600,
    letterSpacing: "-0.03em",
    lineHeight: "2.5rem",
    marginBottom: "1rem",
    minWidth: 0,
    outline: "none",
    transition: "color 200ms",
    width: "100%",
    "::placeholder": { color: "var(--color-memora-text-soft)" },
    ":focus-visible": { outline: "none" },
  },
  titleError: {
    color: "var(--color-memora-warning-text)",
    fontSize: "0.875rem",
    lineHeight: "1.25rem",
    marginTop: "0.5rem",
  },
  notice: {
    backgroundColor: "var(--color-memora-warning-surface)",
    borderLeftColor: "var(--color-memora-warning-border)",
    borderLeftStyle: "solid",
    borderLeftWidth: 1,
    color: "var(--color-memora-warning-text)",
    fontSize: "0.875rem",
    lineHeight: "1.25rem",
    paddingBlock: "0.75rem",
    paddingInline: "1rem",
  },
  hidden: { display: "none" },
  editorLayout: {
    display: "grid",
    gap: { default: "0.75rem", "@media (min-width: 1024px)": "1.25rem" },
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
  onSave: () => void;
  onRequestSource: () => void;
  onRequestWysiwyg: () => void;
  onAttachImage: (file: File) => Promise<void>;
  onGoBack: () => void;
  saveState: "idle" | "dirty" | "saving" | "error";
  saveError?: string | null;
  referenceNotice?: string | null;
  wysiwygSafetyNotice?: string | null;
  wysiwygSafetyDiagnostics?: readonly MarkdownSafetyDiagnostic[];
  isAttachingImage?: boolean;
  focusedLineStart?: number | null;
  focusedLineEnd?: number | null;
  txtUpgradeDialogOpen: boolean;
  onConfirmTxtUpgrade: () => void;
  onCancelTxtUpgrade: () => void;
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
  onSave,
  onRequestSource,
  onRequestWysiwyg,
  onAttachImage,
  onGoBack,
  saveState,
  saveError,
  referenceNotice,
  wysiwygSafetyNotice,
  wysiwygSafetyDiagnostics = [],
  isAttachingImage = false,
  focusedLineStart = null,
  focusedLineEnd = null,
  txtUpgradeDialogOpen,
  onConfirmTxtUpgrade,
  onCancelTxtUpgrade,
}: MarkdownDocumentEditorProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
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
          <AppMenu>
            <AppMenuTrigger
              className={`memora-interactive ${stylex.props(styles.menuTrigger).className}`}
            >
              <span {...stylex.props(styles.menuTriggerIconFrame)}>
                <DotsThreeVerticalIcon
                  className={stylex.props(styles.menuLargeIcon).className}
                  weight="bold"
                />
              </span>
              <span {...stylex.props(styles.menuTriggerLabel)}>Actions</span>
              <CaretDownIcon
                data-dashboard-menu-caret=""
                className={stylex.props(styles.caret).className}
                weight="bold"
              />
            </AppMenuTrigger>
            <AppMenuContent className={stylex.props(styles.menuContent).className}>
              <AppMenuItem
                disabled={saveState === "saving" || isAttachingImage}
                className={stylex.props(styles.menuItem).className}
                onMouseDown={(event) => event.preventDefault()}
                onClick={onSave}
              >
                <span {...stylex.props(styles.menuItemIcon)}>
                  <FloppyDiskIcon className={stylex.props(styles.menuLargeIcon).className} />
                </span>
                <span {...stylex.props(styles.menuItemCopy)}>
                  <span {...stylex.props(styles.menuItemTitle)}>Save</span>
                  <span {...stylex.props(styles.menuItemDescription)}>
                    {getSaveStatusLabel(saveState)}
                  </span>
                </span>
              </AppMenuItem>
              <AppMenuItem
                disabled={isAttachingImage}
                className={stylex.props(styles.menuItem).className}
                onClick={() => fileInputRef.current?.click()}
              >
                <span {...stylex.props(styles.menuItemIcon)}>
                  <ImageIcon className={stylex.props(styles.menuLargeIcon).className} />
                </span>
                <span {...stylex.props(styles.menuItemCopy)}>
                  <span {...stylex.props(styles.menuItemTitle)}>
                    {isAttachingImage ? "Attaching image..." : "Attach image"}
                  </span>
                  <span {...stylex.props(styles.menuItemDescription)}>
                    Store images beside the current note
                  </span>
                </span>
              </AppMenuItem>
              <AppMenuItem
                disabled={isSourceMode}
                className={stylex.props(styles.menuItem).className}
                onClick={() => wysiwygRef.current?.insertTable()}
              >
                <span {...stylex.props(styles.menuItemIcon)}>
                  <TableIcon className={stylex.props(styles.menuLargeIcon).className} />
                </span>
                <span {...stylex.props(styles.menuItemCopy)}>
                  <span {...stylex.props(styles.menuItemTitle)}>Insert table</span>
                  <span {...stylex.props(styles.menuItemDescription)}>
                    Available in preview mode only
                  </span>
                </span>
              </AppMenuItem>
            </AppMenuContent>
          </AppMenu>
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

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className={stylex.props(styles.hidden).className}
        onChange={(event) => {
          const image = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (!image) {
            return;
          }

          void onAttachImage(image);
        }}
      />

      <div {...stylex.props(styles.editorLayout)}>
        <div {...stylex.props(styles.editor)}>
          {isSourceMode ? (
            <SourceDocumentEditor
              ref={sourceRef}
              text={text}
              onTextChange={onTextChange}
              onVisibleLineChange={setActiveHeadingFromLine}
              focusedLineStart={focusedLineStart}
              focusedLineEnd={focusedLineEnd}
              diagnostics={wysiwygSafetyDiagnostics}
            />
          ) : (
            <WysiwygDocumentEditor
              ref={wysiwygRef}
              text={text}
              onActiveHeadingChange={handleActiveHeadingChange}
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
