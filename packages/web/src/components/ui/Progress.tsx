import { Progress as BaseProgress } from "@base-ui/react/progress";
import * as stylex from "@stylexjs/stylex";

const styles = stylex.create({
  root: { display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 },
  labelRow: {
    color: "var(--color-memora-text-muted)",
    display: "flex",
    fontSize: 12,
    gap: 12,
    justifyContent: "space-between",
  },
  label: { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  value: { flexShrink: 0, fontVariantNumeric: "tabular-nums" },
  track: {
    backgroundColor: "var(--color-memora-border)",
    borderRadius: 9999,
    height: 6,
    overflow: "hidden",
    width: "100%",
  },
  indicator: {
    backgroundColor: "var(--color-memora-text-strong)",
    height: "100%",
    transition: "width 300ms ease-out",
  },
});

export interface ProgressProps {
  label: string;
  value: number;
  className?: string;
  trackClassName?: string;
  indicatorClassName?: string;
}

export function Progress({
  label,
  value,
  className,
  trackClassName,
  indicatorClassName,
}: ProgressProps) {
  const normalizedValue = Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : null;

  return (
    <BaseProgress.Root
      value={normalizedValue}
      className={`${stylex.props(styles.root).className} ${className ?? ""}`}
    >
      <div {...stylex.props(styles.labelRow)}>
        <BaseProgress.Label className={stylex.props(styles.label).className}>
          {label}
        </BaseProgress.Label>
        <BaseProgress.Value className={stylex.props(styles.value).className}>
          {(formattedValue) => (formattedValue ? `${formattedValue}%` : "")}
        </BaseProgress.Value>
      </div>
      <BaseProgress.Track
        className={`${stylex.props(styles.track).className} ${trackClassName ?? ""}`}
      >
        <BaseProgress.Indicator
          className={`${stylex.props(styles.indicator).className} ${indicatorClassName ?? ""}`}
        />
      </BaseProgress.Track>
    </BaseProgress.Root>
  );
}
