import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import * as stylex from "@stylexjs/stylex";
import type { WikiLinkOptions } from "memora-markdown-editor";
import { AnimatePresence } from "motion/react";
import { useLocation, useNavigate, useParams } from "react-router";
import { useAppStore } from "@/livestore/store";

import { DocumentChangeReview } from "@/components/editor/DocumentChangeReview";
import { DocumentChatSidebar } from "@/components/editor/DocumentChatSidebar";
import { MarkdownDocumentEditor } from "@/components/editor/MarkdownDocumentEditor";
import { useDocumentEditorFile } from "@/hooks/editor/useDocumentEditorFile";
import {
  type FileUpdatedEventInput,
  type TextDocumentFileLike,
} from "@/lib/editor/documentPersistence";
import {
  type FileCreatedEventInput as AttachmentFileCreatedEventInput,
  type FolderCreatedEventInput,
} from "@/lib/editor/imageAttachments";
import { getFileExtension, isEditableTextDocument } from "@/lib/editor/editableTextDocument";
import {
  resolveRelativeWorkspacePath,
  resolveWikiLinkTarget,
  type WorkspaceFolderLike,
} from "@/lib/editor/logicalPaths";
import { parseLineAnchor, parseReferenceLink } from "@/lib/editor/referenceLinks";
import { desktopFilesQuery$, desktopFoldersQuery$ } from "@/lib/desktop/queries";
import { useDocumentEditorSettings } from "@/hooks/settings/useDocumentEditorSettings";
import { registerDocumentToolTarget } from "@/lib/chat/tools/documentTools";
import {
  acceptDiffHunk,
  computeDiffHunks,
  rejectDiffHunk,
  type DiffHunk,
} from "@/lib/editor/textDiff";
import { folderEvents } from "@/livestore/folder";
import { fileEvents, type file as LiveStoreFile } from "@/livestore/file";
import { tokens } from "../../styles/stylex.stylex";

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
    backgroundColor: tokens.card,
    borderColor: tokens.border,
    borderRadius: "1.5rem",
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
    padding: "2rem",
    textAlign: "center",
  },
  missingTitle: {
    color: tokens.textStrong,
    fontSize: "1.5rem",
    fontWeight: 600,
    lineHeight: "2rem",
  },
  missingDescription: {
    color: tokens.textMuted,
    fontSize: "0.875rem",
    lineHeight: "1.25rem",
    marginTop: "0.5rem",
  },
  backButton: {
    backgroundColor: {
      default: "transparent",
      ":hover": tokens.hover,
    },
    borderColor: tokens.border,
    borderRadius: "0.5rem",
    borderStyle: "solid",
    borderWidth: 1,
    color: tokens.text,
    fontSize: "0.875rem",
    lineHeight: "1.25rem",
    marginTop: "1rem",
    paddingBlock: "0.5rem",
    paddingInline: "1rem",
    transitionDuration: "150ms",
    transitionProperty: "background-color",
  },
  page: {
    alignItems: "flex-start",
    backgroundColor: tokens.canvas,
    color: tokens.text,
    display: "flex",
    minHeight: "100vh",
  },
  pageBody: {
    flex: 1,
    minWidth: 0,
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
    color: tokens.textSoft,
    fontSize: "0.875rem",
    lineHeight: "1.25rem",
    paddingBlock: "2.5rem",
    paddingInline: "0.25rem",
  },
  loadError: {
    borderLeftColor: tokens.warningBorder,
    borderLeftStyle: "solid",
    borderLeftWidth: 1,
    paddingBlock: "1rem",
    paddingInline: "1.25rem",
  },
  loadErrorTitle: {
    color: tokens.textStrong,
    fontSize: "1.125rem",
    fontWeight: 600,
    lineHeight: "1.75rem",
  },
  loadErrorDescription: {
    color: tokens.textMuted,
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
    backgroundColor: tokens.text,
    color: tokens.canvas,
    transitionProperty: "opacity",
    ":hover": {
      opacity: 0.9,
    },
  },
  errorBackButton: {
    backgroundColor: {
      default: "transparent",
      ":hover": tokens.hover,
    },
    color: {
      default: tokens.textMuted,
      ":hover": tokens.text,
    },
    transitionProperty: "color, background-color",
  },
});

