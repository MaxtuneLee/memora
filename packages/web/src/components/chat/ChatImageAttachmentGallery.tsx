import { XIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";

import { cn } from "@/lib/cn";
import {
  resolveChatImageAttachmentBlob,
  type ChatImageAttachment,
} from "@/lib/chat/chatImageAttachments";

interface PreviewEntry {
  status: "loading" | "ready" | "missing";
  url: string | null;
}

interface ChatImageAttachmentGalleryProps {
  attachments: ChatImageAttachment[];
  tone: "composer" | "user";
  onRemove?: (attachmentId: string) => void;
  onSaveToLibrary?: (attachmentId: string) => void;
  savingAttachmentIds?: ReadonlySet<string>;
}

const SOURCE_LABELS = {
  local: "Local",
  library: "Library",
} as const;

export function ChatImageAttachmentGallery({
  attachments,
  tone,
  onRemove,
  onSaveToLibrary,
  savingAttachmentIds,
}: ChatImageAttachmentGalleryProps) {
  const [previewEntries, setPreviewEntries] = useState<Record<string, PreviewEntry>>({});

  useEffect(() => {
    let cancelled = false;
    const objectUrls: string[] = [];

    void Promise.all(
      attachments.map(async (attachment) => {
        const blob = await resolveChatImageAttachmentBlob(attachment);
        if (!blob) {
          return {
            id: attachment.id,
            entry: {
              status: "missing" as const,
              url: null,
            },
          };
        }

        const url = URL.createObjectURL(blob);
        objectUrls.push(url);
        return {
          id: attachment.id,
          entry: {
            status: "ready" as const,
            url,
          },
        };
      }),
    ).then((loadedEntries) => {
      if (cancelled) {
        return;
      }

      setPreviewEntries((current) => {
        const next = { ...current };
        for (const loadedEntry of loadedEntries) {
          next[loadedEntry.id] = loadedEntry.entry;
        }
        return next;
      });
    });

    return () => {
      cancelled = true;
      for (const url of objectUrls) {
        URL.revokeObjectURL(url);
      }
    };
  }, [attachments]);

  const isComposerTone = tone === "composer";

  return (
    <div className={cn("grid gap-2.5", attachments.length > 1 ? "grid-cols-2" : "grid-cols-1")}>
      {attachments.map((attachment) => {
        const previewEntry = previewEntries[attachment.id] ?? {
          status: "loading" as const,
          url: null,
        };
        const canSaveToLibrary =
          attachment.source === "local" && !attachment.savedFileId && Boolean(onSaveToLibrary);
        const isSaving = savingAttachmentIds?.has(attachment.id) ?? false;

        return (
          <div key={attachment.id} className="space-y-2">
            <div
              className={cn(
                "group relative overflow-hidden rounded-2xl border",
                isComposerTone
                  ? "border-zinc-200 bg-zinc-100/80"
                  : "border-zinc-800/70 bg-zinc-800/80",
              )}
            >
              <div className="aspect-[4/3] w-full">
                {previewEntry.status === "ready" && previewEntry.url ? (
                  <img
                    src={previewEntry.url}
                    alt={attachment.name}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div
                    className={cn(
                      "flex h-full items-center justify-center px-4 text-center text-xs",
                      isComposerTone ? "text-zinc-500" : "text-zinc-300",
                    )}
                  >
                    {previewEntry.status === "missing" ? "Image unavailable" : "Loading image…"}
                  </div>
                )}
              </div>

              {onRemove && (
                <button
                  type="button"
                  onClick={() => onRemove(attachment.id)}
                  className={cn(
                    "absolute right-2 top-2 inline-flex size-7 items-center justify-center rounded-full border backdrop-blur-sm transition",
                    isComposerTone
                      ? "border-white/80 bg-white/80 text-zinc-600 hover:bg-white"
                      : "border-white/20 bg-black/40 text-white hover:bg-black/55",
                  )}
                  aria-label={`Remove ${attachment.name}`}
                >
                  <XIcon className="size-3.5" />
                </button>
              )}

              <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent px-3 pb-3 pt-8 text-white">
                <div className="flex items-end justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold">{attachment.name}</p>
                    <p className="mt-0.5 text-[11px] text-white/70">
                      {SOURCE_LABELS[attachment.source]} ·{" "}
                      {(attachment.sizeBytes / 1024 / 1024).toFixed(1)} MB
                    </p>
                  </div>
                  {attachment.savedFileId && (
                    <span className="shrink-0 rounded-full border border-white/20 bg-white/10 px-2 py-1 text-[10px] font-medium text-white/80">
                      Saved
                    </span>
                  )}
                </div>
              </div>
            </div>

            {canSaveToLibrary && onSaveToLibrary && (
              <button
                type="button"
                onClick={() => onSaveToLibrary(attachment.id)}
                disabled={isSaving}
                className={cn(
                  "inline-flex items-center rounded-full border px-3 py-1.5 text-[11px] font-semibold transition",
                  isComposerTone
                    ? "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50"
                    : "border-white/20 bg-white/10 text-white hover:bg-white/20",
                  isSaving ? "cursor-not-allowed opacity-60" : "",
                )}
              >
                {isSaving ? "Saving…" : "Save to library"}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
