import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode, RefObject } from "react";

import { cn } from "../../lib/cn";

import "./nativeDialog.css";

interface NativeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  className?: string;
  viewportClassName?: string;
  panelClassName?: string;
  panelStyle?: CSSProperties;
  closeOnBackdropPress?: boolean;
  closeOnEscape?: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
  finalFocusRef?: RefObject<HTMLElement | null>;
  labelledBy?: string;
  describedBy?: string;
}

const EXIT_ANIMATION_MS = 180;
const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

type DialogState = "closed" | "opening" | "open" | "closing";

const resolveInitialFocus = (
  panel: HTMLDivElement | null,
  initialFocusRef?: RefObject<HTMLElement | null>,
) => {
  const preferredTarget = initialFocusRef?.current;
  if (preferredTarget?.isConnected) {
    preferredTarget.focus();
    return;
  }

  const fallbackTarget = panel?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
  if (fallbackTarget) {
    fallbackTarget.focus();
    return;
  }

  panel?.focus();
};

const restoreFocus = (
  finalFocusRef?: RefObject<HTMLElement | null>,
  previousFocus?: HTMLElement | null,
) => {
  const preferredTarget = finalFocusRef?.current;
  if (preferredTarget?.isConnected) {
    preferredTarget.focus();
    return;
  }

  if (previousFocus?.isConnected) {
    previousFocus.focus();
  }
};

export function NativeDialog({
  open,
  onOpenChange,
  children,
  className,
  viewportClassName,
  panelClassName,
  panelStyle,
  closeOnBackdropPress = true,
  closeOnEscape = true,
  initialFocusRef,
  finalFocusRef,
  labelledBy,
  describedBy,
}: NativeDialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const latestOpenRef = useRef(open);
  const latestOpenChangeRef = useRef(onOpenChange);
  const [mounted, setMounted] = useState(open);
  const [state, setState] = useState<DialogState>(open ? "open" : "closed");
  const fallbackTitleId = useId();
  const resolvedLabelledBy = labelledBy ?? fallbackTitleId;
  const shouldShowAriaLabel = useMemo(() => !!labelledBy, [labelledBy]);

  useEffect(() => {
    latestOpenRef.current = open;
  }, [open]);

  useEffect(() => {
    latestOpenChangeRef.current = onOpenChange;
  }, [onOpenChange]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }

    const handleCancel = (event: Event) => {
      event.preventDefault();
      if (!closeOnEscape) {
        return;
      }

      latestOpenChangeRef.current(false);
    };

    const handleClose = () => {
      if (!latestOpenRef.current) {
        return;
      }

      latestOpenChangeRef.current(false);
    };

    dialog.addEventListener("cancel", handleCancel);
    dialog.addEventListener("close", handleClose);
    return () => {
      dialog.removeEventListener("cancel", handleCancel);
      dialog.removeEventListener("close", handleClose);
    };
  }, [closeOnEscape, mounted]);

  useEffect(() => {
    if (!open) {
      const dialog = dialogRef.current;
      if (!dialog || state === "closing" || state === "closed") {
        return;
      }

      setState("closing");
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }

      closeTimerRef.current = window.setTimeout(() => {
        if (dialog.open) {
          dialog.close();
        }
        setMounted(false);
        setState("closed");
        restoreFocus(finalFocusRef, previousFocusRef.current);
        closeTimerRef.current = null;
      }, EXIT_ANIMATION_MS);

      return;
    }

    if (!mounted) {
      previousFocusRef.current =
        typeof document !== "undefined" && document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      setState("opening");
      setMounted(true);
      return;
    }

    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }

    if (state === "closing") {
      setState("open");
    }
  }, [finalFocusRef, mounted, open, state]);

  useEffect(() => {
    if (!open || !mounted) {
      return;
    }

    let settleFrame: number | null = null;
    const animationFrame = window.requestAnimationFrame(() => {
      const dialog = dialogRef.current;
      if (!dialog || dialog.open) {
        return;
      }

      dialog.showModal();
      resolveInitialFocus(panelRef.current, initialFocusRef);

      if (state === "opening") {
        settleFrame = window.requestAnimationFrame(() => {
          if (latestOpenRef.current && dialogRef.current?.open) {
            setState("open");
          }
        });
      }
    });

    return () => {
      window.cancelAnimationFrame(animationFrame);
      if (settleFrame !== null) {
        window.cancelAnimationFrame(settleFrame);
      }
    };
  }, [initialFocusRef, mounted, open, state]);

  if (!mounted) {
    return null;
  }

  return (
    <dialog
      ref={dialogRef}
      className={cn("memora-native-dialog", className)}
      data-state={state}
      aria-labelledby={shouldShowAriaLabel ? resolvedLabelledBy : undefined}
      aria-describedby={describedBy}
      onClick={(event) => {
        if (!closeOnBackdropPress) {
          return;
        }

        if (event.target === event.currentTarget) {
          onOpenChange(false);
        }
      }}
    >
      <div className={cn("memora-native-dialog__viewport", viewportClassName)}>
        <div
          ref={panelRef}
          className={cn("memora-native-dialog__panel", panelClassName)}
          style={panelStyle}
          tabIndex={-1}
        >
          {shouldShowAriaLabel ? null : (
            <span id={resolvedLabelledBy} className="sr-only">
              Dialog
            </span>
          )}
          {children}
        </div>
      </div>
    </dialog>
  );
}
