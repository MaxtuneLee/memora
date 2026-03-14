import type { SettingsSectionId } from "@/types/settings";

export type SearchItemKind =
  | "file"
  | "folder"
  | "chat"
  | "settings"
  | "page"
  | "action";

export type DesktopIntent =
  | {
      type: "openPreview";
      fileId: string;
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
  intent: SearchIntent;
}
