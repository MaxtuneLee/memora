import { ImageIcon } from "@phosphor-icons/react";
import { ChatImageAttachmentGallery } from "@/components/chat/ChatImageAttachmentGallery";
import type { file as LiveStoreFile } from "@/livestore/file";
import type { ChatImageAttachment } from "@/lib/chat/chatImageAttachments";

interface ChatPageComposerAttachmentsProps {
  composerImages: ChatImageAttachment[];
  remainingImageSlots: number;
  sessionsReady: boolean;
  imagePickerOpen: boolean;
  imagePickerQuery: string;
  imagePickerOptions: Array<{
    file: LiveStoreFile;
    isSelected: boolean;
  }>;
  onOpenLocalImagePicker: () => void;
  onToggleImageLibrary: () => void;
  onCloseImagePicker: () => void;
  onImagePickerQueryChange: (value: string) => void;
  onSelectLibraryImage: (file: LiveStoreFile) => void;
  onRemoveComposerImage: (attachmentId: string) => void;
}

export const ChatPageComposerAttachments = ({
  composerImages,
  remainingImageSlots,
  sessionsReady,
  imagePickerOpen,
  imagePickerQuery,
  imagePickerOptions,
  onOpenLocalImagePicker,
  onToggleImageLibrary,
  onCloseImagePicker,
  onImagePickerQueryChange,
  onSelectLibraryImage,
  onRemoveComposerImage,
}: ChatPageComposerAttachmentsProps) => {
  return (
    <>
      {composerImages.length > 0 && (
        <div className="mb-2 overflow-hidden rounded-2xl border border-zinc-200/80 bg-white/90 shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-zinc-200/70 px-3.5 py-3">
            <div>
              <p className="text-sm font-semibold text-zinc-900">
                Attached images
              </p>
              <p className="text-xs text-zinc-500">
                {composerImages.length} attached, {remainingImageSlots} slot
                {remainingImageSlots === 1 ? "" : "s"} left
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onOpenLocalImagePicker}
                disabled={!sessionsReady || remainingImageSlots === 0}
                className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Upload
              </button>
              <button
                type="button"
                onClick={onToggleImageLibrary}
                disabled={!sessionsReady}
                className="rounded-full border border-zinc-200 bg-zinc-900 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {imagePickerOpen ? "Hide library" : "Browse library"}
              </button>
            </div>
          </div>
          <div className="p-3">
            <ChatImageAttachmentGallery
              attachments={composerImages}
              tone="composer"
              onRemove={onRemoveComposerImage}
            />
          </div>
        </div>
      )}
      {imagePickerOpen && (
        <div className="relative z-10 mb-2 overflow-hidden rounded-2xl border border-zinc-200/80 bg-white/95 shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-zinc-200/70 px-3.5 py-3">
            <div>
              <p className="text-sm font-semibold text-zinc-900">Add images</p>
              <p className="text-xs text-zinc-500">
                Paste, drop, upload, or pick from your library.{" "}
                {remainingImageSlots} slot{remainingImageSlots === 1 ? "" : "s"} left.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onOpenLocalImagePicker}
                disabled={!sessionsReady || remainingImageSlots === 0}
                className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Upload image
              </button>
              <button
                type="button"
                onClick={onCloseImagePicker}
                className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-[11px] font-medium text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-700"
              >
                Close
              </button>
            </div>
          </div>
          <div className="p-3">
            <div className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5">
              <ImageIcon className="size-4 text-zinc-400" />
              <input
                value={imagePickerQuery}
                onChange={(event) => onImagePickerQueryChange(event.target.value)}
                placeholder="Search library images..."
                className="h-7 min-w-0 flex-1 bg-transparent text-sm text-zinc-800 outline-none placeholder:text-zinc-400"
              />
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {imagePickerOptions.length === 0 ? (
                <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-6 text-center text-xs text-zinc-500 sm:col-span-2">
                  No matching images in your library.
                </div>
              ) : (
                imagePickerOptions.map(({ file, isSelected }) => (
                  <button
                    key={file.id}
                    type="button"
                    onClick={() => onSelectLibraryImage(file)}
                    disabled={isSelected || remainingImageSlots === 0}
                    className={`rounded-2xl border px-3 py-3 text-left transition ${
                      isSelected
                        ? "border-zinc-900 bg-zinc-900 text-white"
                        : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50"
                    } disabled:cursor-not-allowed disabled:opacity-55`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {file.name}
                        </p>
                        <p
                          className={`mt-1 text-[11px] ${
                            isSelected ? "text-zinc-200" : "text-zinc-500"
                          }`}
                        >
                          {(file.sizeBytes / 1024 / 1024).toFixed(1)} MB
                        </p>
                      </div>
                      {isSelected && (
                        <span className="rounded-full border border-white/20 bg-white/10 px-2 py-1 text-[10px] font-semibold text-white">
                          Added
                        </span>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
