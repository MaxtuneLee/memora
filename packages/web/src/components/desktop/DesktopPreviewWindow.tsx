import { Button } from "@base-ui/react/button";
import { FolderIcon, ArrowClockwiseIcon } from "@phosphor-icons/react";
import * as stylex from "@stylexjs/stylex";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";

import { getDocumentEditorHref, isEditableTextDocument } from "@/lib/editor/editableTextDocument";
import { getFileIcon } from "@/lib/library/fileIcon";
import { formatBytes } from "@/lib/format";
import { resolveRecordingFile } from "@/lib/library/fileService";
import type { ContentLocator } from "@/lib/content/types";
import type { DesktopFileItem, DesktopFolderItem } from "@/types/desktop";
import { ICON_SIZE } from "@/types/desktop";
import type { DesktopWindowPosition, DesktopWindowSize } from "./DesktopWindow";
import { DesktopIndexStatusLabel } from "./DesktopIndexStatus";
import { DocumentFilePreview } from "./DocumentFilePreview";
import { useContentPipeline } from "@/lib/content/contentPipelineRoot";
import { DesktopWindow } from "./DesktopWindow";
import { tokens } from "../../styles/stylex.stylex";
import type { JSX } from "react";

const styles = stylex.create({
  icon: {
    height: "2.5rem",
    width: "2.5rem",
  },
  // Folder icon color is a content-type brand color, not a semantic one; kept fixed like
  // tokens.contentAudio/contentVideo/contentImage.
  folderIcon: {
    color: "#3b82f6",
  },
  fileIcon: {
    color: tokens.textMuted,
  },
  centeredMessage: {
    alignItems: "center",
    color: tokens.textMuted,
    display: "flex",
    fontSize: "0.875rem",
    height: "100%",
    justifyContent: "center",
    lineHeight: "1.25rem",
  },
  audioPreview: {
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
    height: "100%",
    justifyContent: "center",
    padding: "1rem",
  },
  fullWidth: {
    width: "100%",
  },
  videoPreview: {
    height: "100%",
    padding: "0.75rem",
  },
  video: {
    // Video letterboxing stays black in both themes, like media artwork.
    backgroundColor: "rgb(0 0 0 / 0.8)",
    borderRadius: "0.5rem",
    height: "100%",
    width: "100%",
  },
  imagePreview: {
    alignItems: "center",
    backgroundColor: tokens.surfaceSoft,
    display: "flex",
    height: "100%",
    justifyContent: "center",
    padding: "0.75rem",
  },
  image: {
    borderRadius: "0.5rem",
    boxShadow: tokens.shadowSmall,
    maxHeight: "100%",
    maxWidth: "100%",
    objectFit: "contain",
  },
  documentPreview: {
    backgroundColor: tokens.surfaceSoft,
    height: "100%",
    overflow: "hidden",
    padding: "0.75rem",
  },
  textPreview: {
    backgroundColor: tokens.surfaceSoft,
    height: "100%",
    overflow: "auto",
    padding: "1rem",
  },
  preformattedText: {
    color: tokens.text,
    fontSize: "0.75rem",
    lineHeight: 1.625,
    whiteSpace: "pre-wrap",
  },
  root: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
  },
  header: {
    alignItems: "center",
    borderBottomColor: tokens.border,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    display: "flex",
    gap: "1rem",
    paddingBlock: "0.75rem",
    paddingInline: "1rem",
  },
  iconFrame: {
    alignItems: "center",
    backgroundColor: tokens.hover,
    borderRadius: "0.75rem",
    display: "flex",
    flexShrink: 0,
    justifyContent: "center",
  },
  fileHeading: {
    flex: 1,
    minWidth: 0,
  },
  fileName: {
    color: tokens.textStrong,
    fontSize: "0.875rem",
    fontWeight: 600,
    lineHeight: "1.25rem",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  metadata: {
    color: tokens.textMuted,
    columnGap: "1rem",
    display: "flex",
    flexWrap: "wrap",
    fontSize: "0.75rem",
    lineHeight: "1rem",
    marginTop: "0.25rem",
    rowGap: "0.25rem",
  },
  metadataLabel: {
    color: tokens.textMuted,
    fontWeight: 500,
  },
  openButton: {
    backgroundColor: {
      default: tokens.primaryBackground,
      ":hover": `color-mix(in srgb, ${tokens.primaryBackground} 86%, ${tokens.surface})`,
    },
    borderRadius: "0.5rem",
    color: tokens.primaryText,
    cursor: "pointer",
    fontSize: "0.75rem",
    fontWeight: 500,
    lineHeight: "1rem",
    paddingBlock: "0.375rem",
    paddingInline: "0.75rem",
    transitionDuration: "150ms",
    transitionProperty: "background-color",
  },
  details: {
    borderBottomColor: tokens.border,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    color: tokens.textMuted,
    fontSize: "0.75rem",
    lineHeight: "1rem",
    paddingBlock: "0.5rem",
    paddingInline: "1rem",
  },
  timestamps: {
    alignItems: "center",
    columnGap: "0.5rem",
    display: "flex",
    flexWrap: "wrap",
    rowGap: "0.375rem",
  },
  separator: {
    color: tokens.textSoft,
  },
  indexRow: {
    alignItems: "center",
    borderTopColor: tokens.border,
    borderTopStyle: "solid",
    borderTopWidth: 1,
    display: "flex",
    flexWrap: "wrap",
    gap: "0.5rem",
    marginTop: "0.5rem",
    paddingTop: "0.5rem",
  },
  reindexButton: {
    alignItems: "center",
    backgroundColor: {
      default: tokens.surface,
      ":hover": tokens.hoverStrong,
    },
    borderColor: tokens.border,
    borderRadius: "0.375rem",
    borderStyle: "solid",
    borderWidth: 1,
    color: tokens.textMuted,
    display: "inline-flex",
    fontSize: "0.6875rem",
    fontWeight: 500,
    gap: "0.25rem",
    lineHeight: "1rem",
    paddingBlock: "0.25rem",
    paddingInline: "0.5rem",
    transitionDuration: "150ms",
    transitionProperty: "background-color, opacity",
    ":disabled": {
      cursor: "wait",
      opacity: 0.6,
    },
  },
  reindexIcon: {
    height: "0.75rem",
    width: "0.75rem",
  },
  updatedAt: {
    color: tokens.textSoft,
  },
  summary: {
    color: tokens.textMuted,
    display: "-webkit-box",
    lineHeight: "1.25rem",
    marginTop: "0.5rem",
    maxWidth: "42rem",
    overflow: "hidden",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 2,
  },
  previewBody: {
    flex: 1,
    overflow: "hidden",
  },
});

