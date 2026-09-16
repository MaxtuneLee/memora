import { useCallback, useEffect, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { useAppStore } from "@/livestore/store";
import { Toast } from "@base-ui/react/toast";
import { useLocation, useNavigate } from "react-router";
import { Desktop, UploadDialog } from "@/components/desktop";
import { useUploadDialog } from "@/hooks/desktop/useUploadDialog";
import { desktopFilesQuery$ } from "@/lib/desktop/queries";
import { prepareUploadNameWithPathPolicy } from "@/lib/editor/pathMutations";
import { fileEvents } from "@/livestore/file";
import {
  deleteRecording as deleteFile,
  getMediaDuration,
  saveRecording,
} from "@/lib/library/fileService";
import type { FileType, RecordingMeta } from "@/types/library";
import type { PendingDesktopIntent, SearchNavigationState } from "@/types/search";
import ToastStack from "@/components/ToastStack";

const styles = stylex.create({
  root: {
    height: "100%",
    width: "100%",
  },
  fileInput: {
    display: "none",
  },
  toast: {
    alignItems: "flex-start",
    backgroundColor: "white",
    borderColor: "#e4e4e7",
    borderRadius: "1rem",
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
    display: "flex",
    gap: "0.75rem",
    paddingBlock: "0.75rem",
    paddingInline: "1rem",
    transitionDuration: "150ms",
    transitionProperty: "color, background-color, border-color, opacity, box-shadow, transform",
  },
  statusDot: {
    borderRadius: "9999px",
    display: "block",
    flexShrink: 0,
    height: "0.5rem",
    marginTop: "0.25rem",
    width: "0.5rem",
  },
  statusSuccess: {
    backgroundColor: "#10b981",
  },
  statusError: {
    backgroundColor: "#f43f5e",
  },
  statusDefault: {
    backgroundColor: "#a1a1aa",
  },
  toastBody: {
    flex: 1,
    minWidth: 0,
  },
  toastTitle: {
    color: "#18181b",
    fontSize: "0.875rem",
    fontWeight: 500,
    lineHeight: "1.25rem",
  },
  toastDescription: {
    color: "#71717a",
    fontSize: "0.75rem",
    lineHeight: "1rem",
    marginTop: "0.125rem",
  },
  toastClose: {
    color: {
      default: "#a1a1aa",
      ":hover": "#3f3f46",
    },
    flexShrink: 0,
    transitionDuration: "150ms",
    transitionProperty: "color",
  },
  closeIcon: {
    fontSize: "0.75rem",
    lineHeight: "1rem",
  },
});

export const Component = () => {
  const store = useAppStore();
  const fileRows = store.useQuery(desktopFilesQuery$);
  const location = useLocation();
  const navigate = useNavigate();
  const { add, close } = Toast.useToastManager();

  const {
    audioInputRef,
    selectedFile,
    uploadName,
    setUploadName,
    isUploading,
    setIsUploading,
    isOpen,
    handleInputChange,
    handleCancel,
    openFilePicker,
    setSelectedFile,
  } = useUploadDialog();

  const [uploadParentId, setUploadParentId] = useState<string | null>(null);
  const [externalIntent, setExternalIntent] = useState<PendingDesktopIntent | null>(null);

  const resolveFileType = useCallback((file: File): FileType => {
    if (file.type.startsWith("video/")) return "video";
    if (file.type.startsWith("image/")) return "image";
    if (file.type.startsWith("text/")) return "document";
    if (file.type.startsWith("application/")) return "document";
    const ext = file.name.toLowerCase();
    if (
      ext.endsWith(".md") ||
      ext.endsWith(".pdf") ||
      ext.endsWith(".doc") ||
      ext.endsWith(".docx") ||
      ext.endsWith(".txt")
    )
      return "document";
    if (file.type.startsWith("audio/")) return "audio";
    return "audio";
  }, []);

  const uploadSingleFile = useCallback(
    async (file: File, name: string, parentId: string | null) => {
      const createdAt = Date.now();
      const type = resolveFileType(file);
      const normalizedName = prepareUploadNameWithPathPolicy(fileRows, {
        name,
        mimeType: file.type,
        parentId,
        sourceName: file.name,
        type,
      });
      const isMedia = type === "audio" || type === "video";

      const [result, detectedDuration] = await Promise.all([
        saveRecording({
          blob: file,
          name: normalizedName,
          type,
          mimeType: file.type,
          parentId,
          createdAt,
        }),
        isMedia ? getMediaDuration(file) : Promise.resolve(null),
      ]);

      const durationSec = detectedDuration ?? result.meta.durationSec ?? undefined;
      const createdAtDate = new Date(result.meta.createdAt);

      store.commit(
        fileEvents.fileCreated({
          id: result.id,
          name: result.meta.name,
          type: result.meta.type,
          mimeType: result.meta.mimeType,
          sizeBytes: result.meta.sizeBytes,
          storageType: result.meta.storageType,
          storagePath: result.meta.storagePath,
          parentId: result.meta.parentId ?? null,
          positionX: result.meta.positionX ?? null,
          positionY: result.meta.positionY ?? null,
          durationSec,
          createdAt: createdAtDate,
        }),
      );

      return result;
    },
    [fileRows, resolveFileType, store],
  );

  const handleUploadConfirm = useCallback(async () => {
    if (!selectedFile) return;
    setIsUploading(true);
    try {
      await uploadSingleFile(selectedFile, uploadName || selectedFile.name, uploadParentId);
      add({ title: "File uploaded", type: "success" });
    } catch (err) {
      console.error("Failed to upload file:", err);
      add({
        title: "Upload failed",
        description: err instanceof Error ? err.message : "An unknown error occurred.",
        type: "error",
      });
    } finally {
      setIsUploading(false);
      setSelectedFile(null);
      setUploadName("");
      setUploadParentId(null);
    }
  }, [
    selectedFile,
    uploadName,
    uploadParentId,
    uploadSingleFile,
    setIsUploading,
    setSelectedFile,
    setUploadName,
    add,
  ]);

  const handleNativeFileDrop = useCallback(
    async (files: File[], parentId: string | null) => {
      let successCount = 0;
      let failCount = 0;
      const plannedFiles = fileRows.map((row) => ({
        id: row.id,
        name: row.name,
        parentId: row.parentId ?? null,
        type: row.type,
        mimeType: row.mimeType,
      }));

      for (const file of files) {
        const baseName = file.name.replace(/\.[^/.]+$/, "") || file.name;
        try {
          const type = resolveFileType(file);
          const normalizedName = prepareUploadNameWithPathPolicy(plannedFiles, {
            name: baseName,
            mimeType: file.type,
            parentId,
            sourceName: file.name,
            type,
          });
          plannedFiles.push({
            id: `pending-${successCount + failCount}-${file.name}`,
            name: normalizedName,
            parentId,
            type,
            mimeType: file.type,
          });
          await uploadSingleFile(file, normalizedName, parentId);
          successCount += 1;
        } catch (err) {
          console.error("Failed to upload dropped file:", err);
          failCount += 1;
        }
      }

      if (successCount > 0) {
        add({
          title: `${successCount} file${successCount > 1 ? "s" : ""} uploaded`,
          type: "success",
        });
      }
      if (failCount > 0) {
        add({
          title: `${failCount} file${failCount > 1 ? "s" : ""} failed to upload`,
          type: "error",
        });
      }
    },
    [add, fileRows, resolveFileType, uploadSingleFile],
  );

  const handleOpenFilePicker = useCallback(
    (parentId: string | null) => {
      setUploadParentId(parentId);
      openFilePicker();
    },
    [openFilePicker],
  );

  const handleDeleteFile = useCallback(async (file: RecordingMeta) => {
    await deleteFile(file);
  }, []);

  const handleExternalIntentHandled = useCallback((requestId: string) => {
    setExternalIntent((prev) => (prev?.requestId === requestId ? null : prev));
  }, []);

  useEffect(() => {
    const routeState = location.state as SearchNavigationState | null;
    const pendingIntent = routeState?.searchDesktopIntent;
    if (!pendingIntent) {
      return;
    }

    setExternalIntent(pendingIntent);
    void navigate(`${location.pathname}${location.search}`, {
      replace: true,
      state: null,
    });
  }, [location.pathname, location.search, location.state, navigate]);

  const toastIconStyle = (type?: string) => {
    switch (type) {
      case "success":
        return styles.statusSuccess;
      case "error":
        return styles.statusError;
      default:
        return styles.statusDefault;
    }
  };

  return (
    <div {...stylex.props(styles.root)}>
      <Desktop
        externalIntent={externalIntent}
        onExternalIntentHandled={handleExternalIntentHandled}
        onUploadFile={handleOpenFilePicker}
        onNativeFileDrop={handleNativeFileDrop}
        onDeleteFile={handleDeleteFile}
      />

      <input
        ref={audioInputRef}
        type="file"
        accept="audio/*,video/*,image/*,text/*,application/pdf,.md,.pdf,.doc,.docx"
        {...stylex.props(styles.fileInput)}
        onChange={handleInputChange}
      />

      <UploadDialog
        isOpen={isOpen}
        selectedFile={selectedFile}
        uploadName={uploadName}
        setUploadName={setUploadName}
        isUploading={isUploading}
        onCancel={handleCancel}
        onConfirm={handleUploadConfirm}
      />

      <ToastStack
        render={(toast) => (
          <Toast.Content {...stylex.props(styles.toast)}>
            <span {...stylex.props(styles.statusDot, toastIconStyle(toast.type as string))} />
            <div {...stylex.props(styles.toastBody)}>
              <Toast.Title {...stylex.props(styles.toastTitle)}>
                {toast.title as string}
              </Toast.Title>
              {toast.description && (
                <Toast.Description {...stylex.props(styles.toastDescription)}>
                  {toast.description as string}
                </Toast.Description>
              )}
            </div>
            <Toast.Close {...stylex.props(styles.toastClose)} onClick={() => close(toast.id)}>
              <span {...stylex.props(styles.closeIcon)}>&#10005;</span>
            </Toast.Close>
          </Toast.Content>
        )}
      />
    </div>
  );
};
