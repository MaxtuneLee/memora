import type { ChatSessionSummary } from "@/lib/chat/chatSessionStorage";
import { formatBytes, formatDateTime, formatDuration } from "@/lib/format";
import type { file as LiveStoreFile } from "@/livestore/file";
import type { folder as LiveStoreFolder } from "@/livestore/folder";
import type { GlobalSearchItem } from "@/types/search";

const FILE_TYPE_LABELS: Record<LiveStoreFile["type"], string> = {
  audio: "Audio",
  video: "Video",
  image: "Image",
  document: "Document",
};

const buildFolderPathSegments = (
  folderId: string | null,
  folderById: Map<string, LiveStoreFolder>,
): string[] => {
  if (!folderId) {
    return ["Desktop"];
  }

  const segments: string[] = [];
  let currentId: string | null = folderId;
  const visited = new Set<string>();

  while (currentId) {
    if (visited.has(currentId)) {
      break;
    }

    visited.add(currentId);
    const folder = folderById.get(currentId);
    if (!folder) {
      break;
    }

    segments.unshift(folder.name || "Untitled folder");
    currentId = folder.parentId ?? null;
  }

  return ["Desktop", ...segments];
};

const buildFolderPathLabel = (
  folderId: string | null,
  folderById: Map<string, LiveStoreFolder>,
): string => {
  return buildFolderPathSegments(folderId, folderById).join(" / ");
};

const formatFileMetadataPreview = (file: LiveStoreFile): string => {
  const parts: string[] = [];

  if (typeof file.sizeBytes === "number" && file.sizeBytes > 0) {
    parts.push(formatBytes(file.sizeBytes));
  }

  if (
    (file.type === "audio" || file.type === "video") &&
    typeof file.durationSec === "number" &&
    Number.isFinite(file.durationSec)
  ) {
    parts.push(formatDuration(file.durationSec));
  }

  if (file.updatedAt instanceof Date) {
    parts.push(`Updated ${formatDateTime(file.updatedAt.getTime())}`);
  }

  return parts.join(" • ") || "Open file details";
};

export const buildFileSearchItems = (
  files: readonly LiveStoreFile[],
  folders: readonly LiveStoreFolder[],
): GlobalSearchItem[] => {
  const folderById = new Map(folders.map((folder) => [folder.id, folder]));

  return files.map((file) => {
    const parentPath = buildFolderPathLabel(file.parentId ?? null, folderById);
    const preview =
      file.indexSummary?.trim() || formatFileMetadataPreview(file);
    const typeLabel = FILE_TYPE_LABELS[file.type];
    const pathSegments = buildFolderPathSegments(file.parentId ?? null, folderById);

    return {
      id: `file:${file.id}`,
      kind: "file",
      title: file.name,
      description: `${typeLabel} in ${parentPath}`,
      preview,
      keywords: [
        file.name,
        file.type,
        typeLabel,
        file.mimeType,
        ...pathSegments,
      ],
      updatedAt:
        file.updatedAt instanceof Date ? file.updatedAt.getTime() : undefined,
      intent:
        file.type === "audio" || file.type === "video"
          ? {
              type: "navigate",
              to: `/transcript/file/${file.id}`,
            }
          : {
              type: "desktop-intent",
              to: "/",
              desktopIntent: {
                type: "openPreview",
                fileId: file.id,
              },
            },
    } satisfies GlobalSearchItem;
  });
};

export const buildFolderSearchItems = (
  folders: readonly LiveStoreFolder[],
  files: readonly LiveStoreFile[],
): GlobalSearchItem[] => {
  const folderById = new Map(folders.map((folder) => [folder.id, folder]));
  const childCounts = new Map<string | null, number>();

  folders.forEach((folder) => {
    const current = childCounts.get(folder.parentId ?? null) ?? 0;
    childCounts.set(folder.parentId ?? null, current + 1);
  });

  files.forEach((file) => {
    const current = childCounts.get(file.parentId ?? null) ?? 0;
    childCounts.set(file.parentId ?? null, current + 1);
  });

  return folders.map((folder) => {
    const fullPath = buildFolderPathLabel(folder.id, folderById);
    const childCount = childCounts.get(folder.id) ?? 0;
    const parentPath = buildFolderPathLabel(folder.parentId ?? null, folderById);

    return {
      id: `folder:${folder.id}`,
      kind: "folder",
      title: folder.name,
      description: `Folder in ${parentPath}`,
      preview:
        childCount > 0
          ? `${childCount} item${childCount === 1 ? "" : "s"} inside ${fullPath}.`
          : `Open folder on desktop at ${fullPath}.`,
      keywords: [folder.name, fullPath, parentPath, "folder", "desktop"],
      updatedAt:
        folder.updatedAt instanceof Date ? folder.updatedAt.getTime() : undefined,
      intent: {
        type: "desktop-intent",
        to: "/",
        desktopIntent: {
          type: "openFolder",
          folderId: folder.id,
        },
      },
    } satisfies GlobalSearchItem;
  });
};

export const buildChatSessionSearchItems = (
  sessions: readonly ChatSessionSummary[],
): GlobalSearchItem[] => {
  return sessions.map((session) => ({
    id: `chat:${session.id}`,
    kind: "chat",
    title: session.title,
    description: `Chat session • Updated ${formatDateTime(session.updatedAt)}`,
    preview: session.preview || "No messages yet.",
    keywords: [
      session.title,
      "chat",
      "session",
      "assistant",
      "conversation",
    ],
    updatedAt: session.updatedAt,
    intent: {
      type: "open-chat-session",
      sessionId: session.id,
    },
  }));
};
