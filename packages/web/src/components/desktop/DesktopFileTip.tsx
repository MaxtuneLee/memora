import { Tooltip } from "@base-ui/react/tooltip";
import * as stylex from "@stylexjs/stylex";

import { formatBytes } from "@/lib/format";
import type { DesktopFileItem, DesktopFolderItem } from "@/types/desktop";
import { tokens } from "../../styles/stylex.stylex";

const styles = stylex.create({
  positioner: { zIndex: 20 },
  popup: {
    backdropFilter: "blur(4px)",
    backgroundColor: tokens.surface,
    borderColor: tokens.border,
    borderRadius: 8,
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: tokens.shadowMedium,
    fontSize: "0.75rem",
    maxWidth: 240,
    paddingBlock: 8,
    paddingInline: 12,
  },
  title: {
    color: tokens.textStrong,
    fontWeight: 500,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  details: {
    color: tokens.textMuted,
    display: "flex",
    flexDirection: "column",
    gap: 2,
    marginTop: 6,
  },
  detailLabel: { color: tokens.textMuted },
  folder: { color: tokens.textMuted, marginTop: 4 },
});

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
        <Tooltip.Positioner
          sideOffset={8}
          side="top"
          align="center"
          {...stylex.props(styles.positioner)}
        >
          <Tooltip.Popup {...stylex.props(styles.popup)}>
            <p {...stylex.props(styles.title)}>{item.name}</p>
            {isFile && (
              <div {...stylex.props(styles.details)}>
                <p>
                  <span {...stylex.props(styles.detailLabel)}>Type:</span> {item.fileMeta.type}
                </p>
                <p>
                  <span {...stylex.props(styles.detailLabel)}>Size:</span>{" "}
                  {formatBytes(item.fileMeta.sizeBytes)}
                </p>
                {item.fileMeta.durationSec && (
                  <p>
                    <span {...stylex.props(styles.detailLabel)}>Duration:</span>{" "}
                    {formatDuration(item.fileMeta.durationSec)}
                  </p>
                )}
                <p>
                  <span {...stylex.props(styles.detailLabel)}>Modified:</span>{" "}
                  {formatDate(item.fileMeta.updatedAt)}
                </p>
              </div>
            )}
            {!isFile && <p {...stylex.props(styles.folder)}>Folder</p>}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
