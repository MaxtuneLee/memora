import { Switch as BaseSwitch } from "@base-ui/react/switch";
import type { ComponentProps } from "react";
import * as stylex from "@stylexjs/stylex";

import { tokens } from "../../styles/stylex.stylex";

const styles = stylex.create({
  root: {
    alignItems: "center",
    backgroundColor: tokens.borderStrong,
    borderRadius: 9999,
    display: "inline-flex",
    flexShrink: 0,
    height: 24,
    padding: 4,
    transition: "background-color 150ms",
    width: 44,
    "[data-checked]": { backgroundColor: tokens.primaryBackground },
    "[data-disabled]": { opacity: 0.5 },
    ":focus-visible": {
      boxShadow: `0 0 0 2px ${tokens.surface}, 0 0 0 4px ${tokens.focusRing}`,
      outline: "none",
    },
  },
  thumb: {
    backgroundColor: tokens.card,
    borderRadius: 9999,
    display: "block",
    height: 16,
    boxShadow: tokens.shadowSmall,
    transform: "translateX(0)",
    transition: "transform 150ms",
    width: 16,
    "[data-checked]": { transform: "translateX(20px)" },
  },
});

export interface SwitchProps extends Omit<ComponentProps<typeof BaseSwitch.Root>, "className"> {
  className?: string;
}

export function Switch({ className, ...props }: SwitchProps) {
  return (
    <BaseSwitch.Root
      className={`${stylex.props(styles.root).className} ${className ?? ""}`}
      {...props}
    >
      <BaseSwitch.Thumb className={stylex.props(styles.thumb).className} />
    </BaseSwitch.Root>
  );
}
