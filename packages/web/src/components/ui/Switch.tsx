import { Switch as BaseSwitch } from "@base-ui/react/switch";
import type { ComponentProps } from "react";

import { cn } from "@/lib/cn";

export interface SwitchProps extends Omit<ComponentProps<typeof BaseSwitch.Root>, "className"> {
  className?: string;
}

export function Switch({ className, ...props }: SwitchProps) {
  return (
    <BaseSwitch.Root
      className={cn(
        "inline-flex h-6 w-11 shrink-0 items-center rounded-full bg-[var(--color-memora-border)] p-1 transition-colors data-[checked]:bg-[var(--color-memora-text-strong)] data-[disabled]:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-memora-olive-soft)] focus-visible:ring-offset-2",
        className,
      )}
      {...props}
    >
      <BaseSwitch.Thumb className="block size-4 translate-x-0 rounded-full bg-[var(--color-memora-surface)] shadow-sm transition-transform data-[checked]:translate-x-5" />
    </BaseSwitch.Root>
  );
}
