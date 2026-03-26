import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import type { PromptSegment } from "@memora/ai-core";
import type { file as LiveStoreFile } from "@/livestore/file";
import type { folder as LiveStoreFolder } from "@/livestore/folder";
import type { ReferencePickerOption } from "@/components/chat/ReferencePicker";
import type { ResolvedReferenceScope } from "@/lib/chat/tools";
import type { ChatSessionReference } from "@/lib/chat/chatSessionStorage";
import {
  buildReferenceScopePrompt,
  buildReferenceKey,
  MAX_REFERENCED_FILES,
  REFERENCE_MENTION_PATTERN,
  removeTrailingReferenceMention,
  resolveReferenceScope,
  sanitizeActiveReferences,
} from "./helpers";
import type { ReferencePickerSource } from "./types";

interface UseChatReferencesParams {
  activeSessionId: string;
  activeReferences: ChatSessionReference[];
  setActiveReferences: Dispatch<SetStateAction<ChatSessionReference[]>>;
  activeFileRows: LiveStoreFile[];
  activeFolderRows: LiveStoreFolder[];
  inputRef: RefObject<HTMLTextAreaElement | null>;
  onCloseImagePicker: () => void;
}

interface UseChatReferencesResult {
  activeFileById: Map<string, LiveStoreFile>;
  activeFolderById: Map<string, LiveStoreFolder>;
  getReferenceScope: () => ResolvedReferenceScope;
  referencePromptSegment: PromptSegment;
  resolvedReferenceScope: ResolvedReferenceScope;
  referencePickerOpen: boolean;
  referencePickerQuery: string;
  referencePickerSource: ReferencePickerSource;
  referencePickerOptions: ReferencePickerOption[];
  referenceNotice: string | null;
  setReferencePickerQuery: Dispatch<SetStateAction<string>>;
  closeReferencePicker: () => void;
  handleSelectReference: (option: ReferencePickerOption) => void;
  handleRemoveReference: (reference: ChatSessionReference) => void;
  handleClearReferences: () => void;
  handleReferenceButtonClick: () => void;
  handleComposerInputValueChange: (value: string) => void;
  prepareReferenceScopeForTurn: () => void;
}

