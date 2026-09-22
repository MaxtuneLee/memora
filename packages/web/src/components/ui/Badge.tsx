import type { ComponentProps } from "react";
import * as stylex from "@stylexjs/stylex";

import { cn } from "@/lib/cn";
import { tokens } from "../../styles/stylex.stylex";

export type BadgeVariant = "neutral" | "olive" | "warning";

export interface BadgeProps extends ComponentProps<"span"> {
  variant?: BadgeVariant;
}

const styles = stylex.create({
  neutral: { backgroundColor: tokens.surfaceMuted, color: tokens.textMuted },
  olive: { backgroundColor: tokens.selected, color: tokens.oliveText },
  warning: { backgroundColor: tokens.warningSurface, color: tokens.warningText },
});

export function Badge({ variant = "neutral", className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium",
        stylex.props(styles[variant]).className,
        className,
      )}
      {...props}
    />
  );
}
