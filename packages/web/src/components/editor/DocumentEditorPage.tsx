import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import * as stylex from "@stylexjs/stylex";
import { useLocation, useNavigate, useParams } from "react-router";
import { useAppStore } from "@/livestore/store";

import { MarkdownDocumentEditor } from "@/components/editor/MarkdownDocumentEditor";
import { useDocumentEditorFile } from "@/hooks/editor/useDocumentEditorFile";
import {
  type FileUpdatedEventInput,
  type TextDocumentFileLike,
} from "@/lib/editor/documentPersistence";
import {
  preflightMarkdownForWysiwyg,
  type MarkdownPreflightResult,
  type MarkdownSafetyDiagnostic,
} from "@/lib/editor/markdownRoundTripGuard";
import {
  type FileCreatedEventInput as AttachmentFileCreatedEventInput,
  type FolderCreatedEventInput,
} from "@/lib/editor/imageAttachments";
import { isEditableTextDocument } from "@/lib/editor/editableTextDocument";
import { resolveRelativeWorkspacePath, type WorkspaceFolderLike } from "@/lib/editor/logicalPaths";
import { parseLineAnchor, parseReferenceLink } from "@/lib/editor/referenceLinks";
import { desktopFilesQuery$, desktopFoldersQuery$ } from "@/lib/desktop/queries";
import { useDocumentEditorSettings } from "@/hooks/settings/useDocumentEditorSettings";
import { folderEvents } from "@/livestore/folder";
import { fileEvents, type file as LiveStoreFile } from "@/livestore/file";

const styles = stylex.create({
  missingPage: {
    alignItems: "center",
    display: "flex",
    justifyContent: "center",
    marginInline: "auto",
    maxWidth: "48rem",
    minHeight: "100vh",
    paddingBlock: "4rem",
    paddingInline: "1.5rem",
    width: "100%",
  },
  missingCard: {
    backgroundColor: "white",
    borderColor: "#e4e4e7",
    borderRadius: "1.5rem",
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
    padding: "2rem",
    textAlign: "center",
  },
  missingTitle: {
    color: "#09090b",
    fontSize: "1.5rem",
    fontWeight: 600,
    lineHeight: "2rem",
  },
  missingDescription: {
    color: "#71717a",
    fontSize: "0.875rem",
    lineHeight: "1.25rem",
    marginTop: "0.5rem",
  },
  backButton: {
    backgroundColor: {
      default: "transparent",
      ":hover": "#fafafa",
    },
    borderColor: "#e4e4e7",
    borderRadius: "0.5rem",
    borderStyle: "solid",
    borderWidth: 1,
    color: "#3f3f46",
    fontSize: "0.875rem",
    lineHeight: "1.25rem",
    marginTop: "1rem",
    paddingBlock: "0.5rem",
    paddingInline: "1rem",
    transitionDuration: "150ms",
    transitionProperty: "background-color",
  },
  page: {
    backgroundColor: "var(--color-memora-canvas)",
    color: "var(--color-memora-text)",
    minHeight: "100vh",
    paddingBlock: "1rem",
    paddingInline: "1.25rem",
    "@media (min-width: 640px)": {
      paddingInline: "2rem",
    },
    "@media (min-width: 1024px)": {
      paddingInline: "3rem",
    },
  },
  session: {
    display: "flex",
    flexDirection: "column",
    marginInline: "auto",
    maxWidth: "58rem",
    width: "100%",
  },
  loading: {
    color: "var(--color-memora-text-soft)",
    fontSize: "0.875rem",
    lineHeight: "1.25rem",
    paddingBlock: "2.5rem",
    paddingInline: "0.25rem",
  },
  loadError: {
    borderLeftColor: "var(--color-memora-warning-border)",
    borderLeftStyle: "solid",
    borderLeftWidth: 1,
    paddingBlock: "1rem",
    paddingInline: "1.25rem",
  },
  loadErrorTitle: {
    color: "var(--color-memora-text-strong)",
    fontSize: "1.125rem",
    fontWeight: 600,
    lineHeight: "1.75rem",
  },
  loadErrorDescription: {
    color: "var(--color-memora-text-muted)",
    fontSize: "0.875rem",
    lineHeight: "1.25rem",
    marginTop: "0.5rem",
  },
  errorActions: {
    display: "flex",
    gap: "0.5rem",
    marginTop: "1rem",
  },
  errorButton: {
    borderRadius: "0.375rem",
    fontSize: "0.875rem",
    lineHeight: "1.25rem",
    paddingBlock: "0.375rem",
    paddingInline: "0.75rem",
    transitionDuration: "150ms",
  },
  retryButton: {
    backgroundColor: "var(--color-memora-text)",
    color: "var(--color-memora-canvas)",
    transitionProperty: "opacity",
    ":hover": {
      opacity: 0.9,
    },
  },
  errorBackButton: {
    backgroundColor: {
      default: "transparent",
      ":hover": "var(--color-memora-hover)",
    },
    color: {
      default: "var(--color-memora-text-muted)",
      ":hover": "var(--color-memora-text)",
    },
    transitionProperty: "color, background-color",
  },
});

