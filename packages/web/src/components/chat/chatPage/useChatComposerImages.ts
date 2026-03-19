import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
} from "react";
import type { file as LiveStoreFile } from "@/livestore/file";
import { fileEvents } from "@/livestore/file";
import {
  MAX_CHAT_IMAGE_ATTACHMENTS,
  createLibraryChatImageAttachment,
  createLocalChatImageAttachment,
  deleteChatImageAttachmentAsset,
  resolveChatImageAttachmentBlob,
  type ChatImageAttachment,
} from "@/lib/chat/chatImageAttachments";
import { saveRecording } from "@/lib/library/fileService";
import { hasImageItems } from "./helpers";
import type { ComposerNotice } from "./types";
import type {
  UseChatComposerImagesParams,
  UseChatComposerImagesResult,
} from "./useChatComposerImages.types";

export const useChatComposerImages = ({
  activeSessionId,
  activeImageRows,
  messages,
  store,
  updateMessage,
}: UseChatComposerImagesParams): UseChatComposerImagesResult => {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const composerImagesRef = useRef<ChatImageAttachment[]>([]);
  const dragDepthRef = useRef(0);
  const [composerImages, setComposerImages] = useState<ChatImageAttachment[]>(
    [],
  );
  const [imagePickerOpen, setImagePickerOpen] = useState(false);
  const [imagePickerQuery, setImagePickerQuery] = useState("");
  const [composerNotice, setComposerNotice] = useState<ComposerNotice | null>(
    null,
  );
  const [composerDragActive, setComposerDragActive] = useState(false);
  const [savingImageAttachmentIds, setSavingImageAttachmentIds] = useState<
    string[]
  >([]);

  const savingImageAttachmentIdSet = useMemo(() => {
    return new Set(savingImageAttachmentIds);
  }, [savingImageAttachmentIds]);

  useEffect(() => {
    composerImagesRef.current = composerImages;
  }, [composerImages]);

  useEffect(() => {
    if (!composerNotice) {
      return;
    }
    const timer = window.setTimeout(() => {
      setComposerNotice(null);
    }, 3200);

    return () => {
      window.clearTimeout(timer);
    };
  }, [composerNotice]);

  const cleanupComposerImages = useCallback(
    (attachments: ChatImageAttachment[]) => {
      void Promise.all(
        attachments.map(async (attachment) => {
          await deleteChatImageAttachmentAsset(attachment);
        }),
      );
    },
    [],
  );

  useEffect(() => {
    cleanupComposerImages(composerImagesRef.current);
    setComposerImages([]);
    setImagePickerOpen(false);
    setImagePickerQuery("");
    setComposerNotice(null);
    setComposerDragActive(false);
    dragDepthRef.current = 0;
  }, [activeSessionId, cleanupComposerImages]);

  useEffect(() => {
    return () => {
      cleanupComposerImages(composerImagesRef.current);
    };
  }, [cleanupComposerImages]);

  const imagePickerOptions = useMemo(() => {
    const normalizedQuery = imagePickerQuery.trim().toLowerCase();
    const selectedIds = new Set(
      composerImages
        .filter((attachment) => attachment.source === "library")
        .map((attachment) => attachment.fileId),
    );

    return activeImageRows
      .filter((file) => {
        if (!normalizedQuery) {
          return true;
        }
        return file.name.toLowerCase().includes(normalizedQuery);
      })
      .map((file) => ({
        file,
        isSelected: file.id ? selectedIds.has(file.id) : false,
      }))
      .slice(0, 40);
  }, [activeImageRows, composerImages, imagePickerQuery]);

  const remainingImageSlots = Math.max(
    0,
    MAX_CHAT_IMAGE_ATTACHMENTS - composerImages.length,
  );

  const closeImagePicker = useCallback(() => {
    setImagePickerOpen(false);
    setImagePickerQuery("");
    setComposerDragActive(false);
    dragDepthRef.current = 0;
  }, []);

  const pushComposerImages = useCallback(
    (nextAttachments: ChatImageAttachment[]) => {
      if (nextAttachments.length === 0) {
        return;
      }

      setComposerImages((prev) => {
        const remainingSlotsInState = MAX_CHAT_IMAGE_ATTACHMENTS - prev.length;
        if (remainingSlotsInState <= 0) {
          setComposerNotice({
            type: "error",
            text: `You can attach up to ${MAX_CHAT_IMAGE_ATTACHMENTS} images per message.`,
          });
          return prev;
        }

        const accepted = nextAttachments.slice(0, remainingSlotsInState);
        if (accepted.length < nextAttachments.length) {
          setComposerNotice({
            type: "info",
            text: `Only the first ${MAX_CHAT_IMAGE_ATTACHMENTS} images were kept.`,
          });
        }

        return [...prev, ...accepted];
      });
    },
    [],
  );

  const addLocalImagesToComposer = useCallback(
    async (files: File[]) => {
      if (!activeSessionId) {
        return;
      }

      const imageFiles = files.filter((file) => file.type.startsWith("image/"));
      if (imageFiles.length === 0) {
        setComposerNotice({
          type: "error",
          text: "Only image files can be attached.",
        });
        return;
      }

      const remainingSlotsInRef = Math.max(
        0,
        MAX_CHAT_IMAGE_ATTACHMENTS - composerImagesRef.current.length,
      );
      if (remainingSlotsInRef === 0) {
        setComposerNotice({
          type: "error",
          text: `You can attach up to ${MAX_CHAT_IMAGE_ATTACHMENTS} images per message.`,
        });
        return;
      }

      const filesToAttach = imageFiles.slice(0, remainingSlotsInRef);
      if (filesToAttach.length < imageFiles.length) {
        setComposerNotice({
          type: "info",
          text: `Only the first ${MAX_CHAT_IMAGE_ATTACHMENTS} images were kept.`,
        });
      }

      const nextAttachments: ChatImageAttachment[] = [];
      const errors: string[] = [];
      for (const file of filesToAttach) {
        try {
          const attachment = await createLocalChatImageAttachment(
            activeSessionId,
            file,
          );
          nextAttachments.push(attachment);
        } catch (error) {
          errors.push(error instanceof Error ? error.message : String(error));
        }
      }

      pushComposerImages(nextAttachments);
      setImagePickerOpen(true);

      if (errors.length > 0) {
        setComposerNotice({
          type: "error",
          text: errors[0] ?? "Could not attach that image.",
        });
      }
    },
    [activeSessionId, pushComposerImages],
  );

  const handleImageButtonClick = useCallback(
    (closeReferencePicker: () => void) => {
      if (imagePickerOpen) {
        closeImagePicker();
        return;
      }

      closeReferencePicker();
      setImagePickerOpen(true);
      setImagePickerQuery("");
    },
    [closeImagePicker, imagePickerOpen],
  );

  const handleOpenLocalImagePicker = useCallback(() => {
    imageInputRef.current?.click();
  }, []);

  const handleImageInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.currentTarget.files ?? []);
      event.currentTarget.value = "";
      void addLocalImagesToComposer(files);
    },
    [addLocalImagesToComposer],
  );

  const handleSelectLibraryImage = useCallback(
    (file: LiveStoreFile) => {
      if (
        composerImagesRef.current.some(
          (attachment) =>
            attachment.source === "library" && attachment.fileId === file.id,
        )
      ) {
        setComposerNotice({
          type: "info",
          text: `"${file.name}" is already attached.`,
        });
        return;
      }

      try {
        const attachment = createLibraryChatImageAttachment(file);
        pushComposerImages([attachment]);
        setImagePickerOpen(true);
      } catch (error) {
        setComposerNotice({
          type: "error",
          text:
            error instanceof Error
              ? error.message
              : "Could not attach that image.",
        });
      }
    },
    [pushComposerImages],
  );

  const handleRemoveComposerImage = useCallback(
    (attachmentId: string) => {
      const nextAttachment = composerImagesRef.current.find(
        (attachment) => attachment.id === attachmentId,
      );
      if (nextAttachment) {
        cleanupComposerImages([nextAttachment]);
      }

      setComposerImages((prev) =>
        prev.filter((attachment) => attachment.id !== attachmentId),
      );
    },
    [cleanupComposerImages],
  );

  const handleComposerPaste = useCallback(
    (event: ClipboardEvent<HTMLTextAreaElement>) => {
      const imageFiles = Array.from(event.clipboardData.items)
        .filter(
          (item) => item.kind === "file" && item.type.startsWith("image/"),
        )
        .map((item) => item.getAsFile())
        .filter((file): file is File => file !== null);

      if (imageFiles.length === 0) {
        return;
      }

      event.preventDefault();
      void addLocalImagesToComposer(imageFiles);
    },
    [addLocalImagesToComposer],
  );

  const handleComposerDragEnter = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (!hasImageItems(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    dragDepthRef.current += 1;
    setComposerDragActive(true);
    setImagePickerOpen(true);
  }, []);

  const handleComposerDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (!hasImageItems(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }, []);

  const handleComposerDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (!hasImageItems(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setComposerDragActive(false);
    }
  }, []);

  const handleComposerDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!hasImageItems(event.dataTransfer)) {
        return;
      }

      event.preventDefault();
      dragDepthRef.current = 0;
      setComposerDragActive(false);
      void addLocalImagesToComposer(Array.from(event.dataTransfer.files));
    },
    [addLocalImagesToComposer],
  );

  const handleSaveImageToLibrary = useCallback(
    async (messageId: string, attachmentId: string) => {
      const targetMessage = messages.find((message) => message.id === messageId);
      const targetAttachment = targetMessage?.attachments?.find(
        (attachment) => attachment.id === attachmentId,
      );

      if (
        !targetAttachment ||
        targetAttachment.source !== "local" ||
        targetAttachment.savedFileId
      ) {
        return;
      }

      setSavingImageAttachmentIds((prev) => [...prev, attachmentId]);

      try {
        const blob = await resolveChatImageAttachmentBlob(targetAttachment);
        if (!blob) {
          throw new Error(`Couldn't load "${targetAttachment.name}".`);
        }

        const result = await saveRecording({
          blob,
          name: targetAttachment.name,
          type: "image",
          mimeType: targetAttachment.mimeType,
          createdAt: Date.now(),
        });

        store.commit(
          fileEvents.fileCreated({
            id: result.id,
            name: result.meta.name,
            type: result.meta.type,
            mimeType: result.meta.mimeType,
            sizeBytes: result.meta.sizeBytes,
            storageType: result.meta.storageType,
            storagePath: result.meta.storagePath,
            parentId: result.meta.parentId ?? null,
            positionX: result.meta.positionX ?? null,
            positionY: result.meta.positionY ?? null,
            createdAt: new Date(result.meta.createdAt),
          }),
        );

        updateMessage(messageId, (message) => ({
          ...message,
          attachments: message.attachments?.map((attachment) =>
            attachment.id === attachmentId
              ? { ...attachment, savedFileId: result.id }
              : attachment,
          ),
        }));
        setComposerNotice({
          type: "success",
          text: `Saved "${targetAttachment.name}" to your library.`,
        });
      } catch (error) {
        setComposerNotice({
          type: "error",
          text:
            error instanceof Error
              ? error.message
              : "Could not save that image.",
        });
      } finally {
        setSavingImageAttachmentIds((prev) => {
          return prev.filter((id) => id !== attachmentId);
        });
      }
    },
    [messages, store, updateMessage],
  );

  return {
    composerImages,
    composerImagesRef,
    imagePickerOpen,
    imagePickerQuery,
    imagePickerOptions,
    imageInputRef,
    composerNotice,
    composerDragActive,
    remainingImageSlots,
    savingImageAttachmentIdSet,
    setComposerImages,
    setComposerNotice,
    setImagePickerQuery,
    setImagePickerOpen,
    closeImagePicker,
    handleImageButtonClick,
    handleOpenLocalImagePicker,
    handleImageInputChange,
    handleSelectLibraryImage,
    handleRemoveComposerImage,
    handleComposerPaste,
    handleComposerDragEnter,
    handleComposerDragOver,
    handleComposerDragLeave,
    handleComposerDrop,
    handleSaveImageToLibrary,
  };
};
