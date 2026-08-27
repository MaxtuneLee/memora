import type { SettingsSectionId } from "@/types/settings";
import type { ContentLocator } from "@/lib/content/types";
import type { FileType } from "@/types/library";

export type SearchItemKind =
  | "file"
  | "content"
  | "folder"
  | "chat"
  | "settings"
  | "page"
  | "action";

export type DesktopIntent =
  | {
      type: "openPreview";
      fileId: string;
      locator?: ContentLocator;
    }
  | {
      type: "openFolder";
      folderId: string | null;
    }
  | {
      type: "newFolder";
      parentId: string | null;
    }
  | {
      type: "openTrash";
    }
  | {
      type: "uploadFile";
      parentId: string | null;
    };

export interface PendingDesktopIntent {
  requestId: string;
  intent: DesktopIntent;
}

export interface SearchNavigationState {
  searchDesktopIntent?: PendingDesktopIntent;
}

export type SearchIntent =
  | {
      type: "navigate";
      to: string;
    }
  | {
      type: "open-settings";
      section: SettingsSectionId;
    }
  | {
      type: "open-chat-session";
      sessionId: string;
    }
  | {
      type: "desktop-intent";
      to?: string;
      desktopIntent: DesktopIntent;
    };

export interface GlobalSearchItem {
  id: string;
  kind: SearchItemKind;
  title: string;
  description: string;
  preview: string;
  keywords: string[];
  updatedAt?: number;
  fileIcon?: {
    name: string;
    mimeType: string;
    type: FileType;
  };
  intent: SearchIntent;
}
