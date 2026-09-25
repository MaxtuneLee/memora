import type { RefObject } from "react";
import * as stylex from "@stylexjs/stylex";

import { ChatImageAttachmentGallery } from "@/components/chat/ChatImageAttachmentGallery";
import { tokens } from "../../../styles/stylex.stylex";

import type { ChatMessageData } from "./types";

const styles = stylex.create({
  editor: { display: "flex", flexDirection: "column", gap: 12 },
  textArea: {
    backgroundColor: tokens.surfaceMuted,
    border: `1px solid ${tokens.borderStrong}`,
    borderRadius: 16,
    color: tokens.textStrong,
    display: "block",
    fontSize: 14,
    paddingBlock: 12,
    paddingInline: 16,
    resize: "vertical",
    outline: "none",
    width: "100%",
    "::placeholder": { color: tokens.textSoft },
  },
  actions: { alignItems: "center", display: "flex", gap: 8, justifyContent: "flex-end" },
  button: {
    alignItems: "center",
    backgroundColor: tokens.card,
    border: `1px solid ${tokens.borderStrong}`,
    borderRadius: 12,
    color: tokens.textStrong,
    display: "inline-flex",
    fontSize: 12,
    fontWeight: 500,
    gap: 4,
    paddingBlock: 8,
    paddingInline: 14,
    transition: "background-color 150ms",
    ":hover": { backgroundColor: tokens.hover },
  },
  done: {
    backgroundColor: tokens.primaryBackground,
    borderColor: tokens.primaryBackground,
    color: tokens.primaryText,
    fontWeight: 600,
    ":hover": {
      backgroundColor: `color-mix(in srgb, ${tokens.primaryBackground} 86%, ${tokens.surface})`,
    },
    ":disabled": { cursor: "not-allowed", opacity: 0.5 },
  },
  message: {
    backgroundColor: tokens.surfaceMuted,
    borderRadius: 16,
    color: tokens.textStrong,
    maxWidth: "100%",
    paddingBlock: 10,
    paddingInline: 16,
  },
  attachments: { marginTop: 8 },
});

export function UserMessageContent({
  message,
  draftText,
  isEditing,
  actionsDisabled,
  savingAttachmentIds,
  editInputRef,
  onSaveImageToLibrary,
  onCancelEditing,
  onDraftTextChange,
  onSubmitEdit,
  canSubmitEdit,
}: {
  message: ChatMessageData;
  draftText: string;
  isEditing: boolean;
  actionsDisabled: boolean;
  savingAttachmentIds?: ReadonlySet<string>;
  editInputRef: RefObject<HTMLTextAreaElement | null>;
  onSaveImageToLibrary?: (messageId: string, attachmentId: string) => void;
  onCancelEditing: () => void;
  onDraftTextChange: (value: string) => void;
  onSubmitEdit: () => void;
  canSubmitEdit: boolean;
}) {
  return (
    <>
      {isEditing ? (
        <div {...stylex.props(styles.editor)}>
          <textarea
            ref={editInputRef}
            value={draftText}
            onChange={(event) => onDraftTextChange(event.currentTarget.value)}
            rows={3}
            {...stylex.props(styles.textArea)}
            placeholder="Edit your message..."
            disabled={actionsDisabled}
          />
          <div {...stylex.props(styles.actions)}>
            <button type="button" onClick={onCancelEditing} {...stylex.props(styles.button)}>
              Cancel
            </button>
            <button
              type="button"
              onClick={onSubmitEdit}
              disabled={!canSubmitEdit || actionsDisabled}
              {...stylex.props(styles.button, styles.done)}
            >
              Done
            </button>
          </div>
        </div>
      ) : (
        <>
          {message.content && <div {...stylex.props(styles.message)}>{message.content}</div>}
          {message.attachments && message.attachments.length > 0 && (
            <div {...stylex.props(message.content ? styles.attachments : null)}>
              <ChatImageAttachmentGallery
                attachments={message.attachments}
                tone="user"
                savingAttachmentIds={savingAttachmentIds}
                onSaveToLibrary={
                  onSaveImageToLibrary
                    ? (attachmentId) => onSaveImageToLibrary(message.id, attachmentId)
                    : undefined
                }
              />
            </div>
          )}
        </>
      )}
    </>
  );
}
