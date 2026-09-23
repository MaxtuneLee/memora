import { CaretRightIcon } from "@phosphor-icons/react";
import * as stylex from "@stylexjs/stylex";
import type { ReactElement } from "react";
import { Link } from "react-router";

import { tokens } from "../../styles/stylex.stylex";

import type { RecentItem } from "./recentItems";

const styles = stylex.create({
  recentWidget: {
    backgroundColor: tokens.card,
    border: `1px solid ${tokens.border}`,
    borderRadius: "inherit",
    // Fills the Home Grid tile and scrolls itself, so the scrollbar stays inside this border
    // instead of on the tile wrapper outside it.
    height: "100%",
    overflowY: "auto",
  },
  recentWidgetHeader: { paddingBlock: 16, paddingInline: 20 },
  recentWidgetTitle: { color: tokens.text, fontSize: 17, fontWeight: 700 },
  recentRow: {
    alignItems: "center",
    borderTop: `1px solid ${tokens.border}`,
    display: "grid",
    gap: 12,
    gridTemplateColumns: "2.625rem minmax(0, 1fr) auto",
    paddingBlock: 14,
    paddingInline: 20,
    textDecoration: "none",
    transition: "background-color 150ms",
    ":hover": { backgroundColor: tokens.surfaceSoft },
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
  recordingShell: { backgroundColor: tokens.surfaceMuted },
  fileShell: { backgroundColor: tokens.surfaceMuted },
  chatShell: { backgroundColor: tokens.surfaceMuted },
  recentIcon: { height: 20, width: 20 },
  recordingIcon: { color: tokens.textSoft },
  fileIcon: { color: tokens.textMuted },
  chatIcon: { color: tokens.oliveText },
  recentCopy: { minWidth: 0 },
  recentTitle: {
    color: tokens.text,
    fontSize: 15,
    fontWeight: 600,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  recentSubtitle: {
    color: tokens.textMuted,
    fontSize: 12,
    marginTop: 4,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  recentArrow: { color: tokens.textSoft, height: 16, transition: "transform 150ms", width: 16 },
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