type HighlightRange = {
  startLine: number;
  endLine: number;
};

interface EditorCanonicalSnapshot {
  fileId: string | null;
  revision: number;
  sessionId: number;
  text: string;
}

const WYSIWYG_CONTENT_CHANGED_NOTICE =
  "Preview is unavailable because converting this document would change its Markdown. Continue in Code mode.";
const WYSIWYG_CONVERSION_ERROR_NOTICE =
  "Preview is unavailable because this document could not be converted safely. Continue in Code mode.";

const canonicalSnapshotsMatch = (
  before: EditorCanonicalSnapshot,
  after: EditorCanonicalSnapshot,
): boolean => {
  return (
    before.sessionId === after.sessionId &&
    before.fileId === after.fileId &&
    before.revision === after.revision &&
    before.text === after.text
  );
};

interface DocumentEditorPageProps {
  fileId: string;
  files: readonly TextDocumentFileLike[];
  folders: readonly WorkspaceFolderLike[];
  editorFontSizePx: number;
  initialMode?: "source" | "wysiwyg" | null;
  attachmentSettings: {
    attachmentPlacementMode: "root" | "fixed-folder" | "current-folder" | "current-subfolder";
    attachmentFolderId: string;
    attachmentSubfolderName: string;
  };
  initialReferenceTarget?: string | null;
  initialLineStart?: number | null;
  initialLineEnd?: number | null;
  onNavigateToHref?: (href: string) => void;
  onGoBack?: () => void;
  onFileUpdated?: (updatedEvent: FileUpdatedEventInput) => void;
  onAttachmentFileCreated?: (createdEvent: AttachmentFileCreatedEventInput) => void;
  onAttachmentFolderCreated?: (createdEvent: FolderCreatedEventInput) => void;
}

const parseSearchLineNumber = (value: string | null): number | null => {
  if (!value) {
    return null;
  }

  const parsedValue = Number.parseInt(value, 10);
  if (!Number.isInteger(parsedValue)) {
    return null;
  }

  return parsedValue;
};

const parseReferenceTarget = (
  target: string,
): {
  relativePath: string;
  startLine: number | null;
  endLine: number | null;
  invalidAnchor: boolean;
} => {
  const parsedLink = parseReferenceLink(target);
  if (parsedLink) {
    return {
      relativePath: parsedLink.relativePath,
      startLine: parsedLink.startLine,
      endLine: parsedLink.endLine,
      invalidAnchor: false,
    };
  }

  const hashIndex = target.indexOf("#");
  const relativePath = hashIndex >= 0 ? target.slice(0, hashIndex) : target;
  const anchorText = hashIndex >= 0 ? target.slice(hashIndex) : "";
  const anchor = anchorText ? parseLineAnchor(anchorText) : null;

  return {
    relativePath,
    startLine: anchor?.startLine ?? null,
    endLine: anchor?.endLine ?? null,
    invalidAnchor: anchorText.length > 0 && anchor === null,
  };
};