type PreviewableItem = DesktopFileItem | DesktopFolderItem;

interface DesktopPreviewWindowProps {
  id: string;
  item: PreviewableItem;
  position: DesktopWindowPosition;
  size: DesktopWindowSize;
  zIndex: number;
  isFocused: boolean;
  // ponytail: only the transcript (audio/video timestamp) case is wired below; page/slide/text
  // locators need jump-to-X support in DocumentFilePreview, which doesn't exist yet.
  locator?: ContentLocator;
  boundsRef: React.RefObject<HTMLDivElement | null>;
  onClose: (id: string) => void;
  onFocus: (id: string) => void;
  onMove: (id: string, position: DesktopWindowPosition) => void;
  onResize: (id: string, size: DesktopWindowSize) => void;
}

const TEXT_MIME_TYPES = [
  "text/plain",
  "text/markdown",
  "text/html",
  "application/markdown",
  "application/json",
];

export const getFileOpenHref = (
  fileMeta: Pick<DesktopFileItem["fileMeta"], "id" | "mimeType" | "name" | "type">,
): string => {
  if (fileMeta.type === "audio" || fileMeta.type === "video") {
    return `/transcript/file/${fileMeta.id}`;
  }

  if (isEditableTextDocument(fileMeta)) {
    return getDocumentEditorHref(fileMeta.id);
  }

  return "/desktop";
};

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function isTextMime(mimeType: string): boolean {
  if (mimeType.startsWith("text/")) return true;
  return TEXT_MIME_TYPES.includes(mimeType);
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  if (mins >= 60) {
    const hrs = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    return `${hrs}h ${remainingMins}m`;
  }
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function DesktopPreviewWindow({
  id,
  item,
  position,
  size,
  zIndex,
  isFocused,
  locator,
  boundsRef,
  onClose,
  onFocus,
  onMove,
  onResize,
}: DesktopPreviewWindowProps) {
  const navigate = useNavigate();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [textStatus, setTextStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [isReindexing, setIsReindexing] = useState(false);
  const revokeUrlRef = useRef<string | null>(null);
  const fileMetaRef = useRef<DesktopFileItem["fileMeta"] | null>(null);
  const mediaRef = useRef<HTMLMediaElement | null>(null);

  const seekToLocator = () => {
    if (locator?.kind === "transcript" && mediaRef.current) {
      mediaRef.current.currentTime = locator.startSeconds;
    }
  };

  const isFile = item.type === "file";
  const mimeType = isFile ? item.fileMeta.mimeType : "";
  const fileMetaId = isFile ? item.fileMeta.id : null;
  const fileMetaType = isFile ? item.fileMeta.type : null;
  const fileMeta = isFile ? item.fileMeta : null;
  const { reindexFile } = useContentPipeline();
  const fileStoragePath = isFile ? item.fileMeta.storagePath : null;

  useEffect(() => {
    fileMetaRef.current = fileMeta;
  }, [fileMeta]);

  const previewLabel = useMemo(() => {
    if (!isFile) return "Folder";
    return fileMetaType;
  }, [isFile, fileMetaType]);

  useEffect(() => {
    let isMounted = true;

    const loadPreview = async () => {
      const currentFileMeta = fileMetaRef.current;
      if (!isFile || !currentFileMeta) return;
      try {
        const file = await resolveRecordingFile(currentFileMeta);
        if (!isMounted || !file) return;
        const displayFile =
          file.name === item.name && file.type
            ? file
            : new File([file], item.name, { type: file.type || mimeType });
        setPreviewFile(displayFile);
        if (revokeUrlRef.current) {
          URL.revokeObjectURL(revokeUrlRef.current);
        }
        const url = URL.createObjectURL(file);
        revokeUrlRef.current = url;
        setPreviewUrl(url);

        if (fileMetaType === "document") {
          const effectiveMime = displayFile.type || mimeType || "";
          if (isTextMime(effectiveMime)) {
            setTextStatus("loading");
            const text = await displayFile.text();
            if (!isMounted) return;
            setTextContent(text);
            setTextStatus("ready");
          } else {
            setTextContent(null);
            setTextStatus("error");
          }
        } else {
          setTextContent(null);
          setTextStatus("idle");
        }
      } catch {
        if (!isMounted) return;
        setPreviewUrl(null);
        setPreviewFile(null);
        setTextContent(null);
        setTextStatus("error");
      }
    };

    void loadPreview();

    return () => {
      isMounted = false;
      if (revokeUrlRef.current) {
        URL.revokeObjectURL(revokeUrlRef.current);
        revokeUrlRef.current = null;
      }
    };
  }, [isFile, fileMetaId, fileMetaType, fileStoragePath, item.name, mimeType]);

  const getIcon = (): JSX.Element => {
    if (item.type === "folder") {
      return <FolderIcon {...stylex.props(styles.icon, styles.folderIcon)} weight="duotone" />;
    }
    const Icon = getFileIcon(item.fileMeta);
    return <Icon {...stylex.props(styles.icon, styles.fileIcon)} weight="duotone" />;
  };

  const handleOpen = () => {
    if (item.type === "file") {
      void navigate(getFileOpenHref(item.fileMeta));
    }
  };

  const renderPreview = () => {
    if (!isFile) {
      return <div {...stylex.props(styles.centeredMessage)}>Folder preview not available.</div>;
    }

    if (item.fileMeta.type === "audio") {
      return (
        <div {...stylex.props(styles.audioPreview)}>
          <audio
            ref={(element) => {
              mediaRef.current = element;
            }}
            controls
            src={previewUrl ?? undefined}
            onLoadedMetadata={seekToLocator}
            {...stylex.props(styles.fullWidth)}
          />
        </div>
      );
    }

    if (item.fileMeta.type === "video") {
      return (
        <div {...stylex.props(styles.videoPreview)}>
          <video
            ref={(element) => {
              mediaRef.current = element;
            }}
            controls
            src={previewUrl ?? undefined}
            onLoadedMetadata={seekToLocator}
            {...stylex.props(styles.video)}
          />
        </div>
      );
    }

    if (item.fileMeta.type === "image") {
      return (
        <div {...stylex.props(styles.imagePreview)}>
          {previewUrl ? (
            <img
              src={previewUrl}
              alt={item.name}
              loading="lazy"
              width={512}
              height={512}
              {...stylex.props(styles.image)}
            />
          ) : (
            <span {...stylex.props(styles.centeredMessage)}>Loading image...</span>
          )}
        </div>
      );
    }

    if (item.fileMeta.type === "document") {
      if (!isTextMime(mimeType)) {
        return (
          <div {...stylex.props(styles.documentPreview)}>
            {previewFile ? (
              <DocumentFilePreview file={previewFile} />
            ) : (
              <div {...stylex.props(styles.centeredMessage)}>Loading document preview…</div>
            )}
          </div>
        );
      }
      if (textStatus === "error") {
        return (
          <div {...stylex.props(styles.centeredMessage)}>Preview not available for this file.</div>
        );
      }
      return (
        <div {...stylex.props(styles.textPreview)}>
          <pre {...stylex.props(styles.preformattedText)}>
            {textStatus === "loading"
              ? "Loading text…"
              : textContent?.trim() || "Preview not available."}
          </pre>
        </div>
      );
    }

    return <div {...stylex.props(styles.centeredMessage)}>Preview not available.</div>;
  };

  return (
    <DesktopWindow
      id={id}
      title={item.name}
      position={position}
      size={size}
      zIndex={zIndex}
      isFocused={isFocused}
      boundsRef={boundsRef}
      onClose={onClose}
      onFocus={onFocus}
      onMove={onMove}
      onResize={onResize}
    >
      <div {...stylex.props(styles.root)}>
        <div {...stylex.props(styles.header)}>
          <div
            {...stylex.props(styles.iconFrame)}
            style={{ width: ICON_SIZE + 8, height: ICON_SIZE + 8 }}
          >
            {getIcon()}
          </div>
          <div {...stylex.props(styles.fileHeading)}>
            <p {...stylex.props(styles.fileName)}>{item.name}</p>
            <div {...stylex.props(styles.metadata)}>
              <span>
                <span {...stylex.props(styles.metadataLabel)}>Type:</span> {previewLabel}
              </span>
              {isFile && (
                <span>
                  <span {...stylex.props(styles.metadataLabel)}>Size:</span>{" "}
                  {formatBytes(item.fileMeta.sizeBytes)}
                </span>
              )}
              {isFile && item.fileMeta.durationSec && (
                <span>
                  <span {...stylex.props(styles.metadataLabel)}>Duration:</span>{" "}
                  {formatDuration(item.fileMeta.durationSec)}
                </span>
              )}
            </div>
          </div>
          {isFile && (
            <Button onClick={handleOpen} {...stylex.props(styles.openButton)}>
              Open
            </Button>
          )}
        </div>

        {isFile && (
          <div {...stylex.props(styles.details)}>
            <div {...stylex.props(styles.timestamps)}>
              <span>
                <span {...stylex.props(styles.metadataLabel)}>Created:</span>{" "}
                {formatDate(item.fileMeta.createdAt)}
              </span>
              <span {...stylex.props(styles.separator)}>•</span>
              <span>
                <span {...stylex.props(styles.metadataLabel)}>Modified:</span>{" "}
                {formatDate(item.fileMeta.updatedAt)}
              </span>
            </div>
            <div {...stylex.props(styles.indexRow)}>
              <span {...stylex.props(styles.metadataLabel)}>Index status</span>
              <DesktopIndexStatusLabel status={item.indexState.status} />
              <Button
                type="button"
                disabled={isReindexing}
                onClick={() => {
                  setIsReindexing(true);
                  void reindexFile(item.fileMeta.id).finally(() => setIsReindexing(false));
                }}
                {...stylex.props(styles.reindexButton)}
              >
                <ArrowClockwiseIcon {...stylex.props(styles.reindexIcon)} />
                {isReindexing ? "Queued…" : "Reindex"}
              </Button>
              {item.indexState.indexedAt ? (
                <span {...stylex.props(styles.updatedAt)}>
                  Updated {formatDate(item.indexState.indexedAt)}
                </span>
              ) : null}
            </div>
            {item.indexState.summary ? (
              <p {...stylex.props(styles.summary)}>{item.indexState.summary}</p>
            ) : null}
          </div>
        )}

        <div {...stylex.props(styles.previewBody)}>{renderPreview()}</div>
      </div>
    </DesktopWindow>
  );
}
