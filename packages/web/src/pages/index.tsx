import { useCallback, useState } from "react";
import { useStore } from "@livestore/react";
import { Desktop, UploadDialog, useUploadDialog } from "@/features/desktop";
import { fileEvents } from "@/livestore/file";
import { deleteRecording as deleteFile, getMediaDuration, saveRecording } from "@/lib/fileService";
import type { FileType, RecordingMeta } from "@/lib/files";

export const Component = () => {
  const { store } = useStore();

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

  const resolveFileType = useCallback((file: File): FileType => {
    if (file.type.startsWith("video/")) return "video";
    if (file.type.startsWith("image/")) return "image";
    if (file.type.startsWith("text/")) return "document";
    if (file.name.toLowerCase().endsWith(".md")) return "document";
    return "audio";
  }, []);

  const handleUploadConfirm = useCallback(async () => {
    if (!selectedFile) return;
    setIsUploading(true);
    try {
      const createdAt = Date.now();
      const type = resolveFileType(selectedFile);
      const isMedia = type === "audio" || type === "video";

      const [result, detectedDuration] = await Promise.all([
        saveRecording({
          blob: selectedFile,
          name: uploadName || selectedFile.name,
          type,
          mimeType: selectedFile.type,
          parentId: uploadParentId,
          createdAt,
        }),
        isMedia ? getMediaDuration(selectedFile) : Promise.resolve(null),
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
    } catch (err) {
      console.error("Failed to upload file:", err);
    } finally {
      setIsUploading(false);
      setSelectedFile(null);
      setUploadName("");
      setUploadParentId(null);
    }
  }, [selectedFile, uploadName, store, setIsUploading, setSelectedFile, setUploadName, resolveFileType, uploadParentId]);

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

  return (
    <div className="h-full w-full">
      <Desktop onUploadFile={handleOpenFilePicker} onDeleteFile={handleDeleteFile} />

      {/* Hidden file input for upload */}
      <input
        ref={audioInputRef}
        type="file"
        accept="audio/*,video/*,image/*,text/*,.md"
        className="hidden"
        onChange={handleInputChange}
      />

      {/* Upload confirmation dialog */}
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