const normalizeHighlightRange = (
  lineCount: number,
  startLine: number | null,
  endLine: number | null,
): { range: HighlightRange | null; invalid: boolean } => {
  if (startLine === null) {
    return {
      range: null,
      invalid: false,
    };
  }

  if (!Number.isInteger(startLine) || startLine <= 0) {
    return {
      range: null,
      invalid: true,
    };
  }

  if (endLine !== null && (!Number.isInteger(endLine) || endLine <= 0 || endLine < startLine)) {
    return {
      range: null,
      invalid: true,
    };
  }

  const clampedStartLine = Math.min(startLine, lineCount);
  const normalizedEndLine = endLine ?? startLine;
  const clampedEndLine = Math.max(clampedStartLine, Math.min(normalizedEndLine, lineCount));

  return {
    range: {
      startLine: clampedStartLine,
      endLine: clampedEndLine,
    },
    invalid: false,
  };
};

const normalizeRequestedAnchor = (
  startLine: number | null,
  endLine: number | null,
): { range: HighlightRange | null; invalid: boolean } => {
  if (startLine === null) {
    return {
      range: null,
      invalid: false,
    };
  }

  if (!Number.isInteger(startLine) || startLine <= 0) {
    return {
      range: null,
      invalid: true,
    };
  }

  if (endLine !== null && (!Number.isInteger(endLine) || endLine <= 0 || endLine < startLine)) {
    return {
      range: null,
      invalid: true,
    };
  }

  return {
    range: {
      startLine,
      endLine: endLine ?? startLine,
    },
    invalid: false,
  };
};

const buildReferenceHref = (fileId: string, range: HighlightRange | null): string => {
  const searchParams = new URLSearchParams();
  searchParams.set("mode", "source");

  if (range) {
    searchParams.set("lineStart", String(range.startLine));
    searchParams.set("lineEnd", String(range.endLine));
  }

  return `/editor/file/${fileId}?${searchParams.toString()}`;
};

export function DocumentEditorPage({
  fileId,
  files,
  folders,
  editorFontSizePx,
  initialMode = null,
  attachmentSettings,
  initialReferenceTarget = null,
  initialLineStart = null,
  initialLineEnd = null,
  onNavigateToHref,
  onGoBack,
  onFileUpdated,
  onAttachmentFileCreated,
  onAttachmentFolderCreated,
}: DocumentEditorPageProps) {
  const currentFile = useMemo(() => {
    return files.find((file) => file.id === fileId) ?? null;
  }, [fileId, files]);

  if (!currentFile || !isEditableTextDocument(currentFile)) {
    return (
      <section {...stylex.props(styles.missingPage)}>
        <div {...stylex.props(styles.missingCard)}>
          <h1 {...stylex.props(styles.missingTitle)}>Document not found</h1>
          <p {...stylex.props(styles.missingDescription)}>
            The requested editor file could not be found or is not an editable text document.
          </p>
          <button type="button" {...stylex.props(styles.backButton)} onClick={() => onGoBack?.()}>
            Go back
          </button>
        </div>
      </section>
    );
  }

  return (
    <section
      {...stylex.props(styles.page)}
      data-testid="document-editor-page"
      style={
        {
          "--document-editor-font-size": `${editorFontSizePx}px`,
        } as CSSProperties
      }
    >
      <DocumentEditorSession
        key={`${currentFile.id}:${currentFile.storagePath}`}
        file={currentFile}
        files={files}
        folders={folders}
        initialMode={initialMode}
        attachmentSettings={attachmentSettings}
        initialReferenceTarget={initialReferenceTarget}
        initialLineStart={initialLineStart}
        initialLineEnd={initialLineEnd}
        onNavigateToHref={onNavigateToHref}
        onGoBack={onGoBack}
        onFileUpdated={onFileUpdated}
        onAttachmentFileCreated={onAttachmentFileCreated}
        onAttachmentFolderCreated={onAttachmentFolderCreated}
      />
    </section>
  );
}

