import { useCallback, useState, type CSSProperties, type PointerEvent } from "react";
import * as stylex from "@stylexjs/stylex";

const styles = stylex.create({
  aside: {
    alignSelf: "flex-start",
    display: "none",
    flexShrink: 0,
    position: "sticky",
    top: 24,
    width: 176,
    "@media (min-width: 1024px)": { display: "block" },
  },
  list: {
    display: "flex",
    flexDirection: "column",
    marginLeft: "auto",
    position: "relative",
    width: "100%",
  },
  item: { pointerEvents: "none", position: "relative", width: "100%" },
  marker: {
    height: 2,
    position: "absolute",
    right: 0,
    top: "50%",
    width: "var(--outline-marker-width)",
  },
  frame: {
    backgroundColor: "var(--color-memora-surface-muted)",
    borderRadius: 2,
    height: 28,
    position: "absolute",
    right: 0,
    top: "50%",
    width: 144,
  },
  title: {
    color: "var(--color-memora-text)",
    display: "block",
    fontSize: "0.75rem",
    fontWeight: 500,
    lineHeight: "28px",
    overflow: "hidden",
    position: "absolute",
    right: 8,
    textAlign: "right",
    textOverflow: "ellipsis",
    top: "50%",
    whiteSpace: "nowrap",
    width: 128,
    zIndex: 10,
  },
  interaction: {
    borderRadius: 2,
    cursor: "pointer",
    inset: 0,
    outline: "none",
    position: "absolute",
    ":focus-visible": { boxShadow: "0 0 0 2px var(--color-memora-olive-soft)" },
  },
  srOnly: {
    borderWidth: 0,
    clip: "rect(0, 0, 0, 0)",
    height: 1,
    margin: -1,
    overflow: "hidden",
    padding: 0,
    position: "absolute",
    whiteSpace: "nowrap",
    width: 1,
  },
});

export interface MarkdownHeading {
  id: string;
  index: number;
  level: number;
  line: number;
  position: number;
  title: string;
}

const ATX_HEADING_PATTERN = /^(?: {0,3})(#{1,6})[ \t]+(.+?)[ \t]*$/;
const SETEXT_HEADING_PATTERN = /^(?: {0,3})(=+|-+)[ \t]*$/;
const FENCE_PATTERN = /^(?: {0,3})(`{3,}|~{3,})/;

const getHeadingTitle = (value: string): string => {
  return value.replace(/[ \t]+#+[ \t]*$/, "").trim();
};

export const parseMarkdownHeadings = (text: string): readonly MarkdownHeading[] => {
  const lines = text.split("\n");
  const headings: Omit<MarkdownHeading, "index" | "id" | "position">[] = [];
  let openFence: "`" | "~" | null = null;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex] ?? "";
    const fenceMatch = line.match(FENCE_PATTERN);
    if (fenceMatch) {
      const fenceCharacter = fenceMatch[1]?.[0] as "`" | "~" | undefined;
      if (fenceCharacter) {
        openFence = openFence === fenceCharacter ? null : (openFence ?? fenceCharacter);
      }
      continue;
    }

    if (openFence) {
      continue;
    }

    const atxMatch = line.match(ATX_HEADING_PATTERN);
    if (atxMatch) {
      const title = getHeadingTitle(atxMatch[2] ?? "");
      if (title) {
        headings.push({
          level: atxMatch[1]?.length ?? 1,
          line: lineIndex + 1,
          title,
        });
      }
      continue;
    }

    const setextMatch = lines[lineIndex + 1]?.match(SETEXT_HEADING_PATTERN);
    const title = line.trim();
    if (setextMatch && title) {
      headings.push({
        level: setextMatch[1]?.startsWith("=") ? 1 : 2,
        line: lineIndex + 1,
        title,
      });
      lineIndex += 1;
    }
  }

  const lastLine = Math.max(lines.length - 1, 1);
  return headings.map((heading, index) => ({
    ...heading,
    id: `heading-${heading.line}-${index}`,
    index,
    position: ((heading.line - 1) / lastLine) * 100,
  }));
};

interface DocumentOutlineIndicatorProps {
  activeHeadingId: string | null;
  headings: readonly MarkdownHeading[];
  onNavigate: (heading: MarkdownHeading) => void;
}

const MARKER_WIDTHS = ["24px", "15px", "12px", "10px", "8px", "8px"] as const;

const getMarkerWidth = (level: number): string => {
  return MARKER_WIDTHS[Math.min(Math.max(level, 1), MARKER_WIDTHS.length) - 1] ?? "8px";
};