type HighlightRange = {
  startLine: number;
  endLine: number;
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

// The chat a note's side panel last showed, so reopening the panel continues it.
const DOCUMENT_CHAT_SESSION_KEY_PREFIX = "memora.documentChatSession.";

const readDocumentChatSessionId = (fileId: string): string | null => {
  try {
    return window.localStorage.getItem(`${DOCUMENT_CHAT_SESSION_KEY_PREFIX}${fileId}`);
  } catch {
    return null;
  }
};

const writeDocumentChatSessionId = (fileId: string, sessionId: string): void => {
  try {
    window.localStorage.setItem(`${DOCUMENT_CHAT_SESSION_KEY_PREFIX}${fileId}`, sessionId);
  } catch {
    // Without storage the panel starts a new chat next time.
  }
};

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

  // A line range opens in Code mode, where the lines can be selected; a plain link opens as usual.
  if (range) {
    searchParams.set("mode", "source");
    searchParams.set("lineStart", String(range.startLine));
    searchParams.set("lineEnd", String(range.endLine));
  }

  const query = searchParams.toString();
  return query ? `/editor/file/${fileId}?${query}` : `/editor/file/${fileId}`;
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

  const handleTextChange = useCallback(
    (nextText: string): void => {
      editorFile.updateText(nextText);
    },
    [editorFile],
  );

  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatSessionId, setChatSessionId] = useState<string | null>(() =>
    readDocumentChatSessionId(file.id),
  );
  const [selectionText, setSelectionText] = useState<string | null>(null);
  // Chat edits wait here, as the whole proposed note, until each change is accepted or rejected.
  // The ref gives the chat tools the latest proposal before React re-renders.
  const [chatProposal, setChatProposalState] = useState<string | null>(null);
  const chatProposalRef = useRef<string | null>(null);
  const chatTargetRef = useRef({
    editorFile,
    handleTextChange,
  });
  useLayoutEffect(() => {
    chatTargetRef.current = {
      editorFile,
      handleTextChange,
    };
  });

  const handleChatSessionChange = useCallback(
    (sessionId: string): void => {
      setChatSessionId(sessionId);
      writeDocumentChatSessionId(file.id, sessionId);
    },
    [file.id],
  );

  const setChatProposal = useCallback((proposal: string | null): void => {
    const currentText = chatTargetRef.current.editorFile.getCanonicalSnapshot().text;
    const nextProposal = proposal === currentText ? null : proposal;
    chatProposalRef.current = nextProposal;
    setChatProposalState(nextProposal);
  }, []);

  const writeAcceptedText = useCallback((nextText: string): void => {
    const latest = chatTargetRef.current;
    latest.handleTextChange(nextText);
  }, []);

  const chatFileName = activeFile?.name ?? file.name;
  useEffect(() => {
    if (!chatSessionId) {
      return;
    }
    return registerDocumentToolTarget(chatSessionId, {
      fileId: file.id,
      fileName: chatFileName,
      getText: () =>
        chatProposalRef.current ?? chatTargetRef.current.editorFile.getCanonicalSnapshot().text,
      applyText: setChatProposal,
    });
  }, [chatFileName, chatSessionId, file.id, setChatProposal]);

  const handleAcceptChange = useCallback(
    (hunk: DiffHunk): void => {
      const proposal = chatProposalRef.current;
      if (proposal === null) {
        return;
      }
      writeAcceptedText(acceptDiffHunk(text, proposal, hunk));
      setChatProposal(proposal);
    },
    [setChatProposal, text, writeAcceptedText],
  );

  const handleAcceptText = useCallback(
    (nextText: string): void => {
      const proposal = chatProposalRef.current;
      writeAcceptedText(nextText);
      setChatProposal(proposal);
    },
    [setChatProposal, writeAcceptedText],
  );

  const handleRejectChange = useCallback(
    (hunk: DiffHunk): void => {
      const proposal = chatProposalRef.current;
      if (proposal !== null) {
        setChatProposal(rejectDiffHunk(text, proposal, hunk));
      }
    },
    [setChatProposal, text],
  );

  const handleAcceptAllChanges = useCallback((): void => {
    const proposal = chatProposalRef.current;
    if (proposal !== null) {
      writeAcceptedText(proposal);
    }
    setChatProposal(null);
  }, [setChatProposal, writeAcceptedText]);

  const handleRejectAllChanges = useCallback((): void => {
    setChatProposal(null);
  }, [setChatProposal]);

  const pendingChangeCount = useMemo(() => {
    return chatProposal === null ? 0 : computeDiffHunks(text, chatProposal).length;
  }, [chatProposal, text]);

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
      setEditorMode("wysiwyg");
    }
    initializedModeForFile.current = true;
  }, [activeFile, editorFile.isLoading, initialLineStart, initialMode, initialReferenceTarget]);

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

  const wikiLinks = useMemo<WikiLinkOptions | undefined>(() => {
    if (!activeFile) {
      return undefined;
    }
    const scope = { currentFile: activeFile, files, folders };
    return {
      resolve: (target) => resolveWikiLinkTarget(target, scope) !== null,
      suggest: (query) => {
        const needle = query.trim().toLowerCase();
        return files
          .filter(
            (candidate) => candidate.id !== activeFile.id && isEditableTextDocument(candidate),
          )
          .filter((candidate) => candidate.name.toLowerCase().includes(needle))
          .slice(0, 20)
          .map((candidate) => {
            const extension = getFileExtension(candidate.name);
            return {
              target: extension ? candidate.name.slice(0, -extension.length) : candidate.name,
            };
          });
      },
      onOpen: (target) => {
        const resolved = resolveWikiLinkTarget(target, scope);
        if (!resolved) {
          setReferenceNotice(`No note named "${target}" was found.`);
          return;
        }
        onNavigateToHref?.(buildReferenceHref(resolved.id, null));
      },
    };
  }, [activeFile, files, folders, onNavigateToHref]);

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

      setEditorMode("wysiwyg");
    } catch {
      // Save errors are already surfaced by the hook state.
    }
  }, [editorFile]);

  const handleConfirmTxtUpgrade = useCallback(async () => {
    try {
      await editorFile.confirmTxtUpgrade();
      setEditorMode("wysiwyg");
    } catch {
      // Save errors are already surfaced by the hook state.
    }
  }, [editorFile]);

  return (
    <>
      <div {...stylex.props(styles.pageBody)}>
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
              onRequestSource={() => {
                void handleRequestSource();
              }}
              onRequestWysiwyg={() => {
                void handleRequestWysiwyg();
              }}
              onGoBack={() => {
                void handleGoBack();
              }}
              saveState={editorFile.saveState}
              saveError={editorFile.saveError}
              referenceNotice={referenceNotice}
              focusedLineStart={focusedLineRange?.startLine ?? null}
              focusedLineEnd={focusedLineRange?.endLine ?? null}
              txtUpgradeDialogOpen={editorFile.txtUpgradeDialogOpen}
              onConfirmTxtUpgrade={() => {
                void handleConfirmTxtUpgrade();
              }}
              onCancelTxtUpgrade={() => editorFile.cancelTxtUpgrade()}
              isChatOpen={isChatOpen}
              onToggleChat={() => setIsChatOpen((open) => !open)}
              onSelectionTextChange={setSelectionText}
              onOpenReference={handleReferenceOpen}
              wikiLinks={wikiLinks}
              wysiwygReview={
                chatProposal !== null
                  ? {
                      proposedText: chatProposal,
                      onAcceptText: handleAcceptText,
                      onProposalChange: setChatProposal,
                    }
                  : null
              }
              changeReview={
                chatProposal !== null ? (
                  <DocumentChangeReview
                    baseText={text}
                    proposedText={chatProposal}
                    onAcceptHunk={handleAcceptChange}
                    onRejectHunk={handleRejectChange}
                    onAcceptAll={handleAcceptAllChanges}
                    onRejectAll={handleRejectAllChanges}
                  />
                ) : null
              }
            />
          ) : null}
        </div>
      </div>
      <AnimatePresence initial={false}>
        {isChatOpen && activeFile ? (
          <DocumentChatSidebar
            key="document-chat"
            fileName={chatFileName}
            initialSessionId={chatSessionId}
            onActiveSessionChange={handleChatSessionChange}
            selectionText={selectionText}
            onClearSelection={() => setSelectionText(null)}
            pendingChangeCount={pendingChangeCount}
            onAcceptAllChanges={handleAcceptAllChanges}
            onRejectAllChanges={handleRejectAllChanges}
            onClose={() => setIsChatOpen(false)}
          />
        ) : null}
      </AnimatePresence>
    </>
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
