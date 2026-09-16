import * as stylex from "@stylexjs/stylex";
import type { ComponentProps } from "react";

export interface InputProps extends ComponentProps<"input"> {}

const styles = stylex.create({
  input: {
    backgroundColor: "var(--color-memora-surface)",
    borderColor: "var(--color-memora-border)",
    borderRadius: "1rem",
    borderStyle: "solid",
    borderWidth: 1,
    color: "var(--color-memora-text)",
    fontSize: "0.875rem",
    lineHeight: "1.25rem",
    outline: "none",
    paddingBlock: "0.625rem",
    paddingInline: "0.875rem",
    transition:
      "border-color 300ms var(--ease-out-quart), box-shadow 300ms var(--ease-out-quart), background-color 300ms var(--ease-out-quart)",
    width: "100%",
    "::placeholder": {
      color: "var(--color-memora-text-soft)",
    },
    ":focus": {
      borderColor: "var(--color-memora-olive-soft)",
      boxShadow: "0 0 0 1px var(--color-memora-olive-soft)",
    },
  },
});

export function Input({ className, ...props }: InputProps) {
  return (
    <input className={`${stylex.props(styles.input).className} ${className ?? ""}`} {...props} />
  );
}
