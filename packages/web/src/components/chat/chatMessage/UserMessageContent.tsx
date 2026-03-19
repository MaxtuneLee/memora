import type { RefObject } from "react";

import { ChatImageAttachmentGallery } from "@/components/chat/ChatImageAttachmentGallery";

import type { ChatMessageData } from "./types";

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
      {message.attachments && message.attachments.length > 0 && (
        <div className={message.content ? "mb-3" : ""}>
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
      {isEditing ? (
        <div className="space-y-3">
          <textarea
            ref={editInputRef}
            value={draftText}
            onChange={(event) => onDraftTextChange(event.currentTarget.value)}
            rows={3}
            className="block w-full resize-y rounded-2xl border border-[#d9d1c5] bg-[#f3efe9] px-4 py-3 text-sm text-zinc-900 outline-none placeholder:text-zinc-400"
            placeholder="Edit your message..."
            disabled={actionsDisabled}
          />
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onCancelEditing}
              className="inline-flex items-center gap-1 rounded-xl border border-[#d9d1c5] bg-white px-3.5 py-2 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onSubmitEdit}
              disabled={!canSubmitEdit || actionsDisabled}
              className="inline-flex items-center gap-1 rounded-xl bg-zinc-900 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Done
            </button>
          </div>
        </div>
      ) : (
        message.content
      )}
    </>
  );
}
