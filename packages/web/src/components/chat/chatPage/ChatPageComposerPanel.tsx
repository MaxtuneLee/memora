import {
  ArrowUpIcon,
  FileTextIcon,
  FolderSimpleIcon,
  ImageIcon,
  PlusIcon,
  SlidersHorizontalIcon,
  StopIcon,
  XIcon,
} from "@phosphor-icons/react";
import { AnimatePresence } from "motion/react";
import { ChatContextUsage } from "@/components/chat/ChatContextUsage";
import {
  ReferencePicker,
  type ReferencePickerOption,
} from "@/components/chat/ReferencePicker";
import { StatusBar } from "@/components/chat/StatusBar";
import type { ChatMessage as AgentChatMessage, AgentStatus } from "@/hooks/chat/useAgent";
import type { file as LiveStoreFile } from "@/livestore/file";
import type { ChatImageAttachment } from "@/lib/chat/chatImageAttachments";
import type { ResolvedReferenceScope } from "@/lib/chat/tools";
import type { ChatSessionReference } from "@/lib/chat/chatSessionStorage";
import { ChatPageComposerAttachments } from "./ChatPageComposerAttachments";
import type { ComposerNotice, ReferencePickerSource } from "./types";

interface ChatPageComposerPanelProps {
  composerFadeHeight: number;
  composerOverlayRef: React.RefObject<HTMLDivElement | null>;
  isStreaming: boolean;
  status: AgentStatus;
  memoryUpdatedNotice: boolean;
  composerNotice: ComposerNotice | null;
  referenceNotice: string | null;
  composerImages: ChatImageAttachment[];
  remainingImageSlots: number;
  sessionsReady: boolean;
  imagePickerOpen: boolean;
  imagePickerQuery: string;
  imagePickerOptions: Array<{
    file: LiveStoreFile;
    isSelected: boolean;
  }>;
  activeReferences: ChatSessionReference[];
  resolvedReferenceScope: ResolvedReferenceScope;
  referencePickerOpen: boolean;
  referencePickerQuery: string;
  referencePickerOptions: ReferencePickerOption[];
  referencePickerSource: ReferencePickerSource;
  imageInputRef: React.RefObject<HTMLInputElement | null>;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  composerDragActive: boolean;
  isPreparingTurn: boolean;
  composerTextValue: string;
  canSubmitMessage: boolean;
  messages: AgentChatMessage[];
  selectedModelInfo: Parameters<typeof ChatContextUsage>[0]["model"];
  selectedModel: string;
  onOpenSettings: (section?: string) => void;
  onDismissMemoryNotice: () => void;
  onOpenLocalImagePicker: () => void;
  onToggleImageLibrary: () => void;
  onCloseImagePicker: () => void;
  onImagePickerQueryChange: (value: string) => void;
  onSelectLibraryImage: (file: LiveStoreFile) => void;
  onClearReferences: () => void;
  onRemoveReference: (reference: ChatSessionReference) => void;
  onReferencePickerQueryChange: (value: string) => void;
  onSelectReference: (option: ReferencePickerOption) => void;
  onImageInputChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onSubmit: (event: React.FormEvent) => void;
  onDragEnter: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragOver: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave: (event: React.DragEvent<HTMLDivElement>) => void;
  onDrop: (event: React.DragEvent<HTMLDivElement>) => void;
  onInputChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onPaste: (event: React.ClipboardEvent<HTMLTextAreaElement>) => void;
  onCompositionStart: () => void;
  onCompositionEnd: () => void;
  onCreateSession: () => void;
  onImageButtonClick: () => void;
  onReferenceButtonClick: () => void;
  onAbort: () => void;
  onRemoveComposerImage: (attachmentId: string) => void;
}

