import {
  ChatCircleDotsIcon,
  MicrophoneIcon,
  UploadSimpleIcon,
  VideoCameraIcon,
} from "@phosphor-icons/react";
import type { ComponentType } from "react";

import { getDocumentEditorHref, isEditableTextDocument } from "@/lib/editor/editableTextDocument";
import { getFileIcon } from "@/lib/library/fileIcon";
import { formatBytes, formatDuration } from "@/lib/format";
import type { ChatSessionSummary } from "@/lib/chat/chatSessionStorage";
import type { FileMeta } from "@/types/library";

export type RecentIconWeight = "regular" | "fill" | "duotone" | "bold";

export interface RecentItem {
  id: string;
  title: string;
  subtitle: string;
  href: string;
  updatedAt: number;
  icon: ComponentType<{ className?: string; weight?: RecentIconWeight }>;
  iconWeight?: RecentIconWeight;
  tone: "recording" | "file" | "chat";
}

export const getFileHref = (file: Pick<FileMeta, "id" | "mimeType" | "name" | "type">): string => {
  if (file.type === "audio" || file.type === "video") {
    return `/transcript/file/${file.id}`;
  }

  if (isEditableTextDocument(file)) {
    return getDocumentEditorHref(file.id);
  }

  return "/desktop";
};

const formatRelativeTimestamp = (timestamp: number): string => {
  if (!Number.isFinite(timestamp)) {
    return "Just now";
  }

  const deltaMs = Date.now() - timestamp;
  const minutes = Math.max(0, Math.floor(deltaMs / 60000));

  if (minutes < 1) {
    return "Just now";
  }

  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }

  const days = Math.floor(hours / 24);

  if (days < 7) {
    return `${days} day${days === 1 ? "" : "s"} ago`;
  }

  return new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
};

const formatChatTimestamp = (timestamp: number): string => {
  if (!Number.isFinite(timestamp)) {
    return "No messages yet";
  }

  return new Date(timestamp).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const buildFileRecentItem = (file: FileMeta): RecentItem => {
  if (file.type === "audio" || file.type === "video") {
    return {
      id: `file:${file.id}`,
      title: file.name,
      subtitle: [
        "Recording",
        file.transcriptPath
          ? "Transcript ready"
          : `Updated ${formatRelativeTimestamp(file.updatedAt)}`,
        file.durationSec ? `${formatDuration(file.durationSec)} long` : null,
      ]
        .filter(Boolean)
        .join(" • "),
      href: getFileHref(file),
      updatedAt: file.updatedAt,
      icon: file.type === "video" ? VideoCameraIcon : MicrophoneIcon,
      iconWeight: file.type === "video" ? "fill" : "regular",
      tone: "recording",
    };
  }

  return {
    id: `file:${file.id}`,
    title: file.name,
    subtitle: `File • ${formatBytes(file.sizeBytes)} • Updated ${formatRelativeTimestamp(file.updatedAt)}`,
    href: getFileHref(file),
    updatedAt: file.updatedAt,
    icon: getFileIcon(file),
    iconWeight: "fill",
    tone: "file",
  };
};

const buildChatRecentItem = (session: ChatSessionSummary): RecentItem => {
  return {
    id: `chat:${session.id}`,
    title: session.title,
    subtitle: `Chat • Last message ${formatChatTimestamp(session.updatedAt)}`,
    href: `/chat?session=${encodeURIComponent(session.id)}`,
    updatedAt: session.updatedAt,
    icon: ChatCircleDotsIcon,
    iconWeight: "fill",
    tone: "chat",
  };
};

export const buildRecentItems = (
  files: FileMeta[],
  chatSessions: ChatSessionSummary[],
): RecentItem[] => {
  const fileItems = files.map(buildFileRecentItem);
  const chatItems = chatSessions.map(buildChatRecentItem);
  const merged = [...fileItems, ...chatItems]
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, 5);

  if (merged.length > 0) {
    return merged;
  }

  return [
    {
      id: "empty:recording",
      title: "Start your first recording",
      subtitle: "Capture an idea and it will show up here.",
      href: "/transcript/live",
      updatedAt: 0,
      icon: MicrophoneIcon,
      iconWeight: "regular",
      tone: "recording",
    },
    {
      id: "empty:upload",
      title: "Upload reference material",
      subtitle: "Bring in notes, slides, or PDFs for later.",
      href: "/desktop",
      updatedAt: 0,
      icon: UploadSimpleIcon,
      iconWeight: "regular",
      tone: "file",
    },
    {
      id: "empty:chat",
      title: "Open a fresh chat",
      subtitle: "Use Chat when you want to reason across your material.",
      href: "/chat",
      updatedAt: 0,
      icon: ChatCircleDotsIcon,
      iconWeight: "fill",
      tone: "chat",
    },
  ];
};
