import { CaretRightIcon } from "@phosphor-icons/react";
import * as stylex from "@stylexjs/stylex";
import type { ReactElement } from "react";
import { Link } from "react-router";

import type { RecentItem } from "./recentItems";

const styles = stylex.create({
  recentWidget: {
    backgroundColor: "white",
    border: "1px solid #ebe4d8",
    borderRadius: 23,
    overflow: "hidden",
  },
  recentWidgetHeader: { paddingBlock: 16, paddingInline: 20 },
  recentWidgetTitle: { color: "#1d1c1a", fontSize: 17, fontWeight: 700 },
  recentRow: {
    alignItems: "center",
    borderTop: "1px solid #ece5d9",
    display: "grid",
    gap: 12,
    gridTemplateColumns: "2.625rem minmax(0, 1fr) auto",
    paddingBlock: 14,
    paddingInline: 20,
    textDecoration: "none",
    transition: "background-color 150ms",
    ":hover": { backgroundColor: "#fcfaf5" },
    ":first-child": { borderTopWidth: 0 },
  },
  recentIconShell: {
    alignItems: "center",
    borderRadius: 14,
    display: "flex",
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  recordingShell: { backgroundColor: "#f5f0e8" },
  fileShell: { backgroundColor: "#f4f1ea" },
  chatShell: { backgroundColor: "#f2efe6" },
  recentIcon: { height: 20, width: 20 },
  recordingIcon: { color: "#8a7e6c" },
  fileIcon: { color: "#6b655d" },
  chatIcon: { color: "#65704e" },
  recentCopy: { minWidth: 0 },
  recentTitle: {
    color: "#1d1c1a",
    fontSize: 15,
    fontWeight: 600,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  recentSubtitle: {
    color: "#716c64",
    fontSize: 12,
    marginTop: 4,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  recentArrow: { color: "#9a948a", height: 16, transition: "transform 150ms", width: 16 },
});

const getRecentShellStyle = (tone: RecentItem["tone"]) => {
  if (tone === "recording") {
    return styles.recordingShell;
  }

  if (tone === "file") {
    return styles.fileShell;
  }

  return styles.chatShell;
};

const getRecentIconStyle = (tone: RecentItem["tone"]) => {
  if (tone === "recording") {
    return styles.recordingIcon;
  }

  if (tone === "file") {
    return styles.fileIcon;
  }

  return styles.chatIcon;
};

function RecentRow({ item }: { item: RecentItem }): ReactElement {
  const Icon = item.icon;

  return (
    <Link to={item.href} {...stylex.props(styles.recentRow)}>
      <div {...stylex.props(styles.recentIconShell, getRecentShellStyle(item.tone))}>
        <Icon
          className={stylex.props(styles.recentIcon, getRecentIconStyle(item.tone)).className}
          weight={item.iconWeight ?? "regular"}
        />
      </div>
      <div {...stylex.props(styles.recentCopy)}>
        <p {...stylex.props(styles.recentTitle)}>{item.title}</p>
        <p {...stylex.props(styles.recentSubtitle)}>{item.subtitle}</p>
      </div>
      <CaretRightIcon className={stylex.props(styles.recentArrow).className} />
    </Link>
  );
}

export function RecentWidget({ items }: { items: RecentItem[] }): ReactElement {
  return (
    <div {...stylex.props(styles.recentWidget)}>
      <div {...stylex.props(styles.recentWidgetHeader)}>
        <h2 {...stylex.props(styles.recentWidgetTitle)}>Recent</h2>
      </div>
      <div>
        {items.map((item) => (
          <RecentRow key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}
