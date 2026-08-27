import type { ComponentProps } from "react";

import { cn } from "@/lib/cn";

export type BadgeVariant = "neutral" | "olive" | "warning";

export interface BadgeProps extends ComponentProps<"span"> {
  variant?: BadgeVariant;
}

const BADGE_VARIANTS: Record<BadgeVariant, string> = {
  neutral: "bg-[var(--color-memora-surface-soft)] text-[var(--color-memora-text-soft)]",
  olive:
    "bg-[color-mix(in_srgb,var(--color-memora-olive-soft)_18%,transparent)] text-[var(--color-memora-olive)]",
  warning: "bg-[var(--color-memora-warning-surface)] text-[var(--color-memora-warning-text)]",
};

export function Badge({ variant = "neutral", className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium",
        BADGE_VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}
