import { Menu } from "@base-ui/react/menu";
import {
  ArrowRightIcon,
  DotsThreeVerticalIcon,
  FileTextIcon,
  FolderSimpleIcon,
  ImageIcon,
  MicrophoneIcon,
  PencilSimpleIcon,
  StarIcon,
  TrashIcon,
  VideoCameraIcon,
} from "@phosphor-icons/react";
import { Link } from "react-router";
import type { FileType, RecordingMeta } from "@/types/library";
import { formatDateTime, formatDuration } from "@/lib/format";
import type { JSX } from "react";

interface FileCardProps {
  file: RecordingMeta;
  href?: string | null;
  onDelete: (file: RecordingMeta) => void;
  onRename?: (file: RecordingMeta) => void;
  onMove?: (file: RecordingMeta) => void;
  onFavorite?: (file: RecordingMeta) => void;
  preview?: string | null;
}

export const FileCard = ({
  file,
  href,
  onDelete,
  onRename,
  onMove,
  onFavorite,
  preview,
}: FileCardProps) => {
  const previewText = preview ?? file.transcriptPreview ?? null;
  const previewValue = previewText?.trim();
  const previewFallback =
    file.type === "audio" || file.type === "video" ? "No transcript yet." : "No preview available.";
  const previewContent = previewValue || previewFallback;
  const showDuration =
    (file.type === "audio" || file.type === "video") &&
    file.durationSec !== undefined &&
    file.durationSec !== null;
  const typeLabel: Record<FileType, string> = {
    audio: "Audio",
    video: "Video",
    image: "Image",
    document: "Document",
  };
  const typeIcon: Record<FileType, JSX.Element> = {
    audio: <MicrophoneIcon className="size-4" />,
    video: <VideoCameraIcon className="size-4" />,
    image: <ImageIcon className="size-4" />,
    document: <FileTextIcon className="size-4" />,
  };
  const itemClassName =
    "group flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-zinc-700 outline-none transition-colors data-[highlighted]:bg-zinc-100 data-[highlighted]:text-zinc-900";
  const deleteItemClassName =
    "group flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-zinc-700 outline-none transition-colors data-[highlighted]:bg-red-50 data-[highlighted]:text-red-600";
  const submenuTriggerClassName =
    "group flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm text-zinc-700 outline-none transition-colors data-[highlighted]:bg-zinc-100 data-[highlighted]:text-zinc-900 data-[popup-open]:bg-zinc-100";

  return (
    <div className="group relative flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm transition-all hover:border-zinc-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400">
      <div className="flex items-start justify-between">
        <div className="flex size-8 items-center justify-center rounded-sm bg-zinc-50 text-zinc-400 group-hover:text-zinc-600">
          {typeIcon[file.type]}
        </div>
        <Menu.Root>
          <Menu.Trigger
            aria-label="File actions"
            className="rounded text-zinc-300 hover:text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-600 cursor-pointer"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
          >
            <DotsThreeVerticalIcon className="size-5" weight="bold" />
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner className="z-50" sideOffset={8} align="start">
              <Menu.Popup className="min-w-50 rounded-xl border border-zinc-200 bg-white p-2 shadow-lg *:cursor-pointer">
                <Menu.Item className={itemClassName} onClick={() => onRename?.(file)}>
                  <PencilSimpleIcon className="size-4 text-zinc-400 group-data-[highlighted]:text-zinc-600" />
                  <span>重命名</span>
                </Menu.Item>

                <Menu.SubmenuRoot>
                  <Menu.SubmenuTrigger className={submenuTriggerClassName}>
                    <span className="flex items-center gap-2">
                      <FolderSimpleIcon className="size-4 text-zinc-400 group-data-[highlighted]:text-zinc-600" />
                      移动
                    </span>
                    <ArrowRightIcon className="size-3 text-zinc-400 group-data-[highlighted]:text-zinc-600" />
                  </Menu.SubmenuTrigger>
                  <Menu.Portal>
                    <Menu.Positioner className="z-50" sideOffset={6} alignOffset={-4}>
                      <Menu.Popup className="min-w-[180px] rounded-xl border border-zinc-200 bg-white p-2 shadow-lg">
                        <Menu.Item className={itemClassName} onClick={() => onMove?.(file)}>
                          <FolderSimpleIcon className="size-4 text-zinc-400 group-data-[highlighted]:text-zinc-600" />
                          <span>移动到…</span>
                        </Menu.Item>
                      </Menu.Popup>
                    </Menu.Positioner>
                  </Menu.Portal>
                </Menu.SubmenuRoot>

                <Menu.Item className={itemClassName} onClick={() => onFavorite?.(file)}>
                  <StarIcon className="size-4 text-zinc-400 group-data-[highlighted]:text-zinc-600" />
                  <span>收藏</span>
                </Menu.Item>
                <Menu.Separator className="my-1 h-px bg-zinc-100" />
                <Menu.Item className={deleteItemClassName} onClick={() => onDelete(file)}>
                  <TrashIcon className="size-4 text-zinc-400 group-data-[highlighted]:text-red-600" />
                  <span>删除</span>
                </Menu.Item>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      </div>

      <div>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-medium text-zinc-900 leading-tight">{file.name}</h3>
            <p className="mt-1 text-xs text-zinc-400">{formatDateTime(file.createdAt)}</p>
          </div>
          {showDuration ? (
            <span className="text-xs text-zinc-400 tabular-nums">
              {formatDuration(file.durationSec ?? 0)}
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-sm text-zinc-500 line-clamp-2 text-pretty">{previewContent}</p>
      </div>

      <div className="mt-auto flex items-center justify-between pt-2">
        <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
          {typeLabel[file.type]}
        </span>
        {href ? (
          <Link to={href}>
            <span className="flex items-center gap-1 text-xs text-zinc-400">
              View details
              <ArrowRightIcon className="size-3" />
            </span>
          </Link>
        ) : (
          <span className="text-xs text-zinc-300">No preview</span>
        )}
      </div>
    </div>
  );
};
