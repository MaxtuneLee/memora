import { Button as BaseButton } from "@base-ui/react/button";
import type { ComponentProps } from "react";

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

const BUTTON_VARIANTS: Record<Exclude<ButtonVariant, "segment">, string> = {
  primary:
    "min-h-10 border-[var(--color-memora-text-strong)] bg-[var(--color-memora-text-strong)] px-4 text-[var(--color-memora-surface)] hover:-translate-y-0.5 hover:border-[#4a463e] hover:bg-[#34312b]",
  secondary:
    "min-h-10 border-[var(--color-memora-border)] bg-[var(--color-memora-surface)] px-4 text-[var(--color-memora-text)] hover:-translate-y-0.5 hover:bg-[var(--color-memora-hover-strong)]",
  oliveGhost:
    "min-h-10 border-transparent bg-transparent px-4 text-[var(--color-memora-olive-soft)] hover:-translate-y-0.5 hover:bg-[color-mix(in_srgb,var(--color-memora-olive-soft)_20%,transparent)] hover:text-[var(--color-memora-olive-soft)]",
  destructive:
    "min-h-10 border-[var(--color-memora-warning-border)] bg-[var(--color-memora-surface)] px-4 text-[var(--color-memora-warning-text)] hover:-translate-y-0.5 hover:bg-[var(--color-memora-warning-surface)]",
  icon: "size-9 border-transparent bg-transparent px-0 text-[var(--color-memora-text-soft)] hover:-translate-y-0.5 hover:bg-[var(--color-memora-hover)] hover:text-[var(--color-memora-text)]",
  destructiveIcon:
    "size-9 border-transparent bg-transparent px-0 text-[var(--color-memora-text-soft)] hover:-translate-y-0.5 hover:bg-[var(--color-memora-warning-surface)] hover:text-[var(--color-memora-warning-text)]",
  plain: "border-transparent bg-transparent p-0 text-inherit",
};

const getSegmentClassName = (active: boolean): string =>
  active
    ? "border-[var(--color-memora-text-strong)] bg-[var(--color-memora-text-strong)] px-3.5 py-2 text-[var(--color-memora-surface)]"
    : "border-[var(--color-memora-border)] bg-[var(--color-memora-surface)] px-3.5 py-2 text-[var(--color-memora-text-muted)] hover:-translate-y-0.5 hover:bg-[var(--color-memora-hover-strong)] hover:text-[var(--color-memora-text)]";

export function Button({
  variant = "secondary",
  active = false,
  className,
  ...props
}: ButtonProps) {
  return (
    <BaseButton
      className={cn(
        "memora-interactive inline-flex items-center justify-center gap-2 rounded-full border text-xs font-semibold transition-[background-color,border-color,color,box-shadow,transform] duration-300 ease-[var(--ease-out-quart)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-memora-olive-soft)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        variant === "segment" ? getSegmentClassName(active) : BUTTON_VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}
