import { FunnelSimpleIcon } from "@phosphor-icons/react";
import { Button } from "@base-ui/react/button";
import { RecordingsGrid } from "../../components/files/RecordingsGrid";
import { useRecordings } from "../../hooks/useRecordings";

export const Component = () => {
  const { recordings, deleteRecording } = useRecordings();

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-end justify-between gap-6 pb-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 text-balance">
            Files
          </h1>
          <p className="mt-2 text-zinc-500 text-pretty">
            Saved recordings and transcripts.
          </p>
        </div>
        <Button className="flex items-center gap-2 text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-900">
          <FunnelSimpleIcon className="size-4" />
          Sort by recent
        </Button>
      </div>

      <RecordingsGrid recordings={recordings} onDelete={deleteRecording} />
    </div>
  );
};
