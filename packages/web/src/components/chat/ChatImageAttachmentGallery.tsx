import { XIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import type { CSSProperties, KeyboardEvent, MouseEvent } from "react";
import * as stylex from "@stylexjs/stylex";

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

const styles = stylex.create({
  gallery: { display: "flex", flexWrap: "wrap", gap: 6 },
  composerGallery: { alignItems: "flex-start" },
  userGallery: { justifyContent: "flex-end" },
  attachment: {
    alignItems: "center",
    border: "1px solid",
    borderRadius: 12,
    display: "inline-flex",
    gap: 8,
    maxWidth: "100%",
    textAlign: "left",
    transition: "background-color 150ms",
  },
  composerAttachment: {
    backgroundColor: "#f7f4ef",
    borderColor: "#eee8df",
    paddingBlock: 8,
    paddingInline: 10,
  },
  userAttachment: {
    backgroundColor: "#fffdfa",
    borderColor: "#ded6ca",
    paddingBlock: 6,
    paddingInline: 8,
  },
  previewable: {
    cursor: "zoom-in",
    ":hover": { backgroundColor: "#f1ece7" },
    ":focus-visible": { outline: "none", boxShadow: "0 0 0 2px rgb(167 175 143 / 0.55)" },
  },
  thumbnail: { border: "1px solid", flexShrink: 0, overflow: "hidden", position: "relative" },
  composerThumbnail: {
    backgroundColor: "#ece7de",
    borderColor: "#e0d8cd",
    borderRadius: 8,
    height: 40,
    width: 40,
  },
  userThumbnail: {
    backgroundColor: "#f1ece4",
    borderColor: "#ded6ca",
    borderRadius: 8,
    height: 28,
    width: 28,
  },
  image: { height: "100%", objectFit: "cover", width: "100%" },
  fallback: {
    alignItems: "center",
    display: "flex",
    fontSize: 10,
    height: "100%",
    justifyContent: "center",
    width: "100%",
  },
  composerFallback: { color: "#8f897d" },
  userFallback: { color: "#716c64" },
  nameWrap: { minWidth: 0 },
  name: {
    fontSize: 12,
    fontWeight: 500,
    margin: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  composerName: { color: "#4b4740", maxWidth: "9.5rem" },
  userName: { color: "#716c64", maxWidth: "8.5rem" },
  size: { color: "#8f897d", fontSize: 11, lineHeight: 1, marginBlock: 2 },
  saved: {
    backgroundColor: "#f1ece4",
    borderRadius: 9999,
    color: "#8f897d",
    flexShrink: 0,
    fontSize: 10,
    fontWeight: 500,
    paddingBlock: 2,
    paddingInline: 6,
  },
  saveButton: {
    backgroundColor: "#f1ece4",
    borderRadius: 9999,
    color: "#716c64",
    flexShrink: 0,
    fontSize: 10,
    fontWeight: 500,
    paddingBlock: 4,
    paddingInline: 8,
    transition: "background-color 150ms, color 150ms",
    ":hover": { backgroundColor: "#ebe3d8", color: "#1d1c1a" },
  },
  disabled: { cursor: "not-allowed", opacity: 0.6 },
  removeButton: {
    alignItems: "center",
    borderRadius: 9999,
    color: "#8f897d",
    display: "inline-flex",
    flexShrink: 0,
    height: 24,
    justifyContent: "center",
    transition: "background-color 150ms, color 150ms",
    width: 24,
    ":hover": { backgroundColor: "#ece7de", color: "#1d1c1a" },
  },
  removeIcon: { height: 14, width: 14 },
  backdrop: {
    alignItems: "center",
    backdropFilter: "blur(12px)",
    backgroundColor: "rgb(34 31 29 / 0.35)",
    display: "flex",
    inset: 0,
    justifyContent: "center",
    padding: 16,
    position: "fixed",
    zIndex: 50,
  },
  dialog: {
    backgroundColor: "#fffdfa",
    border: "1px solid #e9e5dc",
    borderRadius: 24,
    display: "flex",
    flexDirection: "column",
    maxHeight: "88dvh",
    maxWidth: "64rem",
    overflow: "hidden",
    width: "100%",
  },
  dialogHeader: {
    alignItems: "center",
    borderBottom: "1px solid #e9e5dc",
    display: "flex",
    gap: 16,
    justifyContent: "space-between",
    paddingBlock: 12,
    paddingInline: 16,
  },
  titleWrap: { minWidth: 0 },
  title: {
    color: "#1d1c1a",
    fontSize: 14,
    fontWeight: 500,
    margin: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  dialogSize: { color: "#8f897d", fontSize: 12, marginBlock: 2 },
  closeButton: {
    alignItems: "center",
    borderRadius: 9999,
    color: "#716c64",
    display: "inline-flex",
    flexShrink: 0,
    height: 32,
    justifyContent: "center",
    transition: "background-color 150ms, color 150ms",
    width: 32,
    ":hover": { backgroundColor: "#f1ece4", color: "#1d1c1a" },
    ":focus-visible": { outline: "none", boxShadow: "0 0 0 2px rgb(167 175 143 / 0.55)" },
  },
  closeIcon: { height: 16, width: 16 },
  previewSurface: {
    alignItems: "center",
    backgroundColor: "#f7f4ef",
    display: "flex",
    flex: 1,
    justifyContent: "center",
    minHeight: 0,
    padding: 12,
  },
  previewImage: {
    borderRadius: 16,
    maxHeight: "calc(88dvh - 5.5rem)",
    maxWidth: "100%",
    objectFit: "contain",
  },
});

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
      <div
        {...stylex.props(
          styles.gallery,
          isComposerTone ? styles.composerGallery : styles.userGallery,
        )}
      >
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
              {...stylex.props(
                styles.attachment,
                isComposerTone ? styles.composerAttachment : styles.userAttachment,
                canOpenPreview && styles.previewable,
              )}
              aria-label={canOpenPreview ? `Open ${attachment.name}` : undefined}
            >
              <div
                {...stylex.props(
                  styles.thumbnail,
                  isComposerTone ? styles.composerThumbnail : styles.userThumbnail,
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
                    {...stylex.props(styles.image)}
                  />
                ) : (
                  <div
                    {...stylex.props(
                      styles.fallback,
                      isComposerTone ? styles.composerFallback : styles.userFallback,
                    )}
                  >
                    {previewEntry.status === "missing" ? "!" : ""}
                  </div>
                )}
              </div>
              <div {...stylex.props(styles.nameWrap)}>
                <p
                  {...stylex.props(
                    styles.name,
                    isComposerTone ? styles.composerName : styles.userName,
                  )}
                >
                  {attachment.name}
                </p>
                {isComposerTone && (
                  <p {...stylex.props(styles.size)}>{formatAttachmentSize(attachment.sizeBytes)}</p>
                )}
              </div>
              {!isComposerTone && attachment.savedFileId && (
                <span {...stylex.props(styles.saved)}>Saved</span>
              )}
              {canSaveToLibrary && onSaveToLibrary && !isComposerTone && (
                <button
                  type="button"
                  onClick={(event) => {
                    handleInlineActionClick(event);
                    onSaveToLibrary(attachment.id);
                  }}
                  disabled={isSaving}
                  {...stylex.props(styles.saveButton, isSaving && styles.disabled)}
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
                  {...stylex.props(styles.removeButton)}
                  aria-label={`Remove ${attachment.name}`}
                >
                  <XIcon className={stylex.props(styles.removeIcon).className} />
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
            {...stylex.props(styles.backdrop)}
            onClick={(event) => {
              if (event.target === event.currentTarget) {
                closeImagePreview();
              }
            }}
          >
            <div {...stylex.props(styles.dialog)}>
              <div {...stylex.props(styles.dialogHeader)}>
                <div {...stylex.props(styles.titleWrap)}>
                  <h2
                    id={`chat-image-preview-${selectedAttachment.id}`}
                    {...stylex.props(styles.title)}
                  >
                    {selectedAttachment.name}
                  </h2>
                  <p {...stylex.props(styles.dialogSize)}>
                    {formatAttachmentSize(selectedAttachment.sizeBytes)}
                  </p>
                </div>
                <button
                  ref={closePreviewButtonRef}
                  type="button"
                  onClick={closeImagePreview}
                  {...stylex.props(styles.closeButton)}
                  aria-label="Close image preview"
                >
                  <XIcon className={stylex.props(styles.closeIcon).className} />
                </button>
              </div>
              <div {...stylex.props(styles.previewSurface)}>
                <img
                  src={selectedPreviewEntry.url}
                  alt={selectedAttachment.name}
                  {...stylex.props(styles.previewImage)}
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
