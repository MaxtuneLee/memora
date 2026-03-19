import { useEffect, useRef } from "react";

import type { PendingDesktopIntent } from "@/types/search";

export const useDesktopExternalIntent = ({
  externalIntent,
  onExternalIntentHandled,
  onUploadFile,
  onOpenPreview,
  onOpenFolder,
  onNewFolder,
  onOpenTrash,
}: {
  externalIntent: PendingDesktopIntent | null;
  onExternalIntentHandled?: (requestId: string) => void;
  onUploadFile: (parentId: string | null) => void;
  onOpenPreview: (fileId: string) => void;
  onOpenFolder: (folderId: string | null) => void;
  onNewFolder: (parentId: string | null) => void;
  onOpenTrash: () => void;
}) => {
  const lastHandledExternalIntentRef = useRef<string | null>(null);

  useEffect(() => {
    if (!externalIntent) {
      return;
    }
    if (lastHandledExternalIntentRef.current === externalIntent.requestId) {
      return;
    }
    lastHandledExternalIntentRef.current = externalIntent.requestId;

    switch (externalIntent.intent.type) {
      case "openPreview":
        onOpenPreview(externalIntent.intent.fileId);
        break;
      case "openFolder":
        onOpenFolder(externalIntent.intent.folderId);
        break;
      case "newFolder":
        onNewFolder(externalIntent.intent.parentId);
        break;
      case "openTrash":
        onOpenTrash();
        break;
      case "uploadFile":
        onUploadFile(externalIntent.intent.parentId);
        break;
    }

    onExternalIntentHandled?.(externalIntent.requestId);
  }, [
    externalIntent,
    onExternalIntentHandled,
    onNewFolder,
    onOpenFolder,
    onOpenPreview,
    onOpenTrash,
    onUploadFile,
  ]);
};
