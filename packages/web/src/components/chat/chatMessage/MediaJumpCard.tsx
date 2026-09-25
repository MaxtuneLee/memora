import { MicrophoneIcon, VideoCameraIcon } from "@phosphor-icons/react";
import { Link } from "react-router";
import * as stylex from "@stylexjs/stylex";

import { formatDuration } from "@/lib/format";
import type { MediaJumpCardData } from "@/lib/chat/memoraJump";
import { tokens } from "../../../styles/stylex.stylex";

const styles = stylex.create({
  card: {
    backgroundColor: tokens.surfaceMuted,
    border: `1px solid ${tokens.border}`,
    borderRadius: 12,
    display: "block",
    paddingBlock: 8,
    paddingInline: 12,
    transition: "background-color 150ms, border-color 150ms",
    ":hover": { backgroundColor: tokens.card, borderColor: tokens.borderStrong },
  },
  row: { alignItems: "flex-start", display: "flex", gap: 10 },
  iconWrap: {
    alignItems: "center",
    backgroundColor: tokens.primaryBackground,
    borderRadius: 8,
    color: tokens.primaryText,
    display: "flex",
    flexShrink: 0,
    height: 28,
    justifyContent: "center",
    marginTop: 2,
    width: 28,
  },
  icon: { height: 14, width: 14 },
  body: { flex: 1, minWidth: 0 },
  header: { alignItems: "center", display: "flex", gap: 8, justifyContent: "space-between" },
  fileName: {
    color: tokens.textStrong,
    fontSize: 14,
    fontWeight: 500,
    margin: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  duration: { color: tokens.textMuted, flexShrink: 0, fontSize: 11, fontWeight: 500 },
  context: {
    color: tokens.textMuted,
    fontSize: 12,
    marginBlock: 4,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
});

export function MediaJumpCard({ jumpCard }: { jumpCard: MediaJumpCardData }) {
  const JumpIcon = jumpCard.mediaType === "video" ? VideoCameraIcon : MicrophoneIcon;

  return (
    <Link
      to={`/transcript/file/${jumpCard.fileId}?seek=${encodeURIComponent(
        String(jumpCard.startSec),
      )}`}
      {...stylex.props(styles.card)}
    >
      <div {...stylex.props(styles.row)}>
        <div {...stylex.props(styles.iconWrap)}>
          <JumpIcon className={stylex.props(styles.icon).className} weight="bold" />
        </div>
        <div {...stylex.props(styles.body)}>
          <div {...stylex.props(styles.header)}>
            <p {...stylex.props(styles.fileName)}>{jumpCard.fileName}</p>
            <span {...stylex.props(styles.duration)}>
              {formatDuration(jumpCard.startSec)} - {formatDuration(jumpCard.endSec)}
            </span>
          </div>
          {jumpCard.context && <p {...stylex.props(styles.context)}>{jumpCard.context}</p>}
        </div>
      </div>
    </Link>
  );
}
