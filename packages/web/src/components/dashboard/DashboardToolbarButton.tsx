import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactElement } from "react";
import * as stylex from "@stylexjs/stylex";

import { cn } from "@/lib/cn";

const styles = stylex.create({
  root: {
    alignItems: "center",
    backgroundColor: "#fffdfa",
    borderColor: "#e7e1d7",
    borderRadius: 9999,
    borderStyle: "solid",
    borderWidth: 1,
    color: "#3c3934",
    cursor: "pointer",
    display: "inline-flex",
    fontSize: "0.875rem",
    fontWeight: 600,
    gap: "0.5rem",
    justifyContent: "flex-start",
    minHeight: "2.75rem",
    outline: "none",
    paddingBlock: "0.375rem",
    paddingInline: "0.625rem",
    textAlign: "left",
    // `scale` is animated as its own property rather than folded into `transform`, so the press
    // pop composes with the hover lift instead of one clobbering the other. It also gets its own
    // slot in these lists: a back-out curve that overshoots past the target is what reads as
    // spring, and applying that curve to the colours or to brightness would only clamp.
    transitionDuration: "150ms, 150ms, 150ms, 150ms, 150ms, 160ms, 160ms",
    transitionProperty:
      "background-color, border-color, box-shadow, transform, opacity, filter, scale",
    transitionTimingFunction: `cubic-bezier(0.22, 1, 0.36, 1), cubic-bezier(0.22, 1, 0.36, 1),
      cubic-bezier(0.22, 1, 0.36, 1), cubic-bezier(0.22, 1, 0.36, 1),
      cubic-bezier(0.22, 1, 0.36, 1), cubic-bezier(0.22, 1, 0.36, 1),
      cubic-bezier(0.34, 1.56, 0.64, 1)`,
    "@media (hover: hover) and (pointer: fine)": {
      ":hover": {
        backgroundColor: "#fffcf6",
        boxShadow: "0 8px 20px rgba(34, 33, 29, 0.05)",
        transform: "translateY(-1px)",
      },
    },
    // Brightness stays outside the reduced-motion gate: it is a tonal change, not movement, so it
    // remains as press feedback when the pop is suppressed. #fffdfa is already at the top of the
    // range, so brightening it would be invisible — the default tone has to go down to register.
    ":active": { filter: "brightness(1.5)" },
    // Declared only under no-preference, so reduced motion simply never gets the rule and there is
    // nothing to override. Matches TabSelect.tsx:28.
    "@media (prefers-reduced-motion: no-preference)": {
      ":active": { scale: "1.2" },
    },
    ":focus-visible": {
      boxShadow: "0 0 0 2px #a7af8f, 0 0 0 4px #fbfaf7",
    },
  },
  primary: {
    backgroundColor: "#4f5742",
    borderColor: "#4f5742",
    color: "#fffdf8",
    "@media (hover: hover) and (pointer: fine)": {
      ":hover": {
        backgroundColor: "#3d4433",
        borderColor: "#3d4433",
        boxShadow: "0 8px 20px rgba(34, 33, 29, 0.1)",
      },
    },
    // Inverted against the default tone. One direction cannot read on both: #4f5742 has room to
    // brighten and almost none to darken, so it lights up on press where the pale tone dims.
    ":active": { filter: "brightness(1.5)" },
  },
});

interface DashboardToolbarButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: "default" | "primary";
}

export const DashboardToolbarButton = forwardRef<HTMLButtonElement, DashboardToolbarButtonProps>(
  function DashboardToolbarButton(
    { className, tone = "default", type = "button", ...props },
    ref,
  ): ReactElement {
    const styleProps = stylex.props(styles.root, tone === "primary" && styles.primary);

    return (
      <button
        ref={ref}
        type={type}
        className={cn("dashboard-toolbar-button", styleProps.className, className)}
        {...props}
      />
    );
  },
);
