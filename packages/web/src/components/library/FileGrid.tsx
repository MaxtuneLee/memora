import type { FileItem, RecordingItem } from "@/types/library";
import { FileCard } from "@/components/library/FileCard";

interface FileGridProps {
  files: FileItem[];
  onDelete: (file: FileItem) => void;
  emptyMessage?: string;
  getHref?: (file: FileItem) => string | null;
}

const defaultHref = (file: FileItem): string | null => {
  if (file.type === "audio" || file.type === "video") {
    return `/transcript/file/${file.id}`;
  }

  return null;
};

export const FileGrid = ({
  files,
  onDelete,
  emptyMessage = "No files yet.",
  getHref = defaultHref,
}: FileGridProps) => {
  if (files.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {files.map((file) => (
        <FileCard key={file.id} file={file} href={getHref(file)} onDelete={onDelete} />
      ))}
    </div>
  );
};

interface RecordingsGridProps {
  recordings: RecordingItem[];
  onDelete: (recording: RecordingItem) => void;
}

export const RecordingsGrid = ({ recordings, onDelete }: RecordingsGridProps) => {
  return (
    <FileGrid
      files={recordings}
      onDelete={onDelete}
      emptyMessage="No recordings yet. Record a transcript to see it here."
      getHref={(recording) => `/transcript/file/${recording.id}`}
    />
  );
};