export const ChatPageComposerPanel = ({
  composerFadeHeight,
  composerOverlayRef,
  isStreaming,
  status,
  memoryUpdatedNotice,
  composerNotice,
  referenceNotice,
  composerImages,
  remainingImageSlots,
  sessionsReady,
  imagePickerOpen,
  imagePickerQuery,
  imagePickerOptions,
  activeReferences,
  resolvedReferenceScope,
  referencePickerOpen,
  referencePickerQuery,
  referencePickerOptions,
  imageInputRef,
  inputRef,
  composerDragActive,
  isPreparingTurn,
  composerTextValue,
  canSubmitMessage,
  messages,
  selectedModelInfo,
  selectedModel,
  onOpenSettings,
  onDismissMemoryNotice,
  onOpenLocalImagePicker,
  onToggleImageLibrary,
  onCloseImagePicker,
  onImagePickerQueryChange,
  onSelectLibraryImage,
  onClearReferences,
  onRemoveReference,
  onReferencePickerQueryChange,
  onSelectReference,
  onImageInputChange,
  onSubmit,
  onDragEnter,
  onDragOver,
  onDragLeave,
  onDrop,
  onInputChange,
  onKeyDown,
  onPaste,
  onCompositionStart,
  onCompositionEnd,
  onCreateSession,
  onImageButtonClick,
  onReferenceButtonClick,
  onAbort,
  onRemoveComposerImage,
}: ChatPageComposerPanelProps) => {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10">
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-0 bg-gradient-to-t from-[#fffbf2] via-[#fffbf2]/90 to-transparent"
        style={{ height: composerFadeHeight }}
      />
      <div ref={composerOverlayRef} className="px-4 pb-6 pt-16">
        <div className="pointer-events-auto mx-auto max-w-2xl">
          <AnimatePresence>
            {isStreaming && status.type !== "idle" && status.type !== "generating" && (
              <StatusBar status={status} />
            )}
          </AnimatePresence>
          {memoryUpdatedNotice && (
            <div className="mb-2 flex items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
              <span>
                Memory updated. Review or delete it in Settings &gt; Memory.
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onOpenSettings("memory")}
                  className="font-semibold text-emerald-800 transition hover:text-emerald-900"
                >
                  Open settings
                </button>
                <button
                  type="button"
                  onClick={onDismissMemoryNotice}
                  className="text-emerald-600 transition hover:text-emerald-800"
                  aria-label="Dismiss memory update notice"
                >
                  <XIcon className="size-3.5" />
                </button>
              </div>
            </div>
          )}
          {composerNotice && (
            <div
              className={`mb-2 rounded-xl border px-3 py-2 text-xs ${
                composerNotice.type === "error"
                  ? "border-rose-200 bg-rose-50 text-rose-700"
                  : composerNotice.type === "success"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-blue-200 bg-blue-50 text-blue-700"
              }`}
            >
              {composerNotice.text}
            </div>
          )}
          {referenceNotice && (
            <p className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              {referenceNotice}
            </p>
          )}
          <ChatPageComposerAttachments
            composerImages={composerImages}
            remainingImageSlots={remainingImageSlots}
            sessionsReady={sessionsReady}
            imagePickerOpen={imagePickerOpen}
            imagePickerQuery={imagePickerQuery}
            imagePickerOptions={imagePickerOptions}
            onOpenLocalImagePicker={onOpenLocalImagePicker}
            onToggleImageLibrary={onToggleImageLibrary}
            onCloseImagePicker={onCloseImagePicker}
            onImagePickerQueryChange={onImagePickerQueryChange}
            onSelectLibraryImage={onSelectLibraryImage}
            onRemoveComposerImage={onRemoveComposerImage}
          />
          {activeReferences.length > 0 && (
            <div className="relative z-10 mb-2 rounded-xl border border-zinc-200 bg-white/80 px-3 py-2">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-zinc-600">
                  References
                  <span className="ml-1 text-zinc-400">
                    ({activeReferences.length})
                  </span>
                </p>
                <div className="flex items-center gap-2">
                  {resolvedReferenceScope.isActive && (
                    <span className="text-[11px] text-zinc-500">
                      Scoped files: {resolvedReferenceScope.fileIds.length}
                      {resolvedReferenceScope.truncated
                        ? ` / ${resolvedReferenceScope.totalResolvedFiles}`
                        : ""}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={onClearReferences}
                    className="text-xs text-zinc-500 transition hover:text-zinc-700"
                  >
                    Clear all
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {activeReferences.map((reference) => (
                  <span
                    key={`${reference.type}:${reference.id}`}
                    className="inline-flex max-w-full items-center gap-1 rounded-full border border-zinc-200 bg-zinc-100 px-2 py-1 text-xs text-zinc-700"
                  >
                    {reference.type === "folder" ? (
                      <FolderSimpleIcon className="size-3.5 shrink-0 text-zinc-500" />
                    ) : (
                      <FileTextIcon className="size-3.5 shrink-0 text-zinc-500" />
                    )}
                    <span className="truncate">{reference.name}</span>
                    <button
                      type="button"
                      onClick={() => onRemoveReference(reference)}
                      className="inline-flex size-4 items-center justify-center rounded-full text-zinc-400 transition hover:bg-zinc-200 hover:text-zinc-700"
                      aria-label={`Remove reference ${reference.name}`}
                    >
                      <XIcon className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}
          <ReferencePicker
            open={referencePickerOpen}
            query={referencePickerQuery}
            options={referencePickerOptions}
            onQueryChange={onReferencePickerQueryChange}
            onSelect={onSelectReference}
            onClose={onCloseImagePicker}
          />
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={onImageInputChange}
          />
          <form onSubmit={onSubmit}>
            <div
              className={`group relative rounded-xl border bg-white/90 shadow-[0_24px_60px_-28px_rgba(24,24,27,0.35)] backdrop-blur-xl transition-colors focus-within:border-zinc-300 focus-within:shadow-[0_28px_70px_-28px_rgba(24,24,27,0.42)] ${
                composerDragActive
                  ? "border-zinc-900 ring-2 ring-zinc-900/10"
                  : "border-zinc-200/80"
              }`}
              onDragEnter={onDragEnter}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
            >
              {composerDragActive && (
                <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl border border-dashed border-zinc-900/20 bg-zinc-900/5 px-6 text-center text-sm font-medium text-zinc-700">
                  Drop images here to attach them
                </div>
              )}
              <textarea
                ref={inputRef}
                onChange={onInputChange}
                onKeyDown={onKeyDown}
                onPaste={onPaste}
                onCompositionStart={onCompositionStart}
                onCompositionEnd={onCompositionEnd}
                placeholder="Message Memora..."
                disabled={isPreparingTurn}
                rows={1}
                className="w-full resize-none bg-transparent px-4 pt-3.5 pb-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400"
              />
              <div className="flex items-center justify-between px-3 pb-2.5">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={onCreateSession}
                    disabled={!sessionsReady || isPreparingTurn}
                    className="flex size-7 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 disabled:cursor-not-allowed disabled:opacity-50"
                    title="New session"
                  >
                    <PlusIcon className="size-4" weight="bold" />
                  </button>
                  <button
                    type="button"
                    onClick={onImageButtonClick}
                    disabled={!sessionsReady || isPreparingTurn}
                    className={`flex size-7 items-center justify-center rounded-lg transition-colors ${
                      imagePickerOpen || composerImages.length > 0
                        ? "bg-zinc-900 text-white"
                        : "text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
                    } disabled:cursor-not-allowed disabled:opacity-50`}
                    title="Attach images"
                  >
                    <ImageIcon className="size-4" weight="bold" />
                  </button>
                  <button
                    type="button"
                    onClick={onReferenceButtonClick}
                    disabled={!sessionsReady || isPreparingTurn}
                    className={`flex size-7 items-center justify-center rounded-lg transition-colors ${
                      referencePickerOpen
                        ? "bg-zinc-900 text-white"
                        : "text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
                    } disabled:cursor-not-allowed disabled:opacity-50`}
                    title="Reference files or folders"
                  >
                    <FileTextIcon className="size-4" weight="bold" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenSettings("ai-provider")}
                    className="flex size-7 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600"
                  >
                    <SlidersHorizontalIcon className="size-4" />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <ChatContextUsage
                    composerImageCount={composerImages.length}
                    composerText={composerTextValue}
                    messages={messages}
                    model={selectedModelInfo}
                    referenceCount={activeReferences.length}
                    resolvedReferenceScope={resolvedReferenceScope}
                    selectedModelId={selectedModel}
                  />
                  {isStreaming ? (
                    <button
                      type="button"
                      onClick={onAbort}
                      className="flex size-7 items-center justify-center rounded-full bg-zinc-900 text-white transition-all hover:bg-zinc-800"
                    >
                      <StopIcon className="size-3.5" weight="fill" />
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={!canSubmitMessage}
                      className={`flex size-7 items-center justify-center rounded-full transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
                        canSubmitMessage
                          ? "bg-zinc-900 text-white hover:bg-zinc-800"
                          : "bg-zinc-200 text-zinc-400"
                      }`}
                    >
                      <ArrowUpIcon className="size-3.5" weight="bold" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
