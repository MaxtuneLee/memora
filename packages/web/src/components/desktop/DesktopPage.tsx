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

const styles = stylex.create({
  root: {
    height: "100%",
    width: "100%",
  },
  fileInput: {
    display: "none",
  },
});

export const Component = () => {
  const store = useAppStore();
  const fileRows = store.useQuery(desktopFilesQuery$);
  const location = useLocation();
  const navigate = useNavigate();
  const { add } = Toast.useToastManager();

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
    </div>
  );
};