interface DocumentEditorSessionProps extends Omit<
  DocumentEditorPageProps,
  "fileId" | "editorFontSizePx"
> {
  file: TextDocumentFileLike;
}

function DocumentEditorSession({
  file,
  files,
  folders,
  initialMode = null,
  attachmentSettings,
  initialReferenceTarget = null,
  initialLineStart = null,
  initialLineEnd = null,
  onNavigateToHref,
  onGoBack,
  onFileUpdated,
  onAttachmentFileCreated,
  onAttachmentFolderCreated,
}: DocumentEditorSessionProps) {
  const [referenceNotice, setReferenceNotice] = useState<string | null>(null);
  const [wysiwygSafetyNotice, setWysiwygSafetyNotice] = useState<string | null>(null);
  const [wysiwygSafetyDiagnostics, setWysiwygSafetyDiagnostics] = useState<
    readonly MarkdownSafetyDiagnostic[]
  >([]);
  const [focusedLineRange, setFocusedLineRange] = useState<HighlightRange | null>(null);
  const [editorMode, setEditorMode] = useState<"source" | "wysiwyg">("source");
  const handledInitialReference = useRef(false);
  const handledInitialFocus = useRef(false);
  const initializedModeForFile = useRef(false);
  const editorFile = useDocumentEditorFile({
    file,
    files,
    folders,
    attachmentSettings,
    onFileUpdated,
    onAttachmentFileCreated,
    onAttachmentFolderCreated,
  });
  const activeFile = editorFile.file;
  const text = editorFile.text;

  const guardWysiwygEntry = useCallback((): boolean => {
    const before = editorFile.getCanonicalSnapshot();
    let result: MarkdownPreflightResult;
    try {
      result = preflightMarkdownForWysiwyg(before.text);
    } catch {
      result = {
        reason: "conversion-error",
        safe: false,
      };
    }
    const after = editorFile.getCanonicalSnapshot();

    if (!canonicalSnapshotsMatch(before, after)) {
      return false;
    }

    if (!result.safe) {
      setEditorMode("source");
      setWysiwygSafetyDiagnostics(
        result.reason === "content-changed" ? (result.diagnostics ?? []) : [],
      );
      setWysiwygSafetyNotice(
        result.reason === "content-changed"
          ? WYSIWYG_CONTENT_CHANGED_NOTICE
          : WYSIWYG_CONVERSION_ERROR_NOTICE,
      );
      return false;
    }

    setWysiwygSafetyDiagnostics([]);
    setWysiwygSafetyNotice(null);
    setEditorMode("wysiwyg");
    return true;
  }, [editorFile]);

  const handleTextChange = useCallback(
    (nextText: string): void => {
      setWysiwygSafetyDiagnostics([]);
      setWysiwygSafetyNotice(null);
      editorFile.updateText(nextText);
    },
    [editorFile],
  );

  const handleAttachImage = useCallback(
    async (image: File): Promise<void> => {
      setWysiwygSafetyDiagnostics([]);
      setWysiwygSafetyNotice(null);
      await editorFile.attachImage(image);
    },
    [editorFile],
  );

  useEffect(() => {
    handledInitialReference.current = false;
    handledInitialFocus.current = false;
    initializedModeForFile.current = false;
  }, [file.id]);

  useEffect(() => {
    if (editorFile.isLoading || !activeFile || initializedModeForFile.current) {
      return;
    }

    const mustUseSourceMode =
      initialMode === "source" ||
      initialReferenceTarget !== null ||
      initialLineStart !== null ||
      activeFile.mimeType === "text/plain" ||
      activeFile.name.toLowerCase().endsWith(".txt");
    if (mustUseSourceMode) {
      setEditorMode("source");
    } else {
      guardWysiwygEntry();
    }
    initializedModeForFile.current = true;
  }, [
    activeFile,
    editorFile.isLoading,
    guardWysiwygEntry,
    initialLineStart,
    initialMode,
    initialReferenceTarget,
  ]);

  const applySourceFocus = useCallback(
    (startLine: number | null, endLine: number | null): { invalid: boolean } => {
      const lineCount = Math.max(1, text.split("\n").length);
      const normalized = normalizeHighlightRange(lineCount, startLine, endLine);
      setFocusedLineRange(normalized.range);
      return {
        invalid: normalized.invalid,
      };
    },
    [text],
  );

  const handleReferenceOpen = useCallback(
    (target: string) => {
      if (!activeFile) {
        return;
      }

      try {
        const parsedTarget = parseReferenceTarget(target);
        const resolvedFile = resolveRelativeWorkspacePath(parsedTarget.relativePath, {
          currentFile: activeFile,
          files,
          folders,
        });
        const requestedAnchor = normalizeRequestedAnchor(
          parsedTarget.startLine,
          parsedTarget.endLine,
        );

        if (resolvedFile.id !== activeFile.id) {
          onNavigateToHref?.(buildReferenceHref(resolvedFile.id, requestedAnchor.range));
          return;
        }

        if (parsedTarget.invalidAnchor || requestedAnchor.invalid) {
          setFocusedLineRange(null);
          setReferenceNotice(
            "Reference anchor was invalid, so the file opened without selecting a source range.",
          );
          return;
        }

        setReferenceNotice(null);
        setEditorMode("source");
        setFocusedLineRange(requestedAnchor.range);
      } catch (error) {
        setFocusedLineRange(null);
        setReferenceNotice(error instanceof Error ? error.message : "Unable to open reference.");
      }
    },
    [activeFile, files, folders, onNavigateToHref],
  );

  useEffect(() => {
    if (
      editorFile.isLoading ||
      !activeFile ||
      handledInitialReference.current ||
      !initialReferenceTarget
    ) {
      return;
    }

    handledInitialReference.current = true;
    handleReferenceOpen(initialReferenceTarget);
  }, [activeFile, editorFile.isLoading, handleReferenceOpen, initialReferenceTarget]);

  useEffect(() => {
    if (
      editorFile.isLoading ||
      handledInitialFocus.current ||
      initialReferenceTarget ||
      initialLineStart === null
    ) {
      return;
    }

    handledInitialFocus.current = true;
    const applied = applySourceFocus(initialLineStart, initialLineEnd);
    if (applied.invalid) {
      setReferenceNotice(
        "Reference anchor was invalid, so the file opened without selecting a source range.",
      );
    }
  }, [
    applySourceFocus,
    editorFile.isLoading,
    initialLineEnd,
    initialLineStart,
    initialReferenceTarget,
  ]);

  const handleGoBack = useCallback(async () => {
    try {
      await editorFile.flushPendingSave();
      onGoBack?.();
    } catch {
      // Keep the user on the page when flushing unsaved changes fails.
    }
  }, [editorFile, onGoBack]);

  const handleRequestSource = useCallback(async () => {
    try {
      await editorFile.flushPendingSave();
      setEditorMode("source");
    } catch {
      // Save errors are already surfaced by the hook state.
    }
  }, [editorFile]);

  const handleRequestWysiwyg = useCallback(async () => {
    try {
      await editorFile.flushPendingSave();
      if (editorFile.requestWysiwyg() === "upgrade-required") {
        return;
      }

      guardWysiwygEntry();
    } catch {
      // Save errors are already surfaced by the hook state.
    }
  }, [editorFile, guardWysiwygEntry]);

  const handleConfirmTxtUpgrade = useCallback(async () => {
    try {
      await editorFile.confirmTxtUpgrade();
      guardWysiwygEntry();
    } catch {
      // Save errors are already surfaced by the hook state.
    }
  }, [editorFile, guardWysiwygEntry]);

  return (
    <div {...stylex.props(styles.session)}>
      {editorFile.isLoading ? (
        <div {...stylex.props(styles.loading)}>Loading document...</div>
      ) : editorFile.loadError ? (
        <div {...stylex.props(styles.loadError)}>
          <h1 {...stylex.props(styles.loadErrorTitle)}>Unable to load document</h1>
          <p {...stylex.props(styles.loadErrorDescription)}>{editorFile.loadError}</p>
          <div {...stylex.props(styles.errorActions)}>
            <button
              type="button"
              {...stylex.props(styles.errorButton, styles.retryButton)}
              onClick={() => editorFile.reload()}
            >
              Retry
            </button>
            <button
              type="button"
              {...stylex.props(styles.errorButton, styles.errorBackButton)}
              onClick={() => {
                void handleGoBack();
              }}
            >
              Go back
            </button>
          </div>
        </div>
      ) : activeFile ? (
        <MarkdownDocumentEditor
          file={activeFile}
          text={text}
          editorMode={editorMode}
          onTextChange={handleTextChange}
          onTitleChange={editorFile.renameTitle}
          onSave={() => {
            void editorFile.saveNow();
          }}
          onRequestSource={() => {
            void handleRequestSource();
          }}
          onRequestWysiwyg={() => {
            void handleRequestWysiwyg();
          }}
          onAttachImage={handleAttachImage}
          onGoBack={() => {
            void handleGoBack();
          }}
          saveState={editorFile.saveState}
          saveError={editorFile.saveError}
          referenceNotice={referenceNotice}
          wysiwygSafetyNotice={wysiwygSafetyNotice}
          wysiwygSafetyDiagnostics={wysiwygSafetyDiagnostics}
          isAttachingImage={editorFile.isAttachingImage}
          focusedLineStart={focusedLineRange?.startLine ?? null}
          focusedLineEnd={focusedLineRange?.endLine ?? null}
          txtUpgradeDialogOpen={editorFile.txtUpgradeDialogOpen}
          onConfirmTxtUpgrade={() => {
            void handleConfirmTxtUpgrade();
          }}
          onCancelTxtUpgrade={() => editorFile.cancelTxtUpgrade()}
        />
      ) : null}
    </div>
  );
}