const OUTLINE_COLLAPSED_ITEM_HEIGHT_PX = 2;
const OUTLINE_ITEM_MARGIN_BOTTOM_PX = 10;

export function DocumentOutlineIndicator({
  activeHeadingId,
  headings,
  onNavigate,
}: DocumentOutlineIndicatorProps) {
  const [hoveredHeadingId, setHoveredHeadingId] = useState<string | null>(null);

  const getNearestHeading = useCallback(
    (clientY: number, target: HTMLElement): MarkdownHeading | null => {
      const rect = target.getBoundingClientRect();
      if (rect.height <= 0) {
        return null;
      }

      const pointerY = Number.isFinite(clientY) ? clientY : rect.top + rect.height / 2;
      const outlineItems = Array.from(
        target.parentElement?.querySelectorAll<HTMLElement>("[data-outline-heading-id]") ?? [],
      );
      if (outlineItems.some((item) => item.getBoundingClientRect().height > 0)) {
        const nearestItem = outlineItems.reduce((nearest, item) => {
          const itemRect = item.getBoundingClientRect();
          const nearestRect = nearest.getBoundingClientRect();
          const itemDistance = Math.abs(itemRect.top + itemRect.height / 2 - pointerY);
          const nearestDistance = Math.abs(nearestRect.top + nearestRect.height / 2 - pointerY);
          return itemDistance < nearestDistance ? item : nearest;
        });
        const headingId = nearestItem.dataset.outlineHeadingId;
        return headings.find((heading) => heading.id === headingId) ?? null;
      }

      const relativeY = Math.min(Math.max(pointerY - rect.top, 0), rect.height);
      const itemStride = OUTLINE_COLLAPSED_ITEM_HEIGHT_PX + OUTLINE_ITEM_MARGIN_BOTTOM_PX;
      const headingIndex = Math.min(
        Math.max(Math.floor((relativeY + OUTLINE_ITEM_MARGIN_BOTTOM_PX / 2) / itemStride), 0),
        headings.length - 1,
      );
      return headings[headingIndex] ?? null;
    },
    [headings],
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLButtonElement>): void => {
      const heading = getNearestHeading(event.clientY, event.currentTarget);
      setHoveredHeadingId(heading?.id ?? null);
    },
    [getNearestHeading],
  );

  const handleClick = useCallback(
    (event: PointerEvent<HTMLButtonElement>): void => {
      const heading = getNearestHeading(event.clientY, event.currentTarget);
      if (heading) {
        onNavigate(heading);
      }
    },
    [getNearestHeading, onNavigate],
  );

  if (headings.length === 0) {
    return null;
  }

  const hoveredHeading = headings.find((heading) => heading.id === hoveredHeadingId) ?? null;
  return (
    <aside {...stylex.props(styles.aside)} aria-label="Document outline">
      <div {...stylex.props(styles.list)} data-surface="document-outline-indicator">
        {headings.map((heading, index) => {
          const isActive = heading.id === activeHeadingId;
          const isHovered = heading.id === hoveredHeadingId;
          return (
            <div
              key={heading.id}
              data-hovered={isHovered}
              data-active={isActive}
              data-outline-heading-id={heading.id}
              aria-hidden="true"
              className={`outline-item ${stylex.props(styles.item).className}`}
              style={
                {
                  marginBottom:
                    index === headings.length - 1 ? "0px" : `${OUTLINE_ITEM_MARGIN_BOTTOM_PX}px`,
                  "--outline-marker-width": getMarkerWidth(heading.level),
                  "--outline-marker-color": isActive
                    ? "var(--color-memora-text-strong)"
                    : "var(--color-memora-border-soft)",
                } as CSSProperties
              }
            >
              <span className={`outline-marker ${stylex.props(styles.marker).className}`} />
              <span className={`outline-frame ${stylex.props(styles.frame).className}`} />
              <span className={`outline-title ${stylex.props(styles.title).className}`}>
                {heading.title}
              </span>
            </div>
          );
        })}
        <button
          type="button"
          aria-label={hoveredHeading ? `Go to ${hoveredHeading.title}` : "Browse document outline"}
          {...stylex.props(styles.interaction)}
          onPointerMove={handlePointerMove}
          onPointerLeave={() => setHoveredHeadingId(null)}
          onClick={handleClick}
        />
      </div>
      <nav {...stylex.props(styles.srOnly)} aria-label="All document headings">
        <ol>
          {headings.map((heading) => (
            <li key={heading.id}>
              <button type="button" onClick={() => onNavigate(heading)}>
                {heading.title}
              </button>
            </li>
          ))}
        </ol>
      </nav>
    </aside>
  );
}
