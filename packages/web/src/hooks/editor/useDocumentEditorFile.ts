import { useCallback, useEffect, useRef, useState } from "react";

import {
  readTextDocumentBytes,
  saveTextDocument,
  upgradeTextFileToMarkdown,
  type FileUpdatedEventInput,
  type TextDocumentFileLike,
} from "@/lib/editor/documentPersistence";
import { getFileExtension, normalizeMimeType } from "@/lib/editor/editableTextDocument";
import { renamePathAddressableFile } from "@/lib/editor/pathMutations";
import {
  saveImageAttachment,
  type AttachmentPlacementSettings,
  type FileCreatedEventInput,
  type FolderCreatedEventInput,
} from "@/lib/editor/imageAttachments";
import type { WorkspaceFolderLike } from "@/lib/editor/logicalPaths";
import type { FileMeta } from "@/types/library";

type SaveState = "idle" | "dirty" | "saving" | "error";
type PersistMode = "save" | "upgrade-markdown";

interface SaveIntent {
  targetFileId: string;
  targetStoragePath: string;
  mode: PersistMode;
  name?: string;
  revision: number;
  sessionId: number;
  text: string;
}

interface SaveCaller {
  resolve: () => void;
  reject: (reason: unknown) => void;
}

interface StoragePathPersistenceReservation {
  result: Promise<void>;
  start: (operation: () => Promise<void>) => void;
  cancel: () => void;
}

interface SaveQueueEntry {
  intent: SaveIntent;
  callers: SaveCaller[];
  reservation: StoragePathPersistenceReservation;
  reservationGeneration: number;
}

interface PersistenceSession {
  sessionId: number;
  targetFileId: string;
  targetStoragePath: string;
  persistedFile: TextDocumentFileLike;
  lastSavedRevision: number;
  lastSavedText: string;
  inFlight: SaveQueueEntry | null;
  pending: SaveQueueEntry | null;
}

interface UseDocumentEditorFileInput {
  file: TextDocumentFileLike | null;
  files: readonly Pick<FileMeta, "id" | "name" | "parentId">[];
  folders: readonly WorkspaceFolderLike[];
  attachmentSettings: AttachmentPlacementSettings;
  autoSaveDelayMs?: number;
  onFileUpdated?: (updatedEvent: FileUpdatedEventInput) => void;
  onAttachmentFileCreated?: (createdEvent: FileCreatedEventInput) => void;
  onAttachmentFolderCreated?: (createdEvent: FolderCreatedEventInput) => void;
}

const DEFAULT_AUTO_SAVE_DELAY_MS = 800;
const persistenceTailsByStoragePath = new Map<string, Promise<void>>();

const reserveStoragePathPersistence = (storagePath: string): StoragePathPersistenceReservation => {
  let releaseReadiness!: (operation: () => Promise<void>) => void;
  let started = false;
  const readiness = new Promise<() => Promise<void>>((resolve) => {
    releaseReadiness = resolve;
  });
  const previousTail = persistenceTailsByStoragePath.get(storagePath) ?? Promise.resolve();
  const result = previousTail
    .catch(() => undefined)
    .then(async () => {
      const operation = await readiness;
      await operation();
    });
  const nextTail = result.then(
    () => undefined,
    () => undefined,
  );
  persistenceTailsByStoragePath.set(storagePath, nextTail);

  void nextTail.then(() => {
    if (persistenceTailsByStoragePath.get(storagePath) === nextTail) {
      persistenceTailsByStoragePath.delete(storagePath);
    }
  });

  const start = (operation: () => Promise<void>): void => {
    if (started) {
      return;
    }
    started = true;
    releaseReadiness(operation);
  };

  return {
    result,
    start,
    cancel: () => start(async () => undefined),
  };
};

const waitForPendingDocumentWrites = async (storagePath: string): Promise<void> => {
  const pendingTail = persistenceTailsByStoragePath.get(storagePath);
  if (pendingTail) {
    await pendingTail;
  }
};

const buildImageMarkdown = (altText: string, relativePath: string): string => {
  const escapedAltText = altText.replace(/[[\]\\]/g, "\\$&");
  return `![${escapedAltText}](${relativePath})`;
};

const appendAttachmentMarkdown = (text: string, markdown: string): string => {
  if (!text.trim()) {
    return `${markdown}\n`;
  }

  const separator = text.endsWith("\n\n") ? "" : text.endsWith("\n") ? "\n" : "\n\n";
  return `${text}${separator}${markdown}\n`;
};

