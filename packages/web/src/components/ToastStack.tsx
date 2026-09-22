import { Toast } from "@base-ui/react/toast";
import * as stylex from "@stylexjs/stylex";
import { motion } from "motion/react";
import { useMemo } from "react";

import { useNativeDialogLayer } from "../lib/nativeDialogLayer";

const styles = stylex.create({
  viewport: {
    bottom: "1.5rem",
    display: "flex",
    flexDirection: "column",
    position: "fixed",
    right: "1.5rem",
    width: "320px",
    zIndex: 60,
  },
  expanded: { gap: "0.75rem" },
  collapsed: { rowGap: 0, ":not(:empty) > :not(:first-child)": { marginTop: "-2rem" } },
  limited: { pointerEvents: "none" },
  toast: {
    alignItems: "flex-start",
    backgroundColor: "white",
    borderColor: "#e4e4e7",
    borderRadius: "1rem",
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
    display: "flex",
    gap: "0.75rem",
    paddingBlock: "0.75rem",
    paddingInline: "1rem",
    transitionDuration: "150ms",
    transitionProperty: "color, background-color, border-color, opacity, box-shadow, transform",
  },
  statusDot: {
    borderRadius: "9999px",
    display: "block",
    flexShrink: 0,
    height: "0.5rem",
    marginTop: "0.25rem",
    width: "0.5rem",
  },
  statusSuccess: { backgroundColor: "#10b981" },
  statusError: { backgroundColor: "#f43f5e" },
  statusDefault: { backgroundColor: "#a1a1aa" },
  toastBody: {
    flex: 1,
    minWidth: 0,
  },
  toastTitle: {
    color: "#18181b",
    fontSize: "0.875rem",
    fontWeight: 500,
    lineHeight: "1.25rem",
  },
  toastDescription: {
    color: "#71717a",
    fontSize: "0.75rem",
    lineHeight: "1rem",
    marginTop: "0.125rem",
  },
  toastAction: {
    backgroundColor: "transparent",
    border: "none",
    color: "#4f5742",
    cursor: "pointer",
    flexShrink: 0,
    fontSize: "0.875rem",
    fontWeight: 600,
    ":hover": { textDecoration: "underline" },
  },
  toastClose: {
    color: {
      default: "#a1a1aa",
      ":hover": "#3f3f46",
    },
    flexShrink: 0,
    transitionDuration: "150ms",
    transitionProperty: "color",
  },
  closeIcon: {
    fontSize: "0.75rem",
    lineHeight: "1rem",
  },
});

const statusStyle = (type?: string) => {
  switch (type) {
    case "success":
      return styles.statusSuccess;
    case "error":
      return styles.statusError;
    default:
      return styles.statusDefault;
  }
};

export default function ToastStack() {
  const portalContainer = useNativeDialogLayer();
  const { toasts } = Toast.useToastManager();
  const orderedToasts = useMemo(() => [...toasts].reverse(), [toasts]);
  const activeToasts = useMemo(
    () => toasts.filter((toast) => toast.transitionStatus !== "ending"),
    [toasts],
  );
  const visibleToasts = useMemo(
    () => orderedToasts.filter((toast) => !toast.limited).slice(0, 3),
    [orderedToasts],
  );

  const toastScale = (toast: (typeof toasts)[number]) => {
    const index = activeToasts.indexOf(toast);
    if (index <= 0) return 1;
    return Math.max(0.88, 1 - index * 0.05);
  };

  return (
    <Toast.Portal container={portalContainer}>
      <Toast.Viewport
        className={(state) =>
          stylex.props(styles.viewport, state.expanded ? styles.expanded : styles.collapsed)
            .className
        }
      >
        {visibleToasts.map((toast) => (
          <Toast.Root
            key={toast.id}
            toast={toast}
            render={(props, state) => {
              const {
                onDrag: _onDrag,
                onDragEnd: _onDragEnd,
                onDragStart: _onDragStart,
                onAnimationStart: _onAnimationStart,
                onAnimationEnd: _onAnimationEnd,
                onAnimationIteration: _onAnimationIteration,
                ...rest
              } = props;
              return (
                <motion.div
                  {...rest}
                  className={`${props.className ?? ""} ${stylex.props(state.limited && styles.limited).className ?? ""}`}
                  style={{
                    ...props.style,
                    zIndex: "calc(100 - var(--toast-index))",
                  }}
                  layout="position"
                  initial={{
                    opacity: 0,
                    y: 18,
                    scale: 0.96,
                    filter: "blur(0px)",
                  }}
                  animate={
                    state.transitionStatus === "starting"
                      ? {
                          opacity: 1,
                          y: 0,
                          x: 0,
                          scale: 1,
                          filter: "blur(0px)",
                        }
                      : state.transitionStatus === "ending"
                        ? {
                            opacity: 0,
                            x: 360,
                            scale: 0.96,
                            filter: "blur(0px)",
                          }
                        : {
                            opacity: 1,
                            y: 0,
                            x: 0,
                            scale: state.expanded ? 1 : toastScale(toast),
                            filter: "blur(0px)",
                          }
                  }
                  transition={{ type: "spring", stiffness: 520, damping: 32 }}
                />
              );
            }}
          >
            <Toast.Content {...stylex.props(styles.toast)}>
              <span {...stylex.props(styles.statusDot, statusStyle(toast.type))} />
              <div {...stylex.props(styles.toastBody)}>
                <Toast.Title {...stylex.props(styles.toastTitle)}>{toast.title}</Toast.Title>
                {toast.description ? (
                  <Toast.Description {...stylex.props(styles.toastDescription)}>
                    {toast.description}
                  </Toast.Description>
                ) : null}
              </div>
              <Toast.Action {...stylex.props(styles.toastAction)} />
              <Toast.Close {...stylex.props(styles.toastClose)} aria-label="Dismiss">
                <span {...stylex.props(styles.closeIcon)}>&#10005;</span>
              </Toast.Close>
            </Toast.Content>
          </Toast.Root>
        ))}
      </Toast.Viewport>
    </Toast.Portal>
  );
}
