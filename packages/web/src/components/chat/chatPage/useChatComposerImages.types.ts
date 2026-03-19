import type {
  ChangeEvent,
  ClipboardEvent,
  Dispatch,
  DragEvent,
  MutableRefObject,
  RefObject,
  SetStateAction,
} from "react";
import type { file as LiveStoreFile } from "@/livestore/file";
import type { ChatMessage as AgentChatMessage } from "@/hooks/chat/useAgent";
import type { ChatImageAttachment } from "@/lib/chat/chatImageAttachments";
import type { ComposerNotice } from "./types";

export interface StoreLike {
  commit: (event: unknown) => void;
}

export interface UpdateMessageFn {
  (
    messageId: string,
    updater: (message: AgentChatMessage) => AgentChatMessage,
  ): void;
}

export interface UseChatComposerImagesParams {
  activeSessionId: string;
  activeImageRows: LiveStoreFile[];
  messages: AgentChatMessage[];
  store: StoreLike;
  updateMessage: UpdateMessageFn;
}

export interface ImagePickerOption {
  file: LiveStoreFile;
  isSelected: boolean;
}

export interface UseChatComposerImagesResult {
  composerImages: ChatImageAttachment[];
  composerImagesRef: MutableRefObject<ChatImageAttachment[]>;
  imagePickerOpen: boolean;
  imagePickerQuery: string;
  imagePickerOptions: ImagePickerOption[];
  imageInputRef: RefObject<HTMLInputElement | null>;
  composerNotice: ComposerNotice | null;
  composerDragActive: boolean;
  remainingImageSlots: number;
  savingImageAttachmentIdSet: Set<string>;
  setComposerImages: Dispatch<SetStateAction<ChatImageAttachment[]>>;
  setComposerNotice: Dispatch<SetStateAction<ComposerNotice | null>>;
  setImagePickerQuery: Dispatch<SetStateAction<string>>;
  setImagePickerOpen: Dispatch<SetStateAction<boolean>>;
  closeImagePicker: () => void;
  handleImageButtonClick: (closeReferencePicker: () => void) => void;
  handleOpenLocalImagePicker: () => void;
  handleImageInputChange: (event: ChangeEvent<HTMLInputElement>) => void;
  handleSelectLibraryImage: (file: LiveStoreFile) => void;
  handleRemoveComposerImage: (attachmentId: string) => void;
  handleComposerPaste: (event: ClipboardEvent<HTMLTextAreaElement>) => void;
  handleComposerDragEnter: (event: DragEvent<HTMLDivElement>) => void;
  handleComposerDragOver: (event: DragEvent<HTMLDivElement>) => void;
  handleComposerDragLeave: (event: DragEvent<HTMLDivElement>) => void;
  handleComposerDrop: (event: DragEvent<HTMLDivElement>) => void;
  handleSaveImageToLibrary: (
    messageId: string,
    attachmentId: string,
  ) => Promise<void>;
}
