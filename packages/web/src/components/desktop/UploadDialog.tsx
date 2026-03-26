import { Button } from "@base-ui/react/button";
import { Dialog } from "@base-ui/react/dialog";
import { XIcon } from "@phosphor-icons/react";
import { formatBytes } from "@/lib/format";

const resolveFileLabel = (file: File | null): string => {
  if (!file) return "File";
  if (file.type.startsWith("video/")) return "Video";
  if (file.type.startsWith("image/")) return "Image";
  if (file.type.startsWith("text/") || file.type.startsWith("application/")) return "Document";
  const ext = file.name.toLowerCase();
  if (
    ext.endsWith(".md") ||
    ext.endsWith(".pdf") ||
    ext.endsWith(".doc") ||
    ext.endsWith(".docx") ||
    ext.endsWith(".txt")
  )
    return "Document";
  if (file.type.startsWith("audio/")) return "Audio";
  return "File";
};

interface UploadDialogProps {
  isOpen: boolean;
  selectedFile: File | null;
  uploadName: string;
  setUploadName: (name: string) => void;
  isUploading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function UploadDialog({
  isOpen,
  selectedFile,
  uploadName,
  setUploadName,
  isUploading,
  onCancel,
  onConfirm,
}: UploadDialogProps) {
  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onCancel()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-zinc-950/40 backdrop-blur-sm" />
        <Dialog.Popup className="fixed left-1/2 top-1/2 z-50 w-[min(420px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl">
          <div className="flex items-start justify-between">
            <div>
              <Dialog.Title className="text-lg font-semibold text-zinc-900">
                Upload {resolveFileLabel(selectedFile)}
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-zinc-500">
                Confirm the file details before uploading.
              </Dialog.Description>
            </div>
            <Dialog.Close className="flex size-8 items-center justify-center rounded-full text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-900 cursor-pointer">
              <XIcon className="size-4" />
            </Dialog.Close>
          </div>

          {selectedFile ? (
            <div className="mt-5 space-y-4">
              <div>
                <label htmlFor="upload-name" className="block text-sm font-medium text-zinc-700">
                  Name
                </label>
                <input
                  id="upload-name"
                  type="text"
                  value={uploadName}
                  onChange={(e) => setUploadName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 outline-none transition focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200"
                  placeholder="Enter file name"
                />
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-zinc-500">
                <span>
                  <span className="font-medium text-zinc-700">Type:</span>{" "}
                  {selectedFile.type || "audio/*"}
                </span>
                <span>
                  <span className="font-medium text-zinc-700">Size:</span>{" "}
                  {formatBytes(selectedFile.size)}
                </span>
              </div>
            </div>
          ) : null}

          <div className="mt-6 flex justify-end gap-3">
            <Button
              onClick={onCancel}
              disabled={isUploading}
              className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50 cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              onClick={onConfirm}
              disabled={isUploading}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-50 cursor-pointer"
            >
              {isUploading ? "Uploading..." : "Upload"}
            </Button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
