import { Button as BaseButton } from "@base-ui/react/button";
import type { ComponentProps } from "react";
import * as stylex from "@stylexjs/stylex";

import { cn } from "@/lib/cn";

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
    ":focus-visible": {
      boxShadow: "0 0 0 2px var(--color-memora-olive-soft), 0 0 0 4px var(--color-memora-surface)",
      outline: "none",
    },
  },
  primary: {
    backgroundColor: "var(--color-memora-text-strong)",
    borderColor: "var(--color-memora-text-strong)",
    color: "var(--color-memora-surface)",
    minHeight: 40,
    paddingInline: 16,
    ":hover": {
      backgroundColor: "#34312b",
      borderColor: "#4a463e",
      transform: "translateY(-0.125rem)",
    },
  },
  secondary: {
    backgroundColor: "var(--color-memora-surface)",
    borderColor: "var(--color-memora-border)",
    color: "var(--color-memora-text)",
    minHeight: 40,
    paddingInline: 16,
    ":hover": {
      backgroundColor: "var(--color-memora-hover-strong)",
      transform: "translateY(-0.125rem)",
    },
  },
  oliveGhost: {
    backgroundColor: "transparent",
    borderColor: "transparent",
    color: "var(--color-memora-olive-soft)",
    minHeight: 40,
    paddingInline: 16,
    ":hover": {
      backgroundColor: "color-mix(in srgb, var(--color-memora-olive-soft) 20%, transparent)",
      color: "var(--color-memora-olive-soft)",
      transform: "translateY(-0.125rem)",
    },
  },
  destructive: {
    backgroundColor: "var(--color-memora-surface)",
    borderColor: "var(--color-memora-warning-border)",
    color: "var(--color-memora-warning-text)",
    minHeight: 40,
    paddingInline: 16,
    ":hover": {
      backgroundColor: "var(--color-memora-warning-surface)",
      transform: "translateY(-0.125rem)",
    },
  },
  icon: {
    backgroundColor: "transparent",
    borderColor: "transparent",
    color: "var(--color-memora-text-soft)",
    height: 36,
    paddingInline: 0,
    width: 36,
    ":hover": {
      backgroundColor: "var(--color-memora-hover)",
      color: "var(--color-memora-text)",
      transform: "translateY(-0.125rem)",
    },
  },
  destructiveIcon: {
    backgroundColor: "transparent",
    borderColor: "transparent",
    color: "var(--color-memora-text-soft)",
    height: 36,
    paddingInline: 0,
    width: 36,
    ":hover": {
      backgroundColor: "var(--color-memora-warning-surface)",
      color: "var(--color-memora-warning-text)",
      transform: "translateY(-0.125rem)",
    },
  },
  plain: {
    backgroundColor: "transparent",
    borderColor: "transparent",
    color: "inherit",
    padding: 0,
  },
  segmentActive: {
    backgroundColor: "var(--color-memora-text-strong)",
    borderColor: "var(--color-memora-text-strong)",
    color: "var(--color-memora-surface)",
    paddingBlock: 8,
    paddingInline: 14,
  },
  segmentIdle: {
    backgroundColor: "var(--color-memora-surface)",
    borderColor: "var(--color-memora-border)",
    color: "var(--color-memora-text-muted)",
    paddingBlock: 8,
    paddingInline: 14,
    ":hover": {
      backgroundColor: "var(--color-memora-hover-strong)",
      color: "var(--color-memora-text)",
      transform: "translateY(-0.125rem)",
    },
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
