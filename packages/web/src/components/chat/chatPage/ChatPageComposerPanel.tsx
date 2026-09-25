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
import { AnimatePresence, motion } from "motion/react";
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
import { tokens } from "../../../styles/stylex.stylex";
import { ChatPageComposerAttachments } from "./ChatPageComposerAttachments";
import { CHAT_LAYOUT_TRANSITION } from "./layout";
import type { ComposerNotice, ReferencePickerSource } from "./types";

const styles = stylex.create({
  root: { bottom: 0, insetInline: 0, pointerEvents: "none", position: "absolute", zIndex: 10 },
  // New chat: the composer starts on the midline, right under the greeting (see ChatPageEmptyState).
  rootCentered: { bottom: "auto", top: "50%" },
  fadeHidden: { display: "none" },
  overlayCentered: { paddingTop: 0 },
  fade: {
    backgroundImage: `linear-gradient(to top, ${tokens.shell}, color-mix(in srgb, ${tokens.shell} 90%, transparent), transparent)`,
    bottom: 0,
    insetInline: 0,
    pointerEvents: "none",
    position: "absolute",
    zIndex: 0,
  },
  overlay: { paddingBlock: 64, paddingBottom: 24, paddingInline: 16 },
  composerArea: { marginInline: "auto", maxWidth: 672, pointerEvents: "auto" },
  notice: {
    border: `1px solid ${tokens.infoBorder}`,
    borderRadius: 12,
    color: tokens.infoText,
    fontSize: 12,
    marginBottom: 8,
    paddingBlock: 8,
    paddingInline: 12,
  },
  noticeError: {
    backgroundColor: tokens.dangerSurface,
    borderColor: tokens.dangerBorder,
    color: tokens.dangerText,
  },
  noticeSuccess: {
    backgroundColor: tokens.successSurface,
    borderColor: tokens.successBorder,
    color: tokens.successText,
  },
  memoryNotice: {
    alignItems: "center",
    backgroundColor: tokens.successSurface,
    border: `1px solid ${tokens.successBorder}`,
    borderRadius: 8,
    color: tokens.successText,
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
    color: tokens.successText,
    fontWeight: 600,
    transition: "color 150ms",
    ":hover": { color: `color-mix(in srgb, ${tokens.successText} 75%, black)` },
  },
  dismissAction: {
    color: tokens.successText,
    transition: "color 150ms",
    ":hover": { color: `color-mix(in srgb, ${tokens.successText} 75%, black)` },
  },
  iconSmall: { height: 14, width: 14 },
  referenceNotice: {
    backgroundColor: tokens.warningSurface,
    border: `1px solid ${tokens.warningBorder}`,
    borderRadius: 8,
    color: tokens.warningText,
    fontSize: 12,
    marginBottom: 8,
    paddingBlock: 8,
    paddingInline: 12,
  },
  references: {
    backgroundColor: `color-mix(in srgb, ${tokens.card} 80%, transparent)`,
    border: `1px solid ${tokens.border}`,
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
  referenceTitle: { color: tokens.textMuted, fontSize: 12, fontWeight: 500 },
  referenceCount: { color: tokens.textSoft, marginLeft: 4 },
  scopeText: { color: tokens.textMuted, fontSize: 11 },
  clearButton: {
    color: tokens.textMuted,
    fontSize: 12,
    transition: "color 150ms",
    ":hover": { color: tokens.textStrong },
  },
  referenceList: { display: "flex", flexWrap: "wrap", gap: 6 },
  referenceChip: {
    alignItems: "center",
    backgroundColor: tokens.surfaceMuted,
    border: `1px solid ${tokens.border}`,
    borderRadius: 9999,
    color: tokens.textStrong,
    display: "inline-flex",
    fontSize: 12,
    gap: 4,
    maxWidth: "100%",
    paddingBlock: 4,
    paddingInline: 8,
  },
  referenceIcon: { color: tokens.textMuted, flexShrink: 0, height: 14, width: 14 },
  truncate: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  removeReference: {
    alignItems: "center",
    borderRadius: 9999,
    color: tokens.textSoft,
    display: "inline-flex",
    height: 16,
    justifyContent: "center",
    transition: "color 150ms, background-color 150ms",
    width: 16,
    ":hover": { backgroundColor: tokens.hover, color: tokens.textStrong },
  },
  hidden: { display: "none" },
  composer: {
    backdropFilter: "blur(24px)",
    backgroundColor: `color-mix(in srgb, ${tokens.card} 90%, transparent)`,
    border: `1px solid ${tokens.border}`,
    borderRadius: 12,
    boxShadow: tokens.shadowLarge,
    position: "relative",
    transition: "border-color 150ms, box-shadow 150ms",
  },
  composerDragging: {
    borderColor: tokens.primaryBackground,
    boxShadow: `0 0 0 2px color-mix(in srgb, ${tokens.primaryBackground} 10%, transparent)`,
  },
  dragOverlay: {
    alignItems: "center",
    backgroundColor: `color-mix(in srgb, ${tokens.text} 5%, transparent)`,
    border: `1px dashed color-mix(in srgb, ${tokens.text} 20%, transparent)`,
    borderRadius: 12,
    color: tokens.textStrong,
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
    color: tokens.textStrong,
    fontSize: 14,
    maxHeight: 180,
    outline: "none",
    overflowY: "auto",
    paddingBottom: 8,
    paddingInline: 16,
    resize: "none",
    width: "100%",
    "::placeholder": { color: tokens.textSoft },
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
    color: tokens.textSoft,
    display: "flex",
    height: 28,
    justifyContent: "center",
    transition: "color 150ms, background-color 150ms",
    width: 28,
    ":hover": { backgroundColor: tokens.hover, color: tokens.textMuted },
    ":disabled": { cursor: "not-allowed", opacity: 0.5 },
  },
  toolButtonActive: { backgroundColor: tokens.primaryBackground, color: tokens.primaryText },
  icon: { height: 16, width: 16 },
  submitGroup: { alignItems: "center", display: "flex", gap: 8 },
  roundButton: {
    alignItems: "center",
    backgroundColor: tokens.primaryBackground,
    borderRadius: 9999,
    color: tokens.primaryText,
    display: "flex",
    height: 28,
    justifyContent: "center",
    transition: "all 150ms",
    width: 28,
    ":hover": {
      backgroundColor: `color-mix(in srgb, ${tokens.primaryBackground} 86%, ${tokens.surface})`,
    },
  },
  submitInactive: {
    backgroundColor: tokens.controlDisabledBackground,
    color: tokens.controlDisabledText,
  },
  disabled: { cursor: "not-allowed", opacity: 0.5 },
  deliveryModeSelect: {
    backgroundColor: tokens.controlBackground,
    border: `1px solid ${tokens.controlBorder}`,
    borderRadius: 8,
    color: tokens.text,
    fontSize: 13,
    paddingBlock: 4,
    paddingInline: 8,
  },
});

interface ChatPageComposerPanelProps {
  pendingCount: number;
  deliveryMode: "pending" | "steer";
  onDeliveryModeChange: (mode: "pending" | "steer") => void;
  composerFadeHeight: number;
  centered: boolean;
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
  pendingCount,
  deliveryMode,
  onDeliveryModeChange,
  composerFadeHeight,
  centered,
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
    <div {...stylex.props(styles.root, centered && styles.rootCentered)}>
      <div
        {...stylex.props(styles.fade, centered && styles.fadeHidden)}
        style={{ height: composerFadeHeight }}
      />
      <div
        ref={composerOverlayRef}
        {...stylex.props(styles.overlay, centered && styles.overlayCentered)}
      >
        <motion.div
          layout="position"
          layoutDependency={centered}
          transition={CHAT_LAYOUT_TRANSITION}
          {...stylex.props(styles.composerArea)}
        >
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
          {pendingCount > 0 && <p role="status">{pendingCount} pending</p>}
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
                  {isStreaming && (
                    <select
                      aria-label="Message delivery"
                      value={deliveryMode}
                      onChange={(event) =>
                        onDeliveryModeChange(event.target.value === "steer" ? "steer" : "pending")
                      }
                      {...stylex.props(styles.deliveryModeSelect)}
                    >
                      <option value="pending">Pending</option>
                      <option value="steer">Steer</option>
                    </select>
                  )}
                  {isStreaming ? (
                    <button
                      type="button"
                      aria-label="Stop current task"
                      onClick={onAbort}
                      {...stylex.props(styles.roundButton)}
                    >
                      <StopIcon
                        className={stylex.props(styles.iconSmall).className}
                        weight="fill"
                      />
                    </button>
                  ) : null}
                  <button
                    aria-label={
                      isStreaming
                        ? deliveryMode === "steer"
                          ? "Steer current task"
                          : "Queue message"
                        : "Send message"
                    }
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
                </div>
              </div>
            </div>
          </form>
        </motion.div>
      </div>
    </div>
  );
};