export const useChatReferences = ({
  activeSessionId,
  activeReferences,
  setActiveReferences,
  activeFileRows,
  activeFolderRows,
  inputRef,
  onCloseImagePicker,
}: UseChatReferencesParams): UseChatReferencesResult => {
  const [referencePickerOpen, setReferencePickerOpen] = useState(false);
  const [referencePickerQuery, setReferencePickerQuery] = useState("");
  const [referencePickerSource, setReferencePickerSource] = useState<ReferencePickerSource>(null);
  const [referenceNotice, setReferenceNotice] = useState<string | null>(null);
  const activeFileById = useMemo(
    () => new Map(activeFileRows.map((file) => [file.id, file])),
    [activeFileRows],
  );
  const activeFolderById = useMemo(
    () => new Map(activeFolderRows.map((folder) => [folder.id, folder])),
    [activeFolderRows],
  );
  const resolvedReferenceScope = useMemo(
    () => resolveReferenceScope(activeReferences, activeFileRows, activeFolderRows),
    [activeFileRows, activeFolderRows, activeReferences],
  );
  const referenceScopeRef = useRef<ResolvedReferenceScope>(resolvedReferenceScope);
  useEffect(() => {
    referenceScopeRef.current = resolvedReferenceScope;
  }, [resolvedReferenceScope]);

  const getReferenceScope = useCallback(() => referenceScopeRef.current, []);

  const referencePromptSegment = useMemo<PromptSegment>(() => {
    return {
      id: "reference-scope",
      priority: 90,
      content: () => buildReferenceScopePrompt(referenceScopeRef.current),
    };
  }, []);

  const closeReferencePicker = useCallback(() => {
    setReferencePickerOpen(false);
    setReferencePickerQuery("");
    setReferencePickerSource(null);
  }, []);

  useEffect(() => {
    setActiveReferences((prev) => {
      if (prev.length > 0 && activeFileById.size === 0 && activeFolderById.size === 0) {
        return prev;
      }
      const next = sanitizeActiveReferences(prev, activeFileById, activeFolderById);
      if (next.length !== prev.length) {
        setReferenceNotice("Some references were removed because they are no longer available.");
      }
      return next;
    });
  }, [activeFileById, activeFolderById, setActiveReferences]);

  useEffect(() => {
    if (!referenceNotice) {
      return;
    }
    const timer = window.setTimeout(() => {
      setReferenceNotice(null);
    }, 3200);
    return () => {
      window.clearTimeout(timer);
    };
  }, [referenceNotice]);

  useEffect(() => {
    queueMicrotask(() => {
      closeReferencePicker();
      setReferenceNotice(null);
    });
  }, [activeSessionId, closeReferencePicker]);

  const referencePickerOptions = useMemo<ReferencePickerOption[]>(() => {
    const normalizedQuery = referencePickerQuery.trim().toLowerCase();
    const include = (name: string) => {
      return normalizedQuery.length === 0 || name.toLowerCase().includes(normalizedQuery);
    };

    const selectedKeys = new Set(activeReferences.map((reference) => buildReferenceKey(reference)));

    const folderOptions = activeFolderRows
      .filter((folder) => include(folder.name))
      .map((folder) => ({
        type: "folder" as const,
        id: folder.id,
        name: folder.name,
        isSelected: selectedKeys.has(`folder:${folder.id}`),
      }));

    const fileOptions = activeFileRows
      .filter((file) => include(file.name))
      .map((file) => ({
        type: "file" as const,
        id: file.id,
        name: file.name,
        isSelected: selectedKeys.has(`file:${file.id}`),
      }));

    return [...folderOptions, ...fileOptions].slice(0, 80);
  }, [activeFileRows, activeFolderRows, activeReferences, referencePickerQuery]);

  const handleSelectReference = useCallback(
    (option: ReferencePickerOption) => {
      setActiveReferences((prev) => {
        const key = `${option.type}:${option.id}`;
        if (prev.some((reference) => buildReferenceKey(reference) === key)) {
          return prev;
        }
        return [
          ...prev,
          {
            type: option.type,
            id: option.id,
            name: option.name,
          },
        ];
      });

      if (referencePickerSource === "mention" && inputRef.current) {
        inputRef.current.value = removeTrailingReferenceMention(inputRef.current.value);
      }
      closeReferencePicker();
      inputRef.current?.focus();
    },
    [closeReferencePicker, inputRef, referencePickerSource, setActiveReferences],
  );

  const handleRemoveReference = useCallback(
    (reference: ChatSessionReference) => {
      setActiveReferences((prev) =>
        prev.filter((item) => !(item.type === reference.type && item.id === reference.id)),
      );
    },
    [setActiveReferences],
  );

  const handleClearReferences = useCallback(() => {
    setActiveReferences([]);
  }, [setActiveReferences]);

  const handleReferenceButtonClick = useCallback(() => {
    if (referencePickerOpen && referencePickerSource === "button") {
      closeReferencePicker();
      inputRef.current?.focus();
      return;
    }
    onCloseImagePicker();
    setReferencePickerOpen(true);
    setReferencePickerQuery("");
    setReferencePickerSource("button");
  }, [
    closeReferencePicker,
    inputRef,
    onCloseImagePicker,
    referencePickerOpen,
    referencePickerSource,
  ]);

  const handleComposerInputValueChange = useCallback(
    (value: string) => {
      const mentionMatch = value.match(REFERENCE_MENTION_PATTERN);
      if (mentionMatch) {
        onCloseImagePicker();
        setReferencePickerOpen(true);
        setReferencePickerSource("mention");
        setReferencePickerQuery(mentionMatch[1] ?? "");
        return;
      }
      if (referencePickerSource === "mention") {
        closeReferencePicker();
      }
    },
    [closeReferencePicker, onCloseImagePicker, referencePickerSource],
  );

  const prepareReferenceScopeForTurn = useCallback(() => {
    const validReferences = sanitizeActiveReferences(
      activeReferences,
      activeFileById,
      activeFolderById,
    );
    if (validReferences.length !== activeReferences.length) {
      setActiveReferences(validReferences);
      setReferenceNotice("Some references were removed because they are no longer available.");
    }

    const nextScope = resolveReferenceScope(validReferences, activeFileRows, activeFolderRows);
    referenceScopeRef.current = nextScope;
    if (nextScope.truncated) {
      setReferenceNotice(
        `Reference scope was limited to ${MAX_REFERENCED_FILES} files for this request.`,
      );
    }
  }, [
    activeFileById,
    activeFileRows,
    activeFolderById,
    activeFolderRows,
    activeReferences,
    setActiveReferences,
  ]);

  return {
    activeFileById,
    activeFolderById,
    getReferenceScope,
    referencePromptSegment,
    resolvedReferenceScope,
    referencePickerOpen,
    referencePickerQuery,
    referencePickerSource,
    referencePickerOptions,
    referenceNotice,
    setReferencePickerQuery,
    closeReferencePicker,
    handleSelectReference,
    handleRemoveReference,
    handleClearReferences,
    handleReferenceButtonClick,
    handleComposerInputValueChange,
    prepareReferenceScopeForTurn,
  };
};
