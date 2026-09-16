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
import * as stylex from "@stylexjs/stylex";
import { ChatContextUsage } from "@/components/chat/ChatContextUsage";
import { ChatImageAttachmentGallery } from "@/components/chat/ChatImageAttachmentGallery";
import { ReferencePicker, type ReferencePickerOption } from "@/components/chat/ReferencePicker";
import { StatusBar } from "@/components/chat/StatusBar";
import type { ChatMessage as AgentChatMessage, AgentStatus } from "@/hooks/chat/useAgent";
import type { file as LiveStoreFile } from "@/livestore/file";
import type { ChatImageAttachment } from "@/lib/chat/chatImageAttachments";
import type { ResolvedReferenceScope } from "@/lib/chat/tools";
import type { ChatSessionReference } from "@/lib/chat/chatSessionStorage";
import { ChatPageComposerAttachments } from "./ChatPageComposerAttachments";
import type { ComposerNotice, ReferencePickerSource } from "./types";

const styles = stylex.create({
  root: { bottom: 0, insetInline: 0, pointerEvents: "none", position: "absolute", zIndex: 10 },
  fade: {
    backgroundImage: "linear-gradient(to top, #fffbf2, rgb(255 251 242 / 0.9), transparent)",
    bottom: 0,
    insetInline: 0,
    pointerEvents: "none",
    position: "absolute",
    zIndex: 0,
  },
  overlay: { paddingBlock: 64, paddingBottom: 24, paddingInline: 16 },
  composerArea: { marginInline: "auto", maxWidth: 672, pointerEvents: "auto" },
  notice: {
    border: "1px solid #bfdbfe",
    borderRadius: 12,
    color: "#1d4ed8",
    fontSize: 12,
    marginBottom: 8,
    paddingBlock: 8,
    paddingInline: 12,
  },
  noticeError: { backgroundColor: "#fff1f2", borderColor: "#fecdd3", color: "#be123c" },
  noticeSuccess: { backgroundColor: "#ecfdf5", borderColor: "#bbf7d0", color: "#047857" },
  memoryNotice: {
    alignItems: "center",
    backgroundColor: "#ecfdf5",
    border: "1px solid #bbf7d0",
    borderRadius: 8,
    color: "#047857",
    display: "flex",
    fontSize: 12,
    gap: 12,
    justifyContent: "space-between",
    marginBottom: 8,
    paddingBlock: 8,
    paddingInline: 12,
  },
  inlineActions: { alignItems: "center", display: "flex", gap: 8 },
  memoryAction: {
    color: "#065f46",
    fontWeight: 600,
    transition: "color 150ms",
    ":hover": { color: "#064e3b" },
  },
  dismissAction: { color: "#059669", transition: "color 150ms", ":hover": { color: "#047857" } },
  iconSmall: { height: 14, width: 14 },
  referenceNotice: {
    backgroundColor: "#fffbeb",
    border: "1px solid #fde68a",
    borderRadius: 8,
    color: "#b45309",
    fontSize: 12,
    marginBottom: 8,
    paddingBlock: 8,
    paddingInline: 12,
  },
  references: {
    backgroundColor: "rgb(255 255 255 / 0.8)",
    border: "1px solid #e4e4e7",
    borderRadius: 12,
    marginBottom: 8,
    paddingBlock: 8,
    paddingInline: 12,
    position: "relative",
    zIndex: 10,
  },
  referencesHeader: {
    alignItems: "center",
    display: "flex",
    gap: 8,
    justifyContent: "space-between",
    marginBottom: 6,
  },
  referenceTitle: { color: "#52525b", fontSize: 12, fontWeight: 500 },
  referenceCount: { color: "#a1a1aa", marginLeft: 4 },
  scopeText: { color: "#71717a", fontSize: 11 },
  clearButton: {
    color: "#71717a",
    fontSize: 12,
    transition: "color 150ms",
    ":hover": { color: "#3f3f46" },
  },
  referenceList: { display: "flex", flexWrap: "wrap", gap: 6 },
  referenceChip: {
    alignItems: "center",
    backgroundColor: "#f4f4f5",
    border: "1px solid #e4e4e7",
    borderRadius: 9999,
    color: "#3f3f46",
    display: "inline-flex",
    fontSize: 12,
    gap: 4,
    maxWidth: "100%",
    paddingBlock: 4,
    paddingInline: 8,
  },
  referenceIcon: { color: "#71717a", flexShrink: 0, height: 14, width: 14 },
  truncate: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  removeReference: {
    alignItems: "center",
    borderRadius: 9999,
    color: "#a1a1aa",
    display: "inline-flex",
    height: 16,
    justifyContent: "center",
    transition: "color 150ms, background-color 150ms",
    width: 16,
    ":hover": { backgroundColor: "#e4e4e7", color: "#3f3f46" },
  },
  hidden: { display: "none" },
  composer: {
    backdropFilter: "blur(24px)",
    backgroundColor: "rgb(255 255 255 / 0.9)",
    border: "1px solid rgb(228 228 231 / 0.8)",
    borderRadius: 12,
    boxShadow: "0 24px 60px -28px rgb(24 24 27 / 0.35)",
    position: "relative",
    transition: "border-color 150ms, box-shadow 150ms",
  },
  composerDragging: { borderColor: "#18181b", boxShadow: "0 0 0 2px rgb(24 24 27 / 0.1)" },
  dragOverlay: {
    alignItems: "center",
    backgroundColor: "rgb(24 24 27 / 0.05)",
    border: "1px dashed rgb(24 24 27 / 0.2)",
    borderRadius: 12,
    color: "#3f3f46",
    display: "flex",
    fontSize: 14,
    fontWeight: 500,
    inset: 0,
    justifyContent: "center",
    paddingInline: 24,
    pointerEvents: "none",
    position: "absolute",
    textAlign: "center",
    zIndex: 10,
  },
  attachments: { paddingBlock: 12, paddingBottom: 4, paddingInline: 12 },
  textArea: {
    backgroundColor: "transparent",
    color: "#18181b",
    fontSize: 14,
    maxHeight: 180,
    outline: "none",
    overflowY: "auto",
    paddingBottom: 8,
    paddingInline: 16,
    resize: "none",
    width: "100%",
    "::placeholder": { color: "#a1a1aa" },
  },
  textAreaWithImages: { paddingTop: 8 },
  textAreaWithoutImages: { paddingTop: 14 },
  composerFooter: {
    alignItems: "center",
    display: "flex",
    justifyContent: "space-between",
    paddingBottom: 10,
    paddingInline: 12,
  },
  toolGroup: { alignItems: "center", display: "flex", gap: 4 },
  toolButton: {
    alignItems: "center",
    borderRadius: 8,
    color: "#a1a1aa",
    display: "flex",
    height: 28,
    justifyContent: "center",
    transition: "color 150ms, background-color 150ms",
    width: 28,
    ":hover": { backgroundColor: "#f4f4f5", color: "#52525b" },
    ":disabled": { cursor: "not-allowed", opacity: 0.5 },
  },
  toolButtonActive: { backgroundColor: "#18181b", color: "white" },
  icon: { height: 16, width: 16 },
  submitGroup: { alignItems: "center", display: "flex", gap: 8 },
  roundButton: {
    alignItems: "center",
    backgroundColor: "#18181b",
    borderRadius: 9999,
    color: "white",
    display: "flex",
    height: 28,
    justifyContent: "center",
    transition: "all 150ms",
    width: 28,
    ":hover": { backgroundColor: "#27272a" },
  },
  submitInactive: { backgroundColor: "#e4e4e7", color: "#a1a1aa" },
  disabled: { cursor: "not-allowed", opacity: 0.5 },
});

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
  onOpenSettings: (section?: string) => void;
  onDismissMemoryNotice: () => void;
  onOpenLocalImagePicker: () => void;
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
  onOpenSettings,
  onDismissMemoryNotice,
  onOpenLocalImagePicker,
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
    <div {...stylex.props(styles.root)}>
      <div {...stylex.props(styles.fade)} style={{ height: composerFadeHeight }} />
      <div ref={composerOverlayRef} {...stylex.props(styles.overlay)}>
        <div {...stylex.props(styles.composerArea)}>
          <AnimatePresence>
            {isStreaming && status.type !== "idle" && status.type !== "generating" && (
              <StatusBar status={status} />
            )}
          </AnimatePresence>
          {memoryUpdatedNotice && (
            <div {...stylex.props(styles.memoryNotice)}>
              <span>Memory updated. Review or delete it in Settings &gt; Memory.</span>
              <div {...stylex.props(styles.inlineActions)}>
                <button
                  type="button"
                  onClick={() => onOpenSettings("memory")}
                  {...stylex.props(styles.memoryAction)}
                >
                  Open settings
                </button>
                <button
                  type="button"
                  onClick={onDismissMemoryNotice}
                  {...stylex.props(styles.dismissAction)}
                  aria-label="Dismiss memory update notice"
                >
                  <XIcon className={stylex.props(styles.iconSmall).className} />
                </button>
              </div>
            </div>
          )}
          {composerNotice && (
            <div
              {...stylex.props(
                styles.notice,
                composerNotice.type === "error"
                  ? styles.noticeError
                  : composerNotice.type === "success"
                    ? styles.noticeSuccess
                    : null,
              )}
            >
              {composerNotice.text}
            </div>
          )}
          {referenceNotice && <p {...stylex.props(styles.referenceNotice)}>{referenceNotice}</p>}
          <ChatPageComposerAttachments
            remainingImageSlots={remainingImageSlots}
            sessionsReady={sessionsReady}
            imagePickerOpen={imagePickerOpen}
            imagePickerQuery={imagePickerQuery}
            imagePickerOptions={imagePickerOptions}
            onOpenLocalImagePicker={onOpenLocalImagePicker}
            onCloseImagePicker={onCloseImagePicker}
            onImagePickerQueryChange={onImagePickerQueryChange}
            onSelectLibraryImage={onSelectLibraryImage}
          />
          {activeReferences.length > 0 && (
            <div {...stylex.props(styles.references)}>
              <div {...stylex.props(styles.referencesHeader)}>
                <p {...stylex.props(styles.referenceTitle)}>
                  References
                  <span {...stylex.props(styles.referenceCount)}>({activeReferences.length})</span>
                </p>
                <div {...stylex.props(styles.inlineActions)}>
                  {resolvedReferenceScope.isActive && (
                    <span {...stylex.props(styles.scopeText)}>
                      Scoped files: {resolvedReferenceScope.fileIds.length}
                      {resolvedReferenceScope.truncated
                        ? ` / ${resolvedReferenceScope.totalResolvedFiles}`
                        : ""}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={onClearReferences}
                    {...stylex.props(styles.clearButton)}
                  >
                    Clear all
                  </button>
                </div>
              </div>
              <div {...stylex.props(styles.referenceList)}>
                {activeReferences.map((reference) => (
                  <span
                    key={`${reference.type}:${reference.id}`}
                    {...stylex.props(styles.referenceChip)}
                  >
                    {reference.type === "folder" ? (
                      <FolderSimpleIcon className={stylex.props(styles.referenceIcon).className} />
                    ) : (
                      <FileTextIcon className={stylex.props(styles.referenceIcon).className} />
                    )}
                    <span {...stylex.props(styles.truncate)}>{reference.name}</span>
                    <button
                      type="button"
                      onClick={() => onRemoveReference(reference)}
                      {...stylex.props(styles.removeReference)}
                      aria-label={`Remove reference ${reference.name}`}
                    >
                      <XIcon className={stylex.props(styles.iconSmall).className} />
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
            {...stylex.props(styles.hidden)}
            onChange={onImageInputChange}
          />
          <form onSubmit={onSubmit}>
            <div
              {...stylex.props(styles.composer, composerDragActive && styles.composerDragging)}
              onDragEnter={onDragEnter}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
            >
              {composerDragActive && (
                <div {...stylex.props(styles.dragOverlay)}>Drop images here to attach them</div>
              )}
              {composerImages.length > 0 && (
                <div {...stylex.props(styles.attachments)}>
                  <ChatImageAttachmentGallery
                    attachments={composerImages}
                    tone="composer"
                    onRemove={onRemoveComposerImage}
                  />
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
                {...stylex.props(
                  styles.textArea,
                  composerImages.length > 0
                    ? styles.textAreaWithImages
                    : styles.textAreaWithoutImages,
                )}
              />
              <div {...stylex.props(styles.composerFooter)}>
                <div {...stylex.props(styles.toolGroup)}>
                  <button
                    type="button"
                    onClick={onCreateSession}
                    disabled={!sessionsReady || isPreparingTurn}
                    {...stylex.props(styles.toolButton)}
                    title="New session"
                  >
                    <PlusIcon className={stylex.props(styles.icon).className} weight="bold" />
                  </button>
                  <button
                    type="button"
                    onClick={onImageButtonClick}
                    disabled={!sessionsReady || isPreparingTurn}
                    {...stylex.props(
                      styles.toolButton,
                      (imagePickerOpen || composerImages.length > 0) && styles.toolButtonActive,
                    )}
                    title="Attach images"
                  >
                    <ImageIcon className={stylex.props(styles.icon).className} weight="bold" />
                  </button>
                  <button
                    type="button"
                    onClick={onReferenceButtonClick}
                    disabled={!sessionsReady || isPreparingTurn}
                    {...stylex.props(
                      styles.toolButton,
                      referencePickerOpen && styles.toolButtonActive,
                    )}
                    title="Reference files or folders"
                  >
                    <FileTextIcon className={stylex.props(styles.icon).className} weight="bold" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenSettings("ai-provider")}
                    {...stylex.props(styles.toolButton)}
                  >
                    <SlidersHorizontalIcon className={stylex.props(styles.icon).className} />
                  </button>
                </div>
                <div {...stylex.props(styles.submitGroup)}>
                  <ChatContextUsage
                    composerImageCount={composerImages.length}
                    composerText={composerTextValue}
                    messages={messages}
                    model={selectedModelInfo}
                  />
                  {isStreaming ? (
                    <button type="button" onClick={onAbort} {...stylex.props(styles.roundButton)}>
                      <StopIcon
                        className={stylex.props(styles.iconSmall).className}
                        weight="fill"
                      />
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={!canSubmitMessage}
                      {...stylex.props(
                        styles.roundButton,
                        !canSubmitMessage && styles.submitInactive,
                        !canSubmitMessage && styles.disabled,
                      )}
                    >
                      <ArrowUpIcon
                        className={stylex.props(styles.iconSmall).className}
                        weight="bold"
                      />
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
