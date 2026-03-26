import { Tooltip } from "@base-ui/react/tooltip";
import { formatBytes } from "@/lib/format";
import type { DesktopFileItem, DesktopFolderItem } from "@/types/desktop";

type TippableItem = DesktopFileItem | DesktopFolderItem;

interface DesktopFileTipProps {
  item: TippableItem;
  children: React.ReactElement;
}

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(timestamp));
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  if (mins >= 60) {
    const hrs = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    return `${hrs}h ${remainingMins}m`;
  }
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function DesktopFileTip({ item, children }: DesktopFileTipProps) {
  const isFile = item.type === "file";

  return (
    <Tooltip.Root>
      <Tooltip.Trigger render={children} delay={500} closeDelay={0} />
      <Tooltip.Portal>
        <Tooltip.Positioner sideOffset={8} side="top" align="center" className="z-20">
          <Tooltip.Popup className="max-w-[240px] rounded-lg border border-zinc-200 bg-white/95 px-3 py-2 text-xs shadow-lg backdrop-blur-sm">
            <p className="font-medium text-zinc-800 truncate">{item.name}</p>
            {isFile && (
              <div className="mt-1.5 space-y-0.5 text-zinc-500">
                <p>
                  <span className="text-zinc-600">Type:</span> {item.fileMeta.type}
                </p>
                <p>
                  <span className="text-zinc-600">Size:</span>{" "}
                  {formatBytes(item.fileMeta.sizeBytes)}
                </p>
                {item.fileMeta.durationSec && (
                  <p>
                    <span className="text-zinc-600">Duration:</span>{" "}
                    {formatDuration(item.fileMeta.durationSec)}
                  </p>
                )}
                <p>
                  <span className="text-zinc-600">Modified:</span>{" "}
                  {formatDate(item.fileMeta.updatedAt)}
                </p>
              </div>
            )}
            {!isFile && <p className="mt-1 text-zinc-500">Folder</p>}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
