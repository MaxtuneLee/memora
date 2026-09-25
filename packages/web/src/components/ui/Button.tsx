import { Button as BaseButton } from "@base-ui/react/button";
import type { ComponentProps } from "react";
import * as stylex from "@stylexjs/stylex";

import { cn } from "@/lib/cn";
import { tokens } from "../../styles/stylex.stylex";

type DistributiveOmit<Type, Key extends PropertyKey> = Type extends unknown
  ? Omit<Type, Key>
  : never;

type BaseButtonProps = DistributiveOmit<ComponentProps<typeof BaseButton>, "className">;

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "oliveGhost"
  | "destructive"
  | "icon"
  | "destructiveIcon"
  | "segment"
  | "plain";

export type ButtonProps = BaseButtonProps & {
  variant?: ButtonVariant;
  active?: boolean;
  className?: string;
};

const FOCUS_RING = `0 0 0 2px ${tokens.surface}, 0 0 0 4px ${tokens.focusRing}`;
const LIFT = "translateY(-0.125rem)";

const styles = stylex.create({
  base: {
    alignItems: "center",
    borderRadius: 9999,
    borderStyle: "solid",
    borderWidth: 1,
    display: "inline-flex",
    fontSize: "0.75rem",
    fontWeight: 600,
    gap: 8,
    justifyContent: "center",
    transition:
      "background-color 300ms var(--ease-out-quart), border-color 300ms var(--ease-out-quart), color 300ms var(--ease-out-quart), box-shadow 300ms var(--ease-out-quart), transform 300ms var(--ease-out-quart)",
    ":disabled": { cursor: "not-allowed", opacity: 0.5 },
    ":focus-visible": { boxShadow: FOCUS_RING, outline: "none" },
    "[aria-busy=true]": { cursor: "progress", opacity: 0.7 },
  },
  primary: {
    backgroundColor: tokens.primaryBackground,
    borderColor: tokens.primaryBackground,
    color: tokens.primaryText,
    minHeight: 40,
    paddingInline: 16,
    ":hover": {
      backgroundColor: `color-mix(in srgb, ${tokens.primaryBackground} 86%, ${tokens.surface})`,
      transform: LIFT,
    },
    ":active": {
      backgroundColor: `color-mix(in srgb, ${tokens.primaryBackground} 76%, ${tokens.surface})`,
      transform: "none",
    },
  },
  secondary: {
    backgroundColor: tokens.surface,
    borderColor: tokens.border,
    color: tokens.text,
    minHeight: 40,
    paddingInline: 16,
    ":hover": { backgroundColor: tokens.hoverStrong, transform: LIFT },
    ":active": { backgroundColor: tokens.pressed, transform: "none" },
  },
  oliveGhost: {
    backgroundColor: "transparent",
    borderColor: "transparent",
    color: tokens.oliveText,
    minHeight: 40,
    paddingInline: 16,
    ":hover": { backgroundColor: tokens.selected, transform: LIFT },
    ":active": { backgroundColor: tokens.pressed, transform: "none" },
  },
  destructive: {
    backgroundColor: tokens.surface,
    borderColor: tokens.warningBorder,
    color: tokens.warningText,
    minHeight: 40,
    paddingInline: 16,
    ":hover": { backgroundColor: tokens.warningSurface, transform: LIFT },
    ":active": { borderColor: tokens.warningText, transform: "none" },
  },
  icon: {
    backgroundColor: "transparent",
    borderColor: "transparent",
    color: tokens.textSoft,
    height: 36,
    paddingInline: 0,
    width: 36,
    ":hover": { backgroundColor: tokens.hover, color: tokens.text, transform: LIFT },
    ":active": { backgroundColor: tokens.pressed, transform: "none" },
  },
  destructiveIcon: {
    backgroundColor: "transparent",
    borderColor: "transparent",
    color: tokens.textSoft,
    height: 36,
    paddingInline: 0,
    width: 36,
    ":hover": {
      backgroundColor: tokens.warningSurface,
      color: tokens.warningText,
      transform: LIFT,
    },
    ":active": { borderColor: tokens.warningBorder, transform: "none" },
  },
  plain: {
    backgroundColor: "transparent",
    borderColor: "transparent",
    color: "inherit",
    padding: 0,
  },
  segmentActive: {
    backgroundColor: tokens.primaryBackground,
    borderColor: tokens.primaryBackground,
    color: tokens.primaryText,
    paddingBlock: 8,
    paddingInline: 14,
  },
  segmentIdle: {
    backgroundColor: tokens.surface,
    borderColor: tokens.border,
    color: tokens.textMuted,
    paddingBlock: 8,
    paddingInline: 14,
    ":hover": { backgroundColor: tokens.hoverStrong, color: tokens.text, transform: LIFT },
    ":active": { backgroundColor: tokens.pressed, transform: "none" },
  },
});

export function Button({
  variant = "secondary",
  active = false,
  className,
  ...props
}: ButtonProps) {
  return (
    <BaseButton
      className={cn(
        "memora-interactive",
        stylex.props(
          styles.base,
          variant === "segment"
            ? active
              ? styles.segmentActive
              : styles.segmentIdle
            : styles[variant],
        ).className,
        className,
      )}
      {...props}
    />
  );
}
