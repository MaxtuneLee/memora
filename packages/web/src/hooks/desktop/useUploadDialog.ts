import { useCallback, useRef, useState } from "react";

import { normalizePathAddressableUploadName } from "@/lib/editor/pathMutations";
import type { FileType } from "@/types/library";

const resolveUploadDialogFileType = (file: File): FileType | null => {
  if (file.type.startsWith("image/")) {
    return "image";
  }
  if (file.type.startsWith("text/") || file.type.startsWith("application/")) {
    return "document";
  }

  const lowerName = file.name.toLowerCase();
  if (
    lowerName.endsWith(".md") ||
    lowerName.endsWith(".pdf") ||
    lowerName.endsWith(".doc") ||
    lowerName.endsWith(".docx") ||
    lowerName.endsWith(".txt")
  ) {
    return "document";
  }

  return null;
};

export function useUploadDialog() {
  const audioInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadName, setUploadName] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  const isOpen = selectedFile !== null;

  const handleInputChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);

    const resolvedType = resolveUploadDialogFileType(file);
    if (resolvedType === "document" || resolvedType === "image") {
      setUploadName(normalizePathAddressableUploadName(file.name, file.type, resolvedType));
    } else {
      const baseName = file.name.replace(/\.[^/.]+$/, "");
      setUploadName(baseName || file.name);
    }

    // Reset input so re-selecting same file triggers change
    event.target.value = "";
  }, []);

  const handleCancel = useCallback(() => {
    setSelectedFile(null);
    setUploadName("");
  }, []);

  const openFilePicker = useCallback(() => {
    audioInputRef.current?.click();
  }, []);

  return {
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
  };
}
