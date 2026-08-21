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

const editorModeButtonClassName = (isActive: boolean): string =>
  [
    "inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-memora-olive-soft)]",
    isActive
      ? "bg-[var(--color-memora-canvas)] text-[var(--color-memora-text)] shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
      : "text-[var(--color-memora-text-muted)] hover:text-[var(--color-memora-text)]",
  ].join(" ");

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
    <div className="flex flex-col gap-6" data-mode={editorMode}>
      <header className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-center">
        <div className="flex items-center md:justify-self-start">
          <button
            type="button"
            className="memora-interactive group inline-flex items-center gap-2 px-0 py-1 text-sm font-medium text-[var(--color-memora-text-muted)] transition-colors hover:text-[var(--color-memora-text-strong)]"
            onClick={onGoBack}
          >
            <ArrowLeftIcon
              size={18}
              weight="bold"
              className="transition-transform duration-200 ease-[var(--ease-out-quart)] group-hover:-translate-x-0.5"
            />
            <span>Go back</span>
          </button>
        </div>

        <div className="inline-flex justify-self-start rounded-full bg-[var(--color-memora-surface-muted)] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] md:justify-self-center">
          <button
            type="button"
            aria-pressed={isSourceMode}
            className={editorModeButtonClassName(isSourceMode)}
            onClick={onRequestSource}
          >
            <CodeIcon className="size-4" weight="bold" />
            <span>Code</span>
          </button>
          <button
            type="button"
            aria-pressed={!isSourceMode}
            className={editorModeButtonClassName(!isSourceMode)}
            onClick={onRequestWysiwyg}
          >
            <PenIcon className="size-4" weight="bold" />
            <span>Preview</span>
          </button>
        </div>

        <div className="flex items-center justify-end md:justify-self-end">
          <AppMenu>
            <AppMenuTrigger className="memora-interactive group gap-2 rounded-full border border-[#e7e1d8] bg-[#fffdfa] px-2.5 py-1.5 shadow-none hover:bg-[#fffcf6] hover:shadow-none data-[open=true]:border-[#ddd7cb] data-[open=true]:bg-[#fffcf6] data-[open=true]:shadow-none">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#f6f3ec] text-[#7c7265] transition-[background-color,color] duration-300 ease-[var(--ease-out-quart)] group-hover:bg-[#efe8db] group-hover:text-[#6f695f]">
                <DotsThreeVerticalIcon className="size-[18px]" weight="bold" />
              </span>
              <span className="text-sm font-semibold text-[#22211d]">Actions</span>
              <CaretDownIcon
                data-dashboard-menu-caret=""
                className="size-3.5 shrink-0 text-[#9a948a]"
                weight="bold"
              />
            </AppMenuTrigger>
            <AppMenuContent className="w-[248px]">
              <AppMenuItem
                disabled={saveState === "saving" || isAttachingImage}
                className="group flex w-full items-center gap-3 rounded-[1rem] px-3 py-3 text-left text-sm text-[#544f48] transition-[background-color] duration-300 ease-[var(--ease-out-quart)] hover:bg-[#f8f4ec] disabled:cursor-not-allowed disabled:opacity-40"
                onMouseDown={(event) => event.preventDefault()}
                onClick={onSave}
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#f6f1e8] text-[#90897d] transition-[background-color,color] duration-300 ease-[var(--ease-out-quart)] group-hover:bg-[#efe8db] group-hover:text-[#7d7569]">
                  <FloppyDiskIcon className="size-[18px]" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-semibold text-[#2b2925]">
                    Save
                  </span>
                  <span className="mt-1 block text-[13px] leading-5 text-[#7b7469]">
                    {getSaveStatusLabel(saveState)}
                  </span>
                </span>
              </AppMenuItem>
              <AppMenuItem
                disabled={isAttachingImage}
                className="group flex w-full items-center gap-3 rounded-[1rem] px-3 py-3 text-left text-sm text-[#544f48] transition-[background-color] duration-300 ease-[var(--ease-out-quart)] hover:bg-[#f8f4ec] disabled:cursor-not-allowed disabled:opacity-40"
                onClick={() => fileInputRef.current?.click()}
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#f6f1e8] text-[#90897d] transition-[background-color,color] duration-300 ease-[var(--ease-out-quart)] group-hover:bg-[#efe8db] group-hover:text-[#7d7569]">
                  <ImageIcon className="size-[18px]" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-semibold text-[#2b2925]">
                    {isAttachingImage ? "Attaching image..." : "Attach image"}
                  </span>
                  <span className="mt-1 block text-[13px] leading-5 text-[#7b7469]">
                    Store images beside the current note
                  </span>
                </span>
              </AppMenuItem>
              <AppMenuItem
                disabled={isSourceMode}
                className="group flex w-full items-center gap-3 rounded-[1rem] px-3 py-3 text-left text-sm text-[#544f48] transition-[background-color] duration-300 ease-[var(--ease-out-quart)] hover:bg-[#f8f4ec] disabled:cursor-not-allowed disabled:opacity-40"
                onClick={() => wysiwygRef.current?.insertTable()}
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#f6f1e8] text-[#90897d] transition-[background-color,color] duration-300 ease-[var(--ease-out-quart)] group-hover:bg-[#efe8db] group-hover:text-[#7d7569]">
                  <TableIcon className="size-[18px]" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-semibold text-[#2b2925]">
                    Insert table
                  </span>
                  <span className="mt-1 block text-[13px] leading-5 text-[#7b7469]">
                    Available in preview mode only
                  </span>
                </span>
              </AppMenuItem>
            </AppMenuContent>
          </AppMenu>
        </div>
      </header>

      <div className="flex items-center gap-3 text-sm text-[var(--color-memora-text-soft)]">
        <span>{getSaveStatusLabel(saveState)}</span>
        {saveError ? (
          <span className="text-[var(--color-memora-warning-text)]">{saveError}</span>
        ) : null}
      </div>

      <div>
        <input
          type="text"
          aria-label="Document title"
          value={titleValue}
          className="mb-4 min-w-0 w-full bg-transparent text-4xl font-semibold tracking-[-0.03em] text-zinc-950 outline-none transition placeholder:text-[var(--color-memora-text-soft)] focus-visible:ring-0"
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
        {titleError ? (
          <p className="mt-2 text-sm text-[var(--color-memora-warning-text)]">{titleError}</p>
        ) : null}
      </div>

      {referenceNotice ? (
        <div className="border-l border-[var(--color-memora-warning-border)] bg-[var(--color-memora-warning-surface)] px-4 py-3 text-sm text-[var(--color-memora-warning-text)]">
          {referenceNotice}
        </div>
      ) : null}

      {wysiwygSafetyNotice ? (
        <div
          role="status"
          aria-live="polite"
          className="border-l border-[var(--color-memora-warning-border)] bg-[var(--color-memora-warning-surface)] px-4 py-3 text-sm text-[var(--color-memora-warning-text)]"
          data-testid="wysiwyg-safety-notice"
        >
          {wysiwygSafetyNotice}
        </div>
      ) : null}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const image = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (!image) {
            return;
          }

          void onAttachImage(image);
        }}
      />

      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-3 lg:gap-5">
        <div className="min-w-0">
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
