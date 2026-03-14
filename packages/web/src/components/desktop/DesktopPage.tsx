import { useCallback, useEffect, useState } from "react";
import { useStore } from "@livestore/react";
import { Toast } from "@base-ui/react/toast";
import { useLocation, useNavigate } from "react-router";
import { Desktop, UploadDialog } from "@/components/desktop";
import { useUploadDialog } from "@/hooks/desktop/useUploadDialog";
import { fileEvents } from "@/livestore/file";
import { deleteRecording as deleteFile, getMediaDuration, saveRecording } from "@/lib/library/fileService";
import type { FileType, RecordingMeta } from "@/types/library";
import type { PendingDesktopIntent, SearchNavigationState } from "@/types/search";
import ToastStack from "@/components/ToastStack";

export const Component = () => {
  const { store } = useStore();
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
  const [externalIntent, setExternalIntent] =
    useState<PendingDesktopIntent | null>(null);

  const resolveFileType = useCallback((file: File): FileType => {
    if (file.type.startsWith("video/")) return "video";
    if (file.type.startsWith("image/")) return "image";
    if (file.type.startsWith("text/")) return "document";
    if (file.type.startsWith("application/")) return "document";
    const ext = file.name.toLowerCase();
    if (ext.endsWith(".md") || ext.endsWith(".pdf") || ext.endsWith(".doc") || ext.endsWith(".docx") || ext.endsWith(".txt")) return "document";
    if (file.type.startsWith("audio/")) return "audio";
    return "audio";
  }, []);

  const uploadSingleFile = useCallback(
    async (file: File, name: string, parentId: string | null) => {
      const createdAt = Date.now();
      const type = resolveFileType(file);
      const isMedia = type === "audio" || type === "video";

      const [result, detectedDuration] = await Promise.all([
        saveRecording({
          blob: file,
          name,
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
    [resolveFileType, store],
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
  }, [selectedFile, uploadName, uploadParentId, uploadSingleFile, setIsUploading, setSelectedFile, setUploadName, add]);

  const handleNativeFileDrop = useCallback(
    async (files: File[], parentId: string | null) => {
      let successCount = 0;
      let failCount = 0;

      await Promise.all(
        files.map(async (file) => {
          const baseName = file.name.replace(/\.[^/.]+$/, "") || file.name;
          try {
            await uploadSingleFile(file, baseName, parentId);
            successCount += 1;
          } catch (err) {
            console.error("Failed to upload dropped file:", err);
            failCount += 1;
          }
        }),
      );

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
    [uploadSingleFile, add],
  );

  const handleOpenFilePicker = useCallback(
    (parentId: string | null) => {
      setUploadParentId(parentId);
      openFilePicker();
    },
    [openFilePicker],
  );

  const handleDeleteFile = useCallback(
    async (file: RecordingMeta) => {
      await deleteFile(file);
    },
    [],
  );

  const handleExternalIntentHandled = useCallback((requestId: string) => {
    setExternalIntent((prev) =>
      prev?.requestId === requestId ? null : prev,
    );
  }, []);

  useEffect(() => {
    const routeState = location.state as SearchNavigationState | null;
    const pendingIntent = routeState?.searchDesktopIntent;
    if (!pendingIntent) {
      return;
    }

    setExternalIntent(pendingIntent);
    navigate(`${location.pathname}${location.search}`, {
      replace: true,
      state: null,
    });
  }, [location.pathname, location.search, location.state, navigate]);

  const toastIconColor = (type?: string) => {
    switch (type) {
      case "success":
        return "bg-emerald-500";
      case "error":
        return "bg-rose-500";
      default:
        return "bg-zinc-400";
    }
  };

  return (
    <div className="h-full w-full">
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
        className="hidden"
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
          <Toast.Content className="flex items-start gap-3 transition">
            <span
              className={`mt-1 block size-2 shrink-0 rounded-full ${toastIconColor(toast.type as string)}`}
            />
            <div className="min-w-0 flex-1">
              <Toast.Title className="text-sm font-medium text-zinc-900">
                {toast.title as string}
              </Toast.Title>
              {toast.description && (
                <Toast.Description className="mt-0.5 text-xs text-zinc-500">
                  {toast.description as string}
                </Toast.Description>
              )}
            </div>
            <Toast.Close
              className="shrink-0 text-zinc-400 transition hover:text-zinc-700"
              onClick={() => close(toast.id)}
            >
              <span className="text-xs">&#10005;</span>
            </Toast.Close>
          </Toast.Content>
        )}
      />
    </div>
  );
};
