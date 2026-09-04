import { Button } from "@base-ui/react/button";
import {
  FolderIcon,
  ArrowClockwiseIcon,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";

import { getDocumentEditorHref, isEditableTextDocument } from "@/lib/editor/editableTextDocument";
import { getFileIcon } from "@/lib/library/fileIcon";
import { getFileViewerHref, isFileViewerFile } from "@/lib/library/fileViewer";
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
import type { JSX } from "react";

type PreviewableItem = DesktopFileItem | DesktopFolderItem;

interface DesktopPreviewWindowProps {
  id: string;
  item: PreviewableItem;
  position: DesktopWindowPosition;
  size: DesktopWindowSize;
  zIndex: number;
  isFocused: boolean;
  // ponytail: accepted at the component boundary for future "jump to location" support;
  // not yet threaded into the underlying viewers (DocumentFilePreview / audio / video),
  // which don't have a jump-to-X prop today — wire that up as a follow-up.
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

  if (isFileViewerFile(fileMeta)) {
    return getFileViewerHref(fileMeta.id);
  }

  return "/files";
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
      return <FolderIcon className="size-10 text-blue-500" weight="duotone" />;
    }
    const Icon = getFileIcon(item.fileMeta);
    return <Icon className="size-10 text-zinc-500" weight="duotone" />;
  };

  const handleOpen = () => {
    if (item.type === "file") {
      void navigate(getFileOpenHref(item.fileMeta));
    }
  };

  const renderPreview = () => {
    if (!isFile) {
      return (
        <div className="flex h-full items-center justify-center text-sm text-zinc-500">
          Folder preview not available.
        </div>
      );
    }

    if (item.fileMeta.type === "audio") {
      return (
        <div className="flex h-full flex-col justify-center gap-4 p-4">
          <audio controls src={previewUrl ?? undefined} className="w-full" />
        </div>
      );
    }

    if (item.fileMeta.type === "video") {
      return (
        <div className="h-full p-3">
          <video
            controls
            src={previewUrl ?? undefined}
            className="h-full w-full rounded-lg bg-black/80"
          />
        </div>
      );
    }

    if (item.fileMeta.type === "image") {
      return (
        <div className="flex h-full items-center justify-center bg-zinc-50 p-3">
          {previewUrl ? (
            <img
              src={previewUrl}
              alt={item.name}
              loading="lazy"
              width={512}
              height={512}
              className="max-h-full max-w-full rounded-lg object-contain shadow"
            />
          ) : (
            <span className="text-sm text-zinc-500">Loading image...</span>
          )}
        </div>
      );
    }

    if (item.fileMeta.type === "document") {
      if (!isTextMime(mimeType)) {
        return (
          <div className="h-full overflow-hidden bg-zinc-50 p-3">
            {previewFile ? (
              <DocumentFilePreview file={previewFile} />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-zinc-500">
                Loading document preview…
              </div>
            )}
          </div>
        );
      }
      if (textStatus === "error") {
        return (
          <div className="flex h-full items-center justify-center text-sm text-zinc-500">
            Preview not available for this file.
          </div>
        );
      }
      return (
        <div className="h-full overflow-auto bg-zinc-50 p-4">
          <pre className="whitespace-pre-wrap text-xs leading-relaxed text-zinc-700">
            {textStatus === "loading"
              ? "Loading text…"
              : textContent?.trim() || "Preview not available."}
          </pre>
        </div>
      );
    }

    return (
      <div className="flex h-full items-center justify-center text-sm text-zinc-500">
        Preview not available.
      </div>
    );
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
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-4 border-b border-zinc-100 px-4 py-3">
          <div
            className="flex shrink-0 items-center justify-center rounded-xl bg-zinc-100"
            style={{ width: ICON_SIZE + 8, height: ICON_SIZE + 8 }}
          >
            {getIcon()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-zinc-900">{item.name}</p>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
              <span>
                <span className="font-medium text-zinc-600">Type:</span> {previewLabel}
              </span>
              {isFile && (
                <span>
                  <span className="font-medium text-zinc-600">Size:</span>{" "}
                  {formatBytes(item.fileMeta.sizeBytes)}
                </span>
              )}
              {isFile && item.fileMeta.durationSec && (
                <span>
                  <span className="font-medium text-zinc-600">Duration:</span>{" "}
                  {formatDuration(item.fileMeta.durationSec)}
                </span>
              )}
            </div>
          </div>
          {isFile && (
            <Button
              onClick={handleOpen}
              className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-zinc-800 cursor-pointer"
            >
              Open
            </Button>
          )}
        </div>

        {isFile && (
          <div className="border-b border-zinc-100 px-4 py-2 text-xs text-zinc-500">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
              <span>
                <span className="font-medium text-zinc-600">Created:</span>{" "}
                {formatDate(item.fileMeta.createdAt)}
              </span>
              <span className="text-zinc-300">•</span>
              <span>
                <span className="font-medium text-zinc-600">Modified:</span>{" "}
                {formatDate(item.fileMeta.updatedAt)}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-2">
              <span className="font-medium text-zinc-600">Index status</span>
              <DesktopIndexStatusLabel status={item.indexState.status} />
              <Button
                type="button"
                disabled={isReindexing}
                onClick={() => {
                  setIsReindexing(true);
                  void reindexFile(item.fileMeta.id).finally(() => setIsReindexing(false));
                }}
                className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 py-1 text-[11px] font-medium text-zinc-600 transition hover:bg-zinc-50 disabled:cursor-wait disabled:opacity-60"
              >
                <ArrowClockwiseIcon className="size-3" />
                {isReindexing ? "Queued…" : "Reindex"}
              </Button>
              {item.indexState.indexedAt ? (
                <span className="text-zinc-400">
                  Updated {formatDate(item.indexState.indexedAt)}
                </span>
              ) : null}
            </div>
            {item.indexState.summary ? (
              <p className="mt-2 line-clamp-2 max-w-2xl leading-5 text-zinc-500">
                {item.indexState.summary}
              </p>
            ) : null}
          </div>
        )}

        <div className="flex-1 overflow-hidden">{renderPreview()}</div>
      </div>
    </DesktopWindow>
  );
}
