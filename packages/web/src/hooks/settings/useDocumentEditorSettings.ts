import { queryDb } from "@livestore/livestore";
import { useAppStore } from "@/livestore/store";
import { useCallback, useMemo } from "react";

import { settingsDocumentQuery$ } from "@/lib/settings/queries";
import { buildFolderBreadcrumbs } from "@/lib/tree/folderTree";
import { folderTable, type folder as LiveStoreFolder } from "@/livestore/folder";
import {
  normalizeSettingsValue,
  settingEvents,
  settingsTable,
  type setting,
} from "@/livestore/setting";

const documentEditorFoldersQuery$ = queryDb(
  () => folderTable.where({ deletedAt: null, purgedAt: null }).orderBy("updatedAt", "desc"),
  { label: "settings:document-editor-folders" },
);

type DefaultNoteLocationMode = setting["defaultNoteLocationMode"];
type AttachmentPlacementMode = setting["attachmentPlacementMode"];

export interface DocumentEditorFolderOption {
  id: string;
  label: string;
}

export interface DocumentEditorSettingsWarning {
  id: "default-note-folder-missing" | "attachment-folder-missing";
  title: string;
  description: string;
}

const buildFolderOptionLabel = (
  folderId: string,
  folders: readonly LiveStoreFolder[],
): string | null => {
  const breadcrumbs = buildFolderBreadcrumbs(folders, folderId, "Desktop");
  if (breadcrumbs.length <= 1) {
    return null;
  }

  return breadcrumbs.map((item) => item.name).join(" / ");
};

export const useDocumentEditorSettings = () => {
  const store = useAppStore();
  const settings = normalizeSettingsValue(
    (store.useQuery(settingsDocumentQuery$) as Partial<setting> | undefined) ??
      settingsTable.default.value,
  );
  const folders = store.useQuery(documentEditorFoldersQuery$) as LiveStoreFolder[];

  const folderOptions = useMemo<DocumentEditorFolderOption[]>(() => {
    return folders
      .map((folder) => {
        const label = buildFolderOptionLabel(folder.id, folders);
        if (!label) {
          return null;
        }

        return {
          id: folder.id,
          label,
        };
      })
      .filter((option): option is DocumentEditorFolderOption => option !== null)
      .sort((left, right) => left.label.localeCompare(right.label));
  }, [folders]);

  const folderById = useMemo(() => {
    return new Map(folderOptions.map((option) => [option.id, option]));
  }, [folderOptions]);

  const warnings = useMemo<DocumentEditorSettingsWarning[]>(() => {
    const nextWarnings: DocumentEditorSettingsWarning[] = [];

    if (
      settings.defaultNoteLocationMode === "folder" &&
      settings.defaultNoteFolderId &&
      !folderById.has(settings.defaultNoteFolderId)
    ) {
      nextWarnings.push({
        id: "default-note-folder-missing",
        title: "Default note folder unavailable",
        description:
          "The configured note folder could not be found. New notes will fall back to Desktop root until you choose another folder.",
      });
    }

    if (
      settings.attachmentPlacementMode === "fixed-folder" &&
      settings.attachmentFolderId &&
      !folderById.has(settings.attachmentFolderId)
    ) {
      nextWarnings.push({
        id: "attachment-folder-missing",
        title: "Attachment folder unavailable",
        description:
          "The configured attachment folder could not be found. New attachments will fall back to Desktop root until you choose another folder.",
      });
    }

    return nextWarnings;
  }, [
    folderById,
    settings.attachmentFolderId,
    settings.attachmentPlacementMode,
    settings.defaultNoteFolderId,
    settings.defaultNoteLocationMode,
  ]);

  const updateSettings = useCallback(
    (patch: Partial<setting>) => {
      store.commit(settingEvents.settingsSet(patch));
    },
    [store],
  );

  const handleDefaultNoteLocationModeChange = useCallback(
    (mode: DefaultNoteLocationMode) => {
      updateSettings({ defaultNoteLocationMode: mode });
    },
    [updateSettings],
  );

  const handleDefaultNoteFolderIdChange = useCallback(
    (folderId: string) => {
      updateSettings({ defaultNoteFolderId: folderId });
    },
    [updateSettings],
  );

  const handleAttachmentPlacementModeChange = useCallback(
    (mode: AttachmentPlacementMode) => {
      updateSettings({ attachmentPlacementMode: mode });
    },
    [updateSettings],
  );

  const handleAttachmentFolderIdChange = useCallback(
    (folderId: string) => {
      updateSettings({ attachmentFolderId: folderId });
    },
    [updateSettings],
  );

  const handleAttachmentSubfolderNameChange = useCallback(
    (value: string) => {
      updateSettings({ attachmentSubfolderName: value });
    },
    [updateSettings],
  );

  const handleEditorFontSizePxChange = useCallback(
    (value: string) => {
      const parsedValue = Number(value);
      if (!Number.isFinite(parsedValue)) {
        return;
      }

      updateSettings({ editorFontSizePx: Math.max(1, Math.round(parsedValue)) });
    },
    [updateSettings],
  );

  return {
    settings,
    folderOptions,
    warnings,
    handleDefaultNoteLocationModeChange,
    handleDefaultNoteFolderIdChange,
    handleAttachmentPlacementModeChange,
    handleAttachmentFolderIdChange,
    handleAttachmentSubfolderNameChange,
    handleEditorFontSizePxChange,
  };
};
