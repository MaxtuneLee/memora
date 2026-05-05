import { XIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import type { CSSProperties, KeyboardEvent, MouseEvent } from "react";

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

interface ViewTransitionHandle {
  finished: Promise<void>;
}

const formatAttachmentSize = (sizeBytes: number): string => {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return "0 KB";
  }

  const sizeKb = sizeBytes / 1024;
  if (sizeKb < 1024) {
    return `${sizeKb.toFixed(sizeKb >= 100 ? 0 : 1)} KB`;
  }

  return `${(sizeKb / 1024).toFixed(1)} MB`;
};

const getAttachmentTransitionName = (attachmentId: string): string => {
  return `chat-attachment-${attachmentId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
};

const runViewTransition = (update: () => void): Promise<void> => {
  if (typeof document === "undefined") {
    update();
    return Promise.resolve();
  }

  const documentWithViewTransition = document as Document & {
    startViewTransition?: (updateCallback: () => void) => ViewTransitionHandle;
  };
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!documentWithViewTransition.startViewTransition || prefersReducedMotion) {
    flushSync(update);
    return Promise.resolve();
  }

  const transition = documentWithViewTransition.startViewTransition(() => {
    flushSync(update);
  });

  return transition.finished.catch(() => undefined);
};

export function ChatImageAttachmentGallery({
  attachments,
  tone,
  onRemove,
  onSaveToLibrary,
  savingAttachmentIds,
}: ChatImageAttachmentGalleryProps) {
  const [previewEntries, setPreviewEntries] = useState<Record<string, PreviewEntry>>({});
  const [selectedAttachmentId, setSelectedAttachmentId] = useState<string | null>(null);
  const [transitionSourceId, setTransitionSourceId] = useState<string | null>(null);
  const closePreviewButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

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
  const selectedAttachment =
    attachments.find((attachment) => attachment.id === selectedAttachmentId) ?? null;
  const selectedPreviewEntry = selectedAttachmentId ? previewEntries[selectedAttachmentId] : null;

  const closeImagePreview = useCallback(() => {
    const closingAttachmentId = selectedAttachmentId;
    if (!closingAttachmentId) {
      return;
    }

    void runViewTransition(() => {
      setSelectedAttachmentId(null);
      setTransitionSourceId(closingAttachmentId);
    }).finally(() => {
      setTransitionSourceId(null);
      previousFocusRef.current?.focus();
      previousFocusRef.current = null;
    });
  }, [selectedAttachmentId]);

  useEffect(() => {
    if (!selectedAttachmentId) {
      return;
    }

    closePreviewButtonRef.current?.focus();

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        closeImagePreview();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeImagePreview, selectedAttachmentId]);

  useEffect(() => {
    if (selectedAttachmentId && !selectedAttachment) {
      setSelectedAttachmentId(null);
      setTransitionSourceId(null);
    }
  }, [selectedAttachment, selectedAttachmentId]);

  const openImagePreview = useCallback(
    (attachment: ChatImageAttachment, previewEntry: PreviewEntry) => {
      if (previewEntry.status !== "ready" || !previewEntry.url) {
        return;
      }

      if (document.activeElement instanceof HTMLElement) {
        previousFocusRef.current = document.activeElement;
      }

      flushSync(() => {
        setTransitionSourceId(attachment.id);
      });

      void runViewTransition(() => {
        setSelectedAttachmentId(attachment.id);
        setTransitionSourceId(null);
      });
    },
    [],
  );

  const handleAttachmentKeyDown = (
    event: KeyboardEvent<HTMLDivElement>,
    attachment: ChatImageAttachment,
    previewEntry: PreviewEntry,
  ) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    openImagePreview(attachment, previewEntry);
  };

  const handleInlineActionClick = (event: MouseEvent<HTMLElement>) => {
    event.stopPropagation();
  };

  return (
    <>
      <div className={cn("flex flex-wrap gap-1.5", isComposerTone ? "items-start" : "justify-end")}>
        {attachments.map((attachment) => {
          const previewEntry = previewEntries[attachment.id] ?? {
            status: "loading" as const,
            url: null,
          };
          const canSaveToLibrary =
            attachment.source === "local" && !attachment.savedFileId && Boolean(onSaveToLibrary);
          const isSaving = savingAttachmentIds?.has(attachment.id) ?? false;
          const canOpenPreview = previewEntry.status === "ready" && Boolean(previewEntry.url);
          const transitionName = getAttachmentTransitionName(attachment.id);

          return (
            <div
              key={attachment.id}
              role={canOpenPreview ? "button" : undefined}
              tabIndex={canOpenPreview ? 0 : undefined}
              onClick={() => openImagePreview(attachment, previewEntry)}
              onKeyDown={(event) => handleAttachmentKeyDown(event, attachment, previewEntry)}
              className={cn(
                "group/attachment inline-flex max-w-full items-center gap-2 rounded-xl border text-left transition-colors",
                isComposerTone
                  ? "border-[#eee8df] bg-[#f7f4ef] px-2.5 py-2"
                  : "border-[#ded6ca] bg-[#fffdfa] px-2 py-1.5",
                canOpenPreview
                  ? "cursor-zoom-in hover:bg-[#f1ece7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a7af8f]/55"
                  : "",
              )}
              aria-label={canOpenPreview ? `Open ${attachment.name}` : undefined}
            >
              <div
                className={cn(
                  "relative shrink-0 overflow-hidden border",
                  isComposerTone
                    ? "size-10 rounded-lg border-[#e0d8cd] bg-[#ece7de]"
                    : "size-7 rounded-lg border-[#ded6ca] bg-[#f1ece4]",
                )}
                style={
                  transitionSourceId === attachment.id
                    ? ({ viewTransitionName: transitionName } as CSSProperties)
                    : undefined
                }
              >
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
                      "flex h-full w-full items-center justify-center text-[10px]",
                      isComposerTone ? "text-[#8f897d]" : "text-[#716c64]",
                    )}
                  >
                    {previewEntry.status === "missing" ? "!" : ""}
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <p
                  className={cn(
                    "truncate text-xs font-medium",
                    isComposerTone
                      ? "max-w-[9.5rem] text-[#4b4740]"
                      : "max-w-[8.5rem] text-[#716c64]",
                  )}
                >
                  {attachment.name}
                </p>
                {isComposerTone && (
                  <p className="mt-0.5 text-[11px] leading-none text-[#8f897d]">
                    {formatAttachmentSize(attachment.sizeBytes)}
                  </p>
                )}
              </div>
              {!isComposerTone && attachment.savedFileId && (
                <span className="shrink-0 rounded-full bg-[#f1ece4] px-1.5 py-0.5 text-[10px] font-medium text-[#8f897d]">
                  Saved
                </span>
              )}
              {canSaveToLibrary && onSaveToLibrary && !isComposerTone && (
                <button
                  type="button"
                  onClick={(event) => {
                    handleInlineActionClick(event);
                    onSaveToLibrary(attachment.id);
                  }}
                  disabled={isSaving}
                  className={cn(
                    "shrink-0 rounded-full bg-[#f1ece4] px-2 py-1 text-[10px] font-medium text-[#716c64] transition hover:bg-[#ebe3d8] hover:text-[#1d1c1a]",
                    isSaving ? "cursor-not-allowed opacity-60" : "",
                  )}
                >
                  {isSaving ? "Saving" : "Save"}
                </button>
              )}
              {onRemove && (
                <button
                  type="button"
                  onClick={(event) => {
                    handleInlineActionClick(event);
                    onRemove(attachment.id);
                  }}
                  className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-[#8f897d] transition hover:bg-[#ece7de] hover:text-[#1d1c1a]"
                  aria-label={`Remove ${attachment.name}`}
                >
                  <XIcon className="size-3.5" />
                </button>
              )}
            </div>
          );
        })}
      </div>
      {selectedAttachment &&
        selectedPreviewEntry?.status === "ready" &&
        selectedPreviewEntry.url &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={`chat-image-preview-${selectedAttachment.id}`}
            className="fixed inset-0 z-50 flex items-center justify-center bg-[#221f1d]/35 p-4 backdrop-blur-md"
            onClick={(event) => {
              if (event.target === event.currentTarget) {
                closeImagePreview();
              }
            }}
          >
            <div className="flex max-h-[88dvh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-[#e9e5dc] bg-[#fffdfa]">
              <div className="flex items-center justify-between gap-4 border-b border-[#e9e5dc] px-4 py-3">
                <div className="min-w-0">
                  <h2
                    id={`chat-image-preview-${selectedAttachment.id}`}
                    className="truncate text-sm font-medium text-[#1d1c1a]"
                  >
                    {selectedAttachment.name}
                  </h2>
                  <p className="mt-0.5 text-xs text-[#8f897d]">
                    {formatAttachmentSize(selectedAttachment.sizeBytes)}
                  </p>
                </div>
                <button
                  ref={closePreviewButtonRef}
                  type="button"
                  onClick={closeImagePreview}
                  className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-[#716c64] transition hover:bg-[#f1ece4] hover:text-[#1d1c1a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a7af8f]/55"
                  aria-label="Close image preview"
                >
                  <XIcon className="size-4" />
                </button>
              </div>
              <div className="flex min-h-0 flex-1 items-center justify-center bg-[#f7f4ef] p-3">
                <img
                  src={selectedPreviewEntry.url}
                  alt={selectedAttachment.name}
                  className="max-h-[calc(88dvh-5.5rem)] max-w-full rounded-2xl object-contain"
                  style={
                    {
                      viewTransitionName: getAttachmentTransitionName(selectedAttachment.id),
                    } as CSSProperties
                  }
                />
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
