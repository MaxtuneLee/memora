import { motion } from "motion/react";
import * as stylex from "@stylexjs/stylex";

import { getFileIcon } from "@/lib/library/fileIcon";
import type { GlobalSearchItem } from "@/types/search";

import { CATEGORY_LABELS, SEARCH_ITEM_ICONS } from "./constants";

const styles = stylex.create({
  row: {
    alignItems: "flex-start",
    backgroundColor: "transparent",
    borderRadius: 14,
    display: "flex",
    gap: 12,
    outline: "none",
    paddingBlock: 12,
    paddingInline: 16,
    position: "relative",
    textAlign: "left",
    transition: "background-color 150ms",
    width: "100%",
  },
  inactive: { ":hover": { backgroundColor: "#f5f4f2" } },
  activeSurface: {
    backgroundColor: "#f1f0ee",
    border: "1px solid #e7e1d8",
    borderRadius: 14,
    inset: 0,
    position: "absolute",
  },
  iconWrap: {
    alignItems: "center",
    color: "#a1a1aa",
    display: "flex",
    flexShrink: 0,
    height: 32,
    justifyContent: "center",
    marginTop: 2,
    position: "relative",
    transition: "color 150ms",
    width: 32,
    zIndex: 10,
  },
  activeIcon: { color: "#3f3f46" },
  icon: { height: 20, width: 20 },
  body: { flex: 1, minWidth: 0, position: "relative", zIndex: 10 },
  heading: {
    alignItems: "baseline",
    columnGap: 8,
    display: "flex",
    flexWrap: "wrap",
    minWidth: 0,
    rowGap: 2,
  },
  title: {
    color: "#27272a",
    fontSize: 15,
    fontWeight: 600,
    margin: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  separator: { color: "#d4d4d8", flexShrink: 0, fontSize: 14 },
  description: {
    color: "#a1a1aa",
    fontSize: 14,
    margin: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  preview: {
    color: "#a1a1aa",
    display: "-webkit-box",
    fontSize: 12,
    lineClamp: 1,
    lineHeight: "20px",
    marginTop: 4,
    overflow: "hidden",
    WebkitBoxOrient: "vertical",
    "@media (min-width: 640px)": { lineClamp: 2 },
  },
  activePreview: { color: "#71717a" },
});

export function SearchResultRow({
  item,
  index,
  isActive,
  reducedMotion,
  onHover,
  onSelect,
}: {
  item: GlobalSearchItem;
  index: number;
  isActive: boolean;
  reducedMotion: boolean;
  onHover: () => void;
  onSelect: () => void;
}) {
  const Icon = item.fileIcon ? getFileIcon(item.fileIcon) : SEARCH_ITEM_ICONS[item.kind];

  return (
    <motion.button
      id={`search-result-${item.id}`}
      type="button"
      role="option"
      aria-selected={isActive}
      initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.985 }}
      animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
      transition={{
        duration: reducedMotion ? 0.14 : 0.18,
        delay: reducedMotion ? 0 : Math.min(index, 5) * 0.02,
        ease: [0.22, 1, 0.36, 1],
      }}
      onMouseEnter={onHover}
      onClick={onSelect}
      {...stylex.props(styles.row, !isActive && styles.inactive)}
    >
      {isActive ? (
        <motion.div
          layoutId="search-active-result"
          {...stylex.props(styles.activeSurface)}
          transition={
            reducedMotion
              ? { duration: 0.12 }
              : {
                  type: "spring",
                  stiffness: 430,
                  damping: 36,
                  mass: 0.72,
                }
          }
        />
      ) : null}

      <div {...stylex.props(styles.iconWrap, isActive && styles.activeIcon)}>
        <Icon className={stylex.props(styles.icon).className} weight="regular" />
      </div>

      <div {...stylex.props(styles.body)}>
        <div {...stylex.props(styles.heading)}>
          <p {...stylex.props(styles.title)}>{item.title}</p>
          <span {...stylex.props(styles.separator)}>-</span>
          <p {...stylex.props(styles.description)}>
            {item.description || CATEGORY_LABELS[item.kind]}
          </p>
        </div>
        <p {...stylex.props(styles.preview, isActive && styles.activePreview)}>{item.preview}</p>
      </div>
    </motion.button>
  );
}
