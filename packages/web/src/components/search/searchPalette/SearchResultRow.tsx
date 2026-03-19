import { motion } from "motion/react";

import { cn } from "@/lib/cn";
import type { GlobalSearchItem } from "@/types/search";

import { CATEGORY_LABELS, SEARCH_ITEM_ICONS } from "./constants";

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
  const Icon = SEARCH_ITEM_ICONS[item.kind];

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
      className={cn(
        "group relative flex w-full items-start gap-3 rounded-[14px] px-4 py-3 text-left outline-none transition-colors duration-150",
        isActive ? "bg-transparent" : "bg-transparent hover:bg-[#f5f4f2]",
      )}
    >
      {isActive ? (
        <motion.div
          layoutId="search-active-result"
          className="absolute inset-0 rounded-[14px] border border-[#e7e1d8] bg-[#f1f0ee]"
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

      <div
        className={cn(
          "relative z-10 mt-0.5 flex size-8 shrink-0 items-center justify-center transition-colors",
          isActive ? "text-zinc-700" : "text-zinc-400 group-hover:text-zinc-600",
        )}
      >
        <Icon className="size-5" weight="regular" />
      </div>

      <div className="relative z-10 min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <p className="truncate text-[15px] font-semibold text-zinc-800">
            {item.title}
          </p>
          <span className="shrink-0 text-sm text-zinc-300">-</span>
          <p className="truncate text-sm text-zinc-400">
            {item.description || CATEGORY_LABELS[item.kind]}
          </p>
        </div>
        <p
          className={cn(
            "mt-1 text-xs leading-5 text-pretty line-clamp-1 sm:line-clamp-2",
            isActive ? "text-zinc-500" : "text-zinc-400",
          )}
        >
          {item.preview}
        </p>
      </div>
    </motion.button>
  );
}
