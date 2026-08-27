import type { ComponentProps } from "react";

import { cn } from "@/lib/cn";

export interface InputProps extends ComponentProps<"input"> {}

export function Input({ className, ...props }: InputProps) {
  return (
    <input
      className={cn(
        "w-full rounded-[1rem] border border-[var(--color-memora-border)] bg-[var(--color-memora-surface)] px-3.5 py-2.5 text-sm text-[var(--color-memora-text)] outline-none transition-[border-color,box-shadow,background-color] duration-300 ease-[var(--ease-out-quart)] placeholder:text-[var(--color-memora-text-soft)] focus:border-[var(--color-memora-olive-soft)] focus:ring-1 focus:ring-[var(--color-memora-olive-soft)]",
        className,
      )}
      {...props}
    />
  );
}
