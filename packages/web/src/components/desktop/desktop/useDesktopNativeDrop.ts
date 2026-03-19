import { useCallback, useRef, useState, type DragEvent } from "react";

export const useDesktopNativeDrop = ({
  onNativeFileDrop,
}: {
  onNativeFileDrop?: (files: File[], parentId: string | null) => void;
}) => {
  const [nativeDragOver, setNativeDragOver] = useState(false);
  const nativeDragCounterRef = useRef(0);

  const handleNativeDragEnter = useCallback((event: DragEvent) => {
    if (!event.dataTransfer.types.includes("Files")) {
      return;
    }
    event.preventDefault();
    nativeDragCounterRef.current += 1;
    setNativeDragOver(true);
  }, []);

  const handleNativeDragOver = useCallback((event: DragEvent) => {
    if (!event.dataTransfer.types.includes("Files")) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }, []);

  const handleNativeDragLeave = useCallback(() => {
    nativeDragCounterRef.current -= 1;
    if (nativeDragCounterRef.current <= 0) {
      nativeDragCounterRef.current = 0;
      setNativeDragOver(false);
    }
  }, []);

  const handleNativeDrop = useCallback(
    (event: DragEvent, parentId: string | null = null) => {
      event.preventDefault();
      event.stopPropagation();
      nativeDragCounterRef.current = 0;
      setNativeDragOver(false);
      const files = Array.from(event.dataTransfer.files);
      if (files.length > 0 && onNativeFileDrop) {
        onNativeFileDrop(files, parentId);
      }
    },
    [onNativeFileDrop],
  );

  return {
    nativeDragOver,
    handleNativeDragEnter,
    handleNativeDragOver,
    handleNativeDragLeave,
    handleNativeDrop,
  };
};
