import { useCallback, useRef, useState } from "react";

export function useUploadDialog() {
  const audioInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadName, setUploadName] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  const isOpen = selectedFile !== null;

  const handleInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      setSelectedFile(file);
      // Pre-fill name: strip extension
      const baseName = file.name.replace(/\.[^/.]+$/, "");
      setUploadName(baseName || file.name);
      // Reset input so re-selecting same file triggers change
      event.target.value = "";
    },
    [],
  );

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
