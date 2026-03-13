import { useMemo } from "react";

import { useFiles } from "@/hooks/library/useFiles";

export const useMediaFiles = () => {
  const fileState = useFiles({ mediaOnly: true });

  return useMemo(
    () => ({
      recordings: fileState.files,
      activeRecordingId: fileState.activeFileId,
      selectRecording: fileState.selectFile,
      refreshRecordings: fileState.refreshFiles,
      getRecordingAudioUrl: fileState.getFileAudioUrl,
      setActiveRecordingId: fileState.setActiveFileId,
      deleteRecording: fileState.deleteFile,
    }),
    [fileState],
  );
};

export const useRecordings = useMediaFiles;
