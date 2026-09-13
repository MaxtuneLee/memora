import { type CSSProperties, useId } from "react";

import { cn } from "@/lib/cn";

export interface TabSelectOption<Value extends string> {
  value: Value;
  label: string;
  disabled?: boolean;
}

export interface TabSelectProps<Value extends string> {
  value: Value;
  onValueChange: (value: Value) => void;
  options: readonly TabSelectOption<Value>[];
  "aria-label": string;
  className?: string;
}

export function TabSelect<Value extends string>({
  value,
  onValueChange,
  options,
  className,
  "aria-label": ariaLabel,
}: TabSelectProps<Value>) {
  const name = useId();
  const activeTabIndex = Math.max(
    options.findIndex((option) => option.value === value),
    0,
  );
  const style = {
    "--tab-count": options.length,
    "--active-tab-index": activeTabIndex,
  } as CSSProperties;

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      style={style}
      className={cn(
        "relative isolate grid w-fit grid-cols-[repeat(var(--tab-count),minmax(0,1fr))] rounded-xl bg-memora-surface-muted p-1",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/var(--tab-count))] translate-x-[calc(var(--active-tab-index)*100%)] rounded-lg bg-memora-surface shadow-sm motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-out-quart"
      />
      {options.map((option) => (
        <label
          key={option.value}
          className="relative z-10 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-memora-olive-soft has-[:focus-visible]:ring-offset-2"
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            disabled={option.disabled}
            onChange={() => onValueChange(option.value)}
            className="peer sr-only"
          />
          <span className="flex h-8 cursor-pointer items-center justify-center rounded-lg px-3 text-xs font-semibold text-memora-text-muted transition-colors duration-200 ease-out-quart peer-checked:text-memora-text peer-disabled:cursor-not-allowed peer-disabled:opacity-50">
            {option.label}
          </span>
        </label>
      ))}
    </div>
  );
}
