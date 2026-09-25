import * as stylex from "@stylexjs/stylex";
import type { ComponentProps } from "react";

import { tokens } from "../../styles/stylex.stylex";

export interface InputProps extends ComponentProps<"input"> {}

const styles = stylex.create({
  input: {
    backgroundColor: tokens.surface,
    borderColor: tokens.border,
    borderRadius: "1rem",
    borderStyle: "solid",
    borderWidth: 1,
    color: tokens.text,
    fontSize: "0.875rem",
    lineHeight: "1.25rem",
    outline: "none",
    paddingBlock: "0.625rem",
    paddingInline: "0.875rem",
    transition:
      "border-color 300ms var(--ease-out-quart), box-shadow 300ms var(--ease-out-quart), background-color 300ms var(--ease-out-quart)",
    width: "100%",
    "::placeholder": {
      color: tokens.textMuted,
    },
    ":focus": {
      borderColor: tokens.focusRing,
      boxShadow: `0 0 0 1px ${tokens.focusRing}`,
    },
    ":disabled": {
      backgroundColor: tokens.controlDisabledBackground,
      color: tokens.controlDisabledText,
      cursor: "not-allowed",
    },
    "[aria-invalid=true]": {
      borderColor: tokens.dangerText,
      boxShadow: `0 0 0 1px ${tokens.dangerText}`,
    },
  },
});

export function Input({ className, ...props }: InputProps) {
  return (
    <input className={`${stylex.props(styles.input).className} ${className ?? ""}`} {...props} />
  );
}
