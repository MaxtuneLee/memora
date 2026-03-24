import { Toast } from "@base-ui/react/toast";
import { motion } from "motion/react";
import { useMemo, type ReactNode } from "react";

import { cn } from "../lib/cn";

type ToastStackProps = {
  render: (
    toast: ReturnType<typeof Toast.useToastManager>["toasts"][number]
  ) => ReactNode;
};

export default function ToastStack({ render }: ToastStackProps) {
  const { toasts } = Toast.useToastManager();
  const orderedToasts = useMemo(() => [...toasts].reverse(), [toasts]);
  const activeToasts = useMemo(
    () => toasts.filter((toast) => toast.transitionStatus !== "ending"),
    [toasts]
  );
  const visibleToasts = useMemo(
    () => orderedToasts.filter((toast) => !toast.limited).slice(0, 3),
    [orderedToasts]
  );

  const toastScale = (toast: (typeof toasts)[number]) => {
    const index = activeToasts.indexOf(toast);
    if (index <= 0) return 1;
    return Math.max(0.88, 1 - index * 0.05);
  };

  return (
    <Toast.Portal>
      <Toast.Viewport
        className={(state) =>
          cn(
            "fixed bottom-6 right-6 z-[60] flex w-[320px] flex-col",
            state.expanded ? "gap-3" : "-space-y-8"
          )
        }
      >
        {visibleToasts.map((toast) => (
          <Toast.Root
            key={toast.id}
            toast={toast}
            className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-lg"
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
                  className={cn(
                    props.className,
                    state.limited ? "pointer-events-none" : ""
                  )}
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
            {render(toast)}
          </Toast.Root>
        ))}
      </Toast.Viewport>
    </Toast.Portal>
  );
}
