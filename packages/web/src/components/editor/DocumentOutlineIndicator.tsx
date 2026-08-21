import { useCallback, useState, type CSSProperties, type PointerEvent } from "react";

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
    <aside
      className="sticky top-6 hidden w-44 shrink-0 self-start lg:block"
      aria-label="Document outline"
    >
      <div
        className="relative ml-auto flex w-full flex-col"
        data-surface="document-outline-indicator"
      >
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
              className="outline-item pointer-events-none relative w-full"
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
              <span className="outline-marker absolute top-1/2 right-0 h-[2px] w-[var(--outline-marker-width)]" />
              <span className="outline-frame absolute top-1/2 right-0 h-7 w-36 rounded-sm bg-[var(--color-memora-surface-muted)]" />
              <span className="outline-title absolute top-1/2 right-2 z-10 block w-32 truncate text-right text-xs leading-7 font-medium text-[var(--color-memora-text)]">
                {heading.title}
              </span>
            </div>
          );
        })}
        <button
          type="button"
          aria-label={hoveredHeading ? `Go to ${hoveredHeading.title}` : "Browse document outline"}
          className="absolute inset-0 cursor-pointer rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-memora-olive-soft)]"
          onPointerMove={handlePointerMove}
          onPointerLeave={() => setHoveredHeadingId(null)}
          onClick={handleClick}
        />
      </div>
      <nav className="sr-only" aria-label="All document headings">
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
