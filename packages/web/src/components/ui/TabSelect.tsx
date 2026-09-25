import { type CSSProperties, useId, useState } from "react";
import * as stylex from "@stylexjs/stylex";

import { cn } from "@/lib/cn";
import { tokens } from "../../styles/stylex.stylex";

const styles = stylex.create({
  root: {
    backgroundColor: tokens.surfaceMuted,
    borderRadius: 12,
    display: "grid",
    isolation: "isolate",
    padding: 4,
    position: "relative",
    width: "fit-content",
  },
  indicator: {
    backgroundColor: tokens.card,
    borderRadius: 8,
    bottom: 4,
    boxShadow: tokens.shadowSmall,
    left: 4,
    pointerEvents: "none",
    position: "absolute",
    top: 4,
    transform: "translateX(calc(var(--active-tab-index) * 100%))",
    transition: "none",
    width: "calc((100% - 0.5rem) / var(--tab-count))",
    "@media (prefers-reduced-motion: no-preference)": {
      transition: "transform 300ms var(--ease-out-quart)",
    },
  },
  option: { position: "relative", zIndex: 10 },
  optionFocused: {
    boxShadow: `0 0 0 2px ${tokens.surfaceMuted}, 0 0 0 4px ${tokens.focusRing}`,
  },
  input: {
    borderWidth: 0,
    clip: "rect(0, 0, 0, 0)",
    height: 1,
    margin: -1,
    overflow: "hidden",
    padding: 0,
    position: "absolute",
    whiteSpace: "nowrap",
    width: 1,
  },
  label: {
    alignItems: "center",
    borderRadius: 8,
    color: tokens.textMuted,
    cursor: "pointer",
    display: "flex",
    fontSize: "0.75rem",
    fontWeight: 600,
    height: 32,
    justifyContent: "center",
    paddingInline: 12,
    transition: "color 200ms var(--ease-out-quart)",
  },
  selectedLabel: { color: tokens.textStrong },
  disabledLabel: { cursor: "not-allowed", opacity: 0.5 },
});

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
  const [focusedValue, setFocusedValue] = useState<Value | null>(null);
  const activeTabIndex = Math.max(
    options.findIndex((option) => option.value === value),
    0,
  );
  const style = {
    "--tab-count": options.length,
    "--active-tab-index": activeTabIndex,
    gridTemplateColumns: "repeat(var(--tab-count), minmax(0, 1fr))",
  } as CSSProperties;

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      style={style}
      className={cn(stylex.props(styles.root).className, className)}
    >
      <span aria-hidden="true" {...stylex.props(styles.indicator)} />
      {options.map((option) => (
        <label
          key={option.value}
          {...stylex.props(styles.option, focusedValue === option.value && styles.optionFocused)}
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            disabled={option.disabled}
            onChange={() => onValueChange(option.value)}
            onBlur={() => setFocusedValue(null)}
            onFocus={() => setFocusedValue(option.value)}
            {...stylex.props(styles.input)}
          />
          <span
            {...stylex.props(
              styles.label,
              value === option.value && styles.selectedLabel,
              option.disabled && styles.disabledLabel,
            )}
          >
            {option.label}
          </span>
        </label>
      ))}
    </div>
  );
}
