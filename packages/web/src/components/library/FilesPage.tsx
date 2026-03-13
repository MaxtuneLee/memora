import { FunnelSimpleIcon } from "@phosphor-icons/react";
import { Button } from "@base-ui/react/button";

import { FileGrid } from "@/components/library/FileGrid";
import { useFiles } from "@/hooks/library/useFiles";
import type { FileItem } from "@/types/library";

const getFileHref = (file: FileItem): string | null => {
  if (file.type === "audio" || file.type === "video") {
    return `/transcript/file/${file.id}`;
  }

  return null;
};

export const Component = () => {
  const { files, deleteFile } = useFiles();

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6 md:p-8">
      <div className="flex items-end justify-between gap-6 pb-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 text-balance">
            Files
          </h1>
          <p className="mt-2 text-zinc-500 text-pretty">
            Manage all files stored in your workspace.
          </p>
        </div>
        <Button className="flex items-center gap-2 text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-900">
          <FunnelSimpleIcon className="size-4" />
          Sort by recent
        </Button>
      </div>

      <FileGrid
        files={files}
        onDelete={deleteFile}
        emptyMessage="No files yet. Upload or record something to see it here."
        getHref={getFileHref}
      />
    </div>
  );
};