export const useDocumentEditorFile = ({
  file,
  files,
  folders,
  attachmentSettings,
  autoSaveDelayMs = DEFAULT_AUTO_SAVE_DELAY_MS,
  onFileUpdated,
  onAttachmentFileCreated,
  onAttachmentFolderCreated,
}: UseDocumentEditorFileInput) => {
  const [activeFile, setActiveFile] = useState<TextDocumentFileLike | null>(file);
  const [text, setText] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [txtUpgradeDialogOpen, setTxtUpgradeDialogOpen] = useState(false);
  const [isAttachingImage, setIsAttachingImage] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const fileReloadKey = file ? `${file.id}:${file.storagePath}` : "no-file";

  const activeFileRef = useRef<TextDocumentFileLike | null>(file);
  const persistedFileRef = useRef<TextDocumentFileLike | null>(file);
  const textRef = useRef("");
  const lastSavedTextRef = useRef("");
  const sessionIdRef = useRef(0);
  const revisionRef = useRef(0);
  const lastSavedRevisionRef = useRef(0);
  const persistenceSessionsRef = useRef(new Map<number, PersistenceSession>());
  const saveTimerRef = useRef<number | null>(null);
  const startQueueEntryRef = useRef<(entry: SaveQueueEntry) => void>(() => undefined);
  const enqueueIntentRef = useRef<(intent: SaveIntent, caller: SaveCaller) => void>(
    () => undefined,
  );
  const queueFollowUpRef = useRef<() => void>(() => undefined);
  const filesRef = useRef(files);
  const foldersRef = useRef(folders);
  const attachmentSettingsRef = useRef(attachmentSettings);
  const onFileUpdatedRef = useRef(onFileUpdated);
  const onAttachmentFileCreatedRef = useRef(onAttachmentFileCreated);
  const onAttachmentFolderCreatedRef = useRef(onAttachmentFolderCreated);
  const mountedRef = useRef(true);

  useEffect(() => {
    activeFileRef.current = activeFile;
  }, [activeFile]);

  useEffect(() => {
    textRef.current = text;
  }, [text]);

  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  useEffect(() => {
    foldersRef.current = folders;
  }, [folders]);

  useEffect(() => {
    attachmentSettingsRef.current = attachmentSettings;
  }, [attachmentSettings]);

  useEffect(() => {
    onFileUpdatedRef.current = onFileUpdated;
  }, [onFileUpdated]);

  useEffect(() => {
    onAttachmentFileCreatedRef.current = onAttachmentFileCreated;
  }, [onAttachmentFileCreated]);

  useEffect(() => {
    onAttachmentFolderCreatedRef.current = onAttachmentFolderCreated;
  }, [onAttachmentFolderCreated]);

  const clearPendingAutoSave = useCallback(() => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  }, []);

  const isIntentForActiveSession = useCallback((intent: SaveIntent): boolean => {
    return (
      intent.sessionId === sessionIdRef.current &&
      persistedFileRef.current?.id === intent.targetFileId &&
      persistedFileRef.current.storagePath === intent.targetStoragePath
    );
  }, []);

  const persistIntent = useCallback(
    async (intent: SaveIntent): Promise<void> => {
      const session = persistenceSessionsRef.current.get(intent.sessionId);
      const persistedFile = session?.persistedFile;
      if (
        !session ||
        !persistedFile ||
        session.targetFileId !== intent.targetFileId ||
        session.targetStoragePath !== intent.targetStoragePath ||
        persistedFile.id !== intent.targetFileId ||
        persistedFile.storagePath !== intent.targetStoragePath
      ) {
        throw new Error("Unable to resolve the document targeted by this save.");
      }

      const isRedundantSave =
        intent.mode === "save" && !intent.name && session.lastSavedText === intent.text;
      if (isRedundantSave) {
        return;
      }

      if (mountedRef.current && isIntentForActiveSession(intent)) {
        setSaveState("saving");
        setSaveError(null);
      }

      try {
        const result =
          intent.mode === "upgrade-markdown"
            ? await upgradeTextFileToMarkdown({
                file: intent.name ? { ...persistedFile, name: intent.name } : persistedFile,
                text: intent.text,
                files: filesRef.current,
              })
            : await saveTextDocument({
                file: persistedFile,
                text: intent.text,
                ...(intent.name ? { name: intent.name } : {}),
              });

        if (intent.revision >= session.lastSavedRevision) {
          session.persistedFile = result.file;
          session.lastSavedRevision = intent.revision;
          session.lastSavedText = result.text;
        }

        try {
          onFileUpdatedRef.current?.(result.updatedEvent);
        } catch {
          // Consumer callback errors must not change a completed persistence result.
        }

        const canAcceptResult =
          mountedRef.current &&
          isIntentForActiveSession(intent) &&
          intent.revision >= lastSavedRevisionRef.current;
        if (!canAcceptResult) {
          return;
        }

        persistedFileRef.current = result.file;
        activeFileRef.current = result.file;
        lastSavedRevisionRef.current = intent.revision;
        lastSavedTextRef.current = result.text;
        setActiveFile(result.file);
        if (intent.mode === "upgrade-markdown") {
          setTxtUpgradeDialogOpen(false);
        }

        if (revisionRef.current > intent.revision || textRef.current !== result.text) {
          setSaveState("dirty");
        } else {
          setSaveState("idle");
        }
      } catch (error) {
        if (mountedRef.current && isIntentForActiveSession(intent)) {
          const message = error instanceof Error ? error.message : "Unable to save document.";
          setSaveState("error");
          setSaveError(message);
        }
        throw error;
      }
    },
    [isIntentForActiveSession],
  );

  const finishQueueEntry = useCallback((entry: SaveQueueEntry, error?: unknown) => {
    const session = persistenceSessionsRef.current.get(entry.intent.sessionId);
    if (session?.inFlight === entry) {
      session.inFlight = null;
    }

    const nextEntry = session?.pending ?? null;
    if (session) {
      session.pending = null;
    }
    if (nextEntry) {
      startQueueEntryRef.current(nextEntry);
    }

    for (const caller of entry.callers) {
      if (error === undefined) {
        caller.resolve();
      } else {
        caller.reject(error);
      }
    }

    const shouldFollowUp =
      entry.intent.sessionId === sessionIdRef.current &&
      persistedFileRef.current?.id === entry.intent.targetFileId &&
      revisionRef.current > entry.intent.revision &&
      textRef.current !== session?.lastSavedText;
    if (shouldFollowUp) {
      void Promise.resolve().then(() => queueFollowUpRef.current());
    }

    if (
      session &&
      session.sessionId !== sessionIdRef.current &&
      !session.inFlight &&
      !session.pending
    ) {
      persistenceSessionsRef.current.delete(session.sessionId);
    }
  }, []);

  const startQueueEntry = useCallback(
    (entry: SaveQueueEntry): void => {
      const reservation = entry.reservation;
      const reservationGeneration = entry.reservationGeneration;
      const session = persistenceSessionsRef.current.get(entry.intent.sessionId);
      if (!session) {
        reservation.start(async () => {
          throw new Error("Unable to resolve the document session targeted by this save.");
        });
      } else {
        session.inFlight = entry;
        reservation.start(() => persistIntent(entry.intent));
      }

      void reservation.result.then(
        () => {
          if (entry.reservationGeneration === reservationGeneration) {
            finishQueueEntry(entry);
          }
        },
        (error: unknown) => {
          if (entry.reservationGeneration === reservationGeneration) {
            finishQueueEntry(entry, error);
          }
        },
      );
    },
    [finishQueueEntry, persistIntent],
  );
  startQueueEntryRef.current = startQueueEntry;

  const doesIntentCover = useCallback((covering: SaveIntent, requested: SaveIntent): boolean => {
    if (
      covering.sessionId !== requested.sessionId ||
      covering.targetFileId !== requested.targetFileId ||
      covering.targetStoragePath !== requested.targetStoragePath ||
      covering.revision < requested.revision ||
      covering.text !== requested.text
    ) {
      return false;
    }

    if (requested.mode === "upgrade-markdown" && covering.mode !== "upgrade-markdown") {
      return false;
    }

    return !requested.name || covering.name === requested.name;
  }, []);

  const enqueueIntent = useCallback(
    (intent: SaveIntent, caller: SaveCaller): void => {
      const session = persistenceSessionsRef.current.get(intent.sessionId);
      if (
        !session ||
        session.targetFileId !== intent.targetFileId ||
        session.targetStoragePath !== intent.targetStoragePath
      ) {
        caller.reject(new Error("Unable to resolve the document session targeted by this save."));
        return;
      }

      const inFlight = session.inFlight;
      if (inFlight && doesIntentCover(inFlight.intent, intent)) {
        inFlight.callers.push(caller);
        return;
      }

      const pending = session.pending;
      if (pending && doesIntentCover(pending.intent, intent)) {
        pending.callers.push(caller);
        return;
      }

      if (pending) {
        pending.reservation.cancel();
        pending.reservation = reserveStoragePathPersistence(intent.targetStoragePath);
        pending.reservationGeneration += 1;
        const newestIntent = intent.revision >= pending.intent.revision ? intent : pending.intent;
        pending.intent = {
          ...newestIntent,
          mode:
            pending.intent.mode === "upgrade-markdown" || intent.mode === "upgrade-markdown"
              ? "upgrade-markdown"
              : "save",
          name: intent.name ?? pending.intent.name,
        };
        pending.callers.push(caller);
        return;
      }

      const nextEntry: SaveQueueEntry = {
        intent,
        callers: [caller],
        reservation: reserveStoragePathPersistence(intent.targetStoragePath),
        reservationGeneration: 0,
      };
      if (inFlight) {
        session.pending = nextEntry;
      } else {
        startQueueEntryRef.current(nextEntry);
      }
    },
    [doesIntentCover],
  );
  enqueueIntentRef.current = enqueueIntent;

  const queuePersist = useCallback(
    (mode: PersistMode, name?: string): Promise<void> => {
      clearPendingAutoSave();
      const targetFile = persistedFileRef.current;
      if (!targetFile) {
        return Promise.resolve();
      }

      const intent: SaveIntent = {
        targetFileId: targetFile.id,
        targetStoragePath: targetFile.storagePath,
        mode,
        ...(name ? { name } : {}),
        revision: revisionRef.current,
        sessionId: sessionIdRef.current,
        text: textRef.current,
      };

      return new Promise<void>((resolve, reject) => {
        enqueueIntentRef.current(intent, { resolve, reject });
      });
    },
    [clearPendingAutoSave],
  );

  queueFollowUpRef.current = () => {
    void queuePersist("save").catch(() => undefined);
  };

  const scheduleAutoSave = useCallback(() => {
    clearPendingAutoSave();
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      void queuePersist("save").catch(() => undefined);
    }, autoSaveDelayMs);
  }, [autoSaveDelayMs, clearPendingAutoSave, queuePersist]);

  const updateText = useCallback(
    (nextText: string) => {
      if (nextText === textRef.current) {
        return;
      }

      textRef.current = nextText;
      revisionRef.current += 1;
      setText(nextText);
      if (nextText === lastSavedTextRef.current) {
        clearPendingAutoSave();
        setSaveState("idle");
        setSaveError(null);
        return;
      }

      setSaveState("dirty");
      setSaveError(null);
      scheduleAutoSave();
    },
    [clearPendingAutoSave, scheduleAutoSave],
  );

  const saveNow = useCallback(async () => {
    await queuePersist("save");
  }, [queuePersist]);

  const flushPendingSave = useCallback(async () => {
    await queuePersist("save");
  }, [queuePersist]);

  const renameTitle = useCallback(
    async (nextName: string): Promise<void> => {
      const currentFile = persistedFileRef.current;
      if (!currentFile) {
        return;
      }

      const normalizedNextName = nextName.trim();
      if (!normalizedNextName || normalizedNextName === currentFile.name) {
        return;
      }

      renamePathAddressableFile(filesRef.current, {
        id: currentFile.id,
        name: normalizedNextName,
        parentId: currentFile.parentId ?? null,
        type: currentFile.type,
      });

      await queuePersist("save", normalizedNextName);
    },
    [queuePersist],
  );

  const requestWysiwyg = useCallback((): "ready" | "upgrade-required" => {
    const currentFile = activeFileRef.current;
    if (!currentFile) {
      return "ready";
    }

    const extension = getFileExtension(currentFile.name);
    const isPlainText =
      normalizeMimeType(currentFile.mimeType) === "text/plain" || extension === ".txt";
    if (isPlainText) {
      setTxtUpgradeDialogOpen(true);
      return "upgrade-required";
    }

    return "ready";
  }, []);

  const cancelTxtUpgrade = useCallback(() => {
    setTxtUpgradeDialogOpen(false);
  }, []);

  const confirmTxtUpgrade = useCallback(async () => {
    await queuePersist("upgrade-markdown");
  }, [queuePersist]);

  const attachImage = useCallback(
    async (image: File) => {
      const currentFile = persistedFileRef.current;
      if (!currentFile) {
        return null;
      }
      const attachmentSessionId = sessionIdRef.current;

      setIsAttachingImage(true);
      try {
        await flushPendingSave();
        const attachmentSession = persistenceSessionsRef.current.get(attachmentSessionId);
        const fileForAttachment = attachmentSession?.persistedFile;
        if (
          !fileForAttachment ||
          fileForAttachment.id !== currentFile.id ||
          fileForAttachment.storagePath !== currentFile.storagePath
        ) {
          throw new Error("Unable to resolve the document for this attachment.");
        }

        const result = await saveImageAttachment({
          currentFile: fileForAttachment,
          files: filesRef.current,
          folders: foldersRef.current,
          image,
          settings: attachmentSettingsRef.current,
        });

        if (result.createdFolderEvent) {
          onAttachmentFolderCreatedRef.current?.(result.createdFolderEvent);
        }
        onAttachmentFileCreatedRef.current?.(result.createdFileEvent);

        const nextText = appendAttachmentMarkdown(
          textRef.current,
          buildImageMarkdown(result.meta.name, result.markdownPath),
        );
        updateText(nextText);
        await queuePersist("save");

        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to attach this image.";
        if (mountedRef.current) {
          setSaveState("error");
          setSaveError(message);
        }
        throw error;
      } finally {
        if (mountedRef.current) {
          setIsAttachingImage(false);
        }
      }
    },
    [flushPendingSave, queuePersist, updateText],
  );

  const reload = useCallback(() => {
    setReloadToken((value) => value + 1);
  }, []);

  const getCanonicalSnapshot = useCallback(() => {
    return {
      fileId: activeFileRef.current?.id ?? null,
      revision: revisionRef.current,
      sessionId: sessionIdRef.current,
      text: textRef.current,
    };
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    clearPendingAutoSave();
    setTxtUpgradeDialogOpen(false);
    const loadSessionId = sessionIdRef.current + 1;
    sessionIdRef.current = loadSessionId;

    if (!file) {
      activeFileRef.current = null;
      persistedFileRef.current = null;
      lastSavedTextRef.current = "";
      revisionRef.current = 0;
      lastSavedRevisionRef.current = 0;
      textRef.current = "";
      setActiveFile(null);
      setText("");
      setIsLoading(false);
      setLoadError(null);
      setSaveState("idle");
      setSaveError(null);
      return;
    }

    const persistenceSession: PersistenceSession = {
      sessionId: loadSessionId,
      targetFileId: file.id,
      targetStoragePath: file.storagePath,
      persistedFile: file,
      lastSavedRevision: 0,
      lastSavedText: "",
      inFlight: null,
      pending: null,
    };
    persistenceSessionsRef.current.set(loadSessionId, persistenceSession);
    activeFileRef.current = file;
    persistedFileRef.current = file;
    textRef.current = "";
    lastSavedTextRef.current = "";
    revisionRef.current = 0;
    lastSavedRevisionRef.current = 0;
    setActiveFile(file);
    setText("");

    let cancelled = false;
    const loadRevision = revisionRef.current;
    setIsLoading(true);
    setLoadError(null);

    const loadDocument = async () => {
      try {
        await waitForPendingDocumentWrites(file.storagePath);
        if (
          cancelled ||
          loadSessionId !== sessionIdRef.current ||
          revisionRef.current !== loadRevision
        ) {
          return;
        }

        const bytes = await readTextDocumentBytes(file);
        if (
          cancelled ||
          loadSessionId !== sessionIdRef.current ||
          revisionRef.current !== loadRevision
        ) {
          return;
        }

        const nextText = new TextDecoder().decode(bytes);
        activeFileRef.current = file;
        persistedFileRef.current = file;
        textRef.current = nextText;
        lastSavedTextRef.current = nextText;
        revisionRef.current = 0;
        lastSavedRevisionRef.current = 0;
        persistenceSession.persistedFile = file;
        persistenceSession.lastSavedRevision = 0;
        persistenceSession.lastSavedText = nextText;
        setActiveFile(file);
        setText(nextText);
        setSaveState("idle");
        setSaveError(null);
      } catch (error) {
        if (cancelled || loadSessionId !== sessionIdRef.current) {
          return;
        }

        setLoadError(error instanceof Error ? error.message : "Unable to load document.");
      } finally {
        if (!cancelled && loadSessionId === sessionIdRef.current) {
          setIsLoading(false);
        }
      }
    };

    void loadDocument();

    return () => {
      cancelled = true;
      void queuePersist("save").catch(() => undefined);
    };
  }, [clearPendingAutoSave, fileReloadKey, queuePersist, reloadToken]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveNow().catch(() => undefined);
      }
    };

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      const hasPendingChanges =
        saveTimerRef.current !== null || textRef.current !== lastSavedTextRef.current;
      if (!hasPendingChanges) {
        return;
      }

      clearPendingAutoSave();
      void queuePersist("save").catch(() => undefined);
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [clearPendingAutoSave, queuePersist, saveNow]);

  return {
    file: activeFile,
    text,
    isLoading,
    loadError,
    saveState,
    saveError,
    txtUpgradeDialogOpen,
    isAttachingImage,
    updateText,
    saveNow,
    flushPendingSave,
    renameTitle,
    requestWysiwyg,
    cancelTxtUpgrade,
    confirmTxtUpgrade,
    attachImage,
    reload,
    getCanonicalSnapshot,
  };
};
