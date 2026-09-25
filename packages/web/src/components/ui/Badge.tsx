import type { ComponentProps } from "react";
import * as stylex from "@stylexjs/stylex";

import { cn } from "@/lib/cn";
import { tokens } from "../../styles/stylex.stylex";

export type BadgeVariant = "neutral" | "olive" | "warning";

export interface BadgeProps extends ComponentProps<"span"> {
  variant?: BadgeVariant;
}

const styles = stylex.create({
  base: {
    alignItems: "center",
    borderRadius: 9999,
    display: "inline-flex",
    flexShrink: 0,
    fontSize: 11,
    fontVariantNumeric: "tabular-nums",
    fontWeight: 500,
    lineHeight: "16px",
    paddingBlock: 2,
    paddingInline: 8,
    whiteSpace: "nowrap",
  },
  neutral: { backgroundColor: tokens.surfaceMuted, color: tokens.textMuted },
  olive: { backgroundColor: tokens.selected, color: tokens.oliveText },
  warning: { backgroundColor: tokens.warningSurface, color: tokens.warningText },
});

export function Badge({ variant = "neutral", className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(stylex.props(styles.base, styles[variant]).className, className)}
      {...props}
    />
  );
}