export const Component = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const store = useAppStore();
  const files = store.useQuery(desktopFilesQuery$) as LiveStoreFile[];
  const folders = store.useQuery(desktopFoldersQuery$) as readonly WorkspaceFolderLike[];
  const { settings } = useDocumentEditorSettings();
  const searchParams = new URLSearchParams(location.search);

  if (!id) {
    return null;
  }

  return (
    <DocumentEditorPage
      fileId={id}
      files={files as unknown as TextDocumentFileLike[]}
      folders={folders}
      editorFontSizePx={settings.editorFontSizePx}
      initialMode={searchParams.get("mode") === "source" ? "source" : null}
      attachmentSettings={{
        attachmentPlacementMode: settings.attachmentPlacementMode,
        attachmentFolderId: settings.attachmentFolderId,
        attachmentSubfolderName: settings.attachmentSubfolderName,
      }}
      initialReferenceTarget={searchParams.get("reference")}
      initialLineStart={parseSearchLineNumber(searchParams.get("lineStart"))}
      initialLineEnd={parseSearchLineNumber(searchParams.get("lineEnd"))}
      onNavigateToHref={(href) => navigate(href)}
      onGoBack={() => navigate(-1)}
      onFileUpdated={(updatedEvent) => {
        store.commit(fileEvents.fileUpdated(updatedEvent));
      }}
      onAttachmentFileCreated={(createdEvent) => {
        store.commit(fileEvents.fileCreated(createdEvent));
      }}
      onAttachmentFolderCreated={(createdEvent) => {
        store.commit(folderEvents.folderCreated(createdEvent));
      }}
    />
  );
};
