import { MicrophoneIcon, VideoCameraIcon } from "@phosphor-icons/react";
import { Popover } from "@base-ui/react/popover";
import { Link } from "react-router";
import * as stylex from "@stylexjs/stylex";

import { formatDuration } from "@/lib/format";
import { getMediaJumpHref, type MediaJumpCardData } from "@/lib/chat/memoraJump";
import { tokens } from "../../../styles/stylex.stylex";

const styles = stylex.create({
  trigger: {
    backgroundColor: { default: tokens.selected, ":hover": tokens.hover },
    border: "none",
    borderRadius: 4,
    color: tokens.oliveText,
    cursor: "pointer",
    fontSize: 11,
    fontWeight: 600,
    lineHeight: "14px",
    marginInline: 2,
    paddingInline: 4,
    position: "relative",
    top: -6,
    transition: "background-color 150ms",
  },
  popup: {
    backgroundColor: tokens.surface,
    border: `1px solid ${tokens.border}`,
    borderRadius: 12,
    boxShadow: tokens.shadowLarge,
    display: "flex",
    flexDirection: "column",
    gap: 2,
    outline: "none",
    padding: 4,
    width: "min(22rem, calc(100vw - 2rem))",
  },
  item: {
    alignItems: "flex-start",
    backgroundColor: { default: "transparent", ":hover": tokens.hover },
    borderRadius: 8,
    display: "flex",
    gap: 10,
    paddingBlock: 8,
    paddingInline: 10,
    textDecoration: "none",
    transition: "background-color 150ms",
  },
  icon: { color: tokens.textMuted, flexShrink: 0, height: 16, marginTop: 2, width: 16 },
  body: { flex: 1, minWidth: 0 },
  header: { alignItems: "baseline", display: "flex", gap: 8, justifyContent: "space-between" },
  fileName: {
    color: tokens.textStrong,
    fontSize: 13,
    fontWeight: 500,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  time: {
    color: tokens.textMuted,
    flexShrink: 0,
    fontSize: 11,
    fontVariantNumeric: "tabular-nums",
  },
  context: {
    color: tokens.textMuted,
    display: "-webkit-box",
    fontSize: 12,
    marginTop: 2,
    overflow: "hidden",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 2,
  },
});

export function CitationMarker({
  index,
  moments,
}: {
  index: number;
  moments: MediaJumpCardData[];
}) {
  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label={`Citation ${index}, ${moments.length} ${moments.length === 1 ? "moment" : "moments"}`}
        {...stylex.props(styles.trigger)}
      >
        {index}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner align="start" collisionPadding={12} side="bottom" sideOffset={6}>
          <Popover.Popup {...stylex.props(styles.popup)}>
            {moments.map((moment, momentIndex) => {
              const MomentIcon = moment.mediaType === "video" ? VideoCameraIcon : MicrophoneIcon;
              return (
                <Link
                  key={`${moment.fileId}-${moment.startSec}-${momentIndex}`}
                  to={getMediaJumpHref(moment)}
                  {...stylex.props(styles.item)}
                >
                  <MomentIcon className={stylex.props(styles.icon).className} />
                  <div {...stylex.props(styles.body)}>
                    <div {...stylex.props(styles.header)}>
                      <span {...stylex.props(styles.fileName)}>{moment.fileName}</span>
                      <span {...stylex.props(styles.time)}>
                        {formatDuration(moment.startSec)} - {formatDuration(moment.endSec)}
                      </span>
                    </div>
                    {moment.context && <p {...stylex.props(styles.context)}>{moment.context}</p>}
                  </div>
                </Link>
              );
            })}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
