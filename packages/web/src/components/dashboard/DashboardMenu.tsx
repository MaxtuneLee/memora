import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  ButtonHTMLAttributes,
  CSSProperties,
  ComponentPropsWithoutRef,
  HTMLAttributes,
  KeyboardEvent,
  MouseEvent,
  ReactElement,
  ReactNode,
} from "react";
import * as stylex from "@stylexjs/stylex";

import { cn } from "@/lib/cn";

import "./dashboardMenu.css";

const styles = stylex.create({
  trigger: {
    alignItems: "center",
    backgroundColor: "#fffdfa",
    borderColor: "#e7e1d7",
    borderRadius: 9999,
    borderStyle: "solid",
    borderWidth: 1,
    color: "#3c3934",
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
    transitionDuration: "300ms",
    transitionProperty: "background-color, border-color, box-shadow, transform, opacity",
    transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
    ":hover": {
      backgroundColor: "#fffcf6",
      boxShadow: "0 8px 20px rgba(34, 33, 29, 0.05)",
      transform: "translateY(-1px)",
    },
    ":focus-visible": {
      boxShadow: "0 0 0 2px #a7af8f, 0 0 0 4px #fbfaf7",
    },
    "[data-open=true]": {
      backgroundColor: "#fffcf6",
      borderColor: "#ddd7cb",
      boxShadow: "0 10px 24px rgba(34, 33, 29, 0.06)",
      opacity: 0,
      transitionDuration: "150ms",
    },
  },
  item: {
    outline: "none",
    transition: "background-color 150ms",
    ":focus-visible": { backgroundColor: "#faf7f0" },
    ":hover": { backgroundColor: "#faf7f0" },
  },
});

interface DashboardMenuProps {
  children: ReactNode;
}

interface DashboardMenuContextValue {
  anchorName: string;
  isOpen: boolean;
  layout: DashboardMenuLayout;
  popoverId: string;
  registerMeasure: (node: HTMLDivElement | null) => void;
  registerPopover: (node: HTMLDivElement | null) => void;
  registerTrigger: (node: HTMLButtonElement | null) => void;
  closeMenu: () => void;
  openMenu: () => void;
  syncLayout: () => void;
  toggleMenu: () => void;
  focusBoundaryItem: (target: "first" | "last") => void;
  focusRelativeItem: (delta: 1 | -1) => void;
}

type AnchorStyle = CSSProperties & {
  anchorName?: string;
  positionAnchor?: string;
};

type DashboardMenuStyle = CSSProperties & {
  "--dashboard-menu-open-height"?: string;
  "--dashboard-menu-open-width"?: string;
  "--dashboard-menu-trigger-height"?: string;
  "--dashboard-menu-trigger-width"?: string;
  height?: string;
  width?: string;
};

interface DashboardMenuLayout {
  openHeight: number;
  openWidth: number;
  triggerHeight: number;
  triggerWidth: number;
}

const DashboardMenuContext = createContext<DashboardMenuContextValue | null>(null);

const getMenuItems = (container: HTMLDivElement | null): HTMLButtonElement[] => {
  if (!container) {
    return [];
  }

  return Array.from(
    container.querySelectorAll<HTMLButtonElement>("[data-dashboard-menu-item]"),
  ).filter((item) => !item.disabled);
};

const isPopoverOpen = (node: HTMLDivElement | null): boolean => {
  if (!node) {
    return false;
  }

  return node.matches(":popover-open");
};

const useDashboardMenuContext = (): DashboardMenuContextValue => {
  const context = useContext(DashboardMenuContext);

  if (!context) {
    throw new Error("DashboardMenu components must be used within DashboardMenu.");
  }

  return context;
};

export function DashboardMenu({ children }: DashboardMenuProps): ReactElement {
  const reactId = useId();
  const anchorName = useMemo(
    () => `--dashboard-menu-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`,
    [reactId],
  );
  const popoverId = useMemo(
    () => `dashboard-menu-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`,
    [reactId],
  );
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const measureRef = useRef<HTMLDivElement | null>(null);
  const [popoverNode, setPopoverNode] = useState<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [layout, setLayout] = useState<DashboardMenuLayout>({
    openHeight: 0,
    openWidth: 0,
    triggerHeight: 44,
    triggerWidth: 164,
  });

  const registerPopover = useCallback((node: HTMLDivElement | null) => {
    popoverRef.current = node;
    setPopoverNode(node);
  }, []);

  const registerTrigger = useCallback((node: HTMLButtonElement | null) => {
    triggerRef.current = node;
  }, []);

  const registerMeasure = useCallback((node: HTMLDivElement | null) => {
    measureRef.current = node;
  }, []);

  const syncLayout = useCallback(() => {
    const trigger = triggerRef.current;
    const measure = measureRef.current;

    if (!trigger || !measure) {
      return;
    }

    const triggerRect = trigger.getBoundingClientRect();
    const measureRect = measure.getBoundingClientRect();
    const nextLayout = {
      openHeight: Math.ceil(measureRect.height),
      openWidth: Math.ceil(measureRect.width),
      triggerHeight: Math.ceil(triggerRect.height),
      triggerWidth: Math.ceil(triggerRect.width),
    };

    setLayout((currentLayout) => {
      if (
        currentLayout.openHeight === nextLayout.openHeight &&
        currentLayout.openWidth === nextLayout.openWidth &&
        currentLayout.triggerHeight === nextLayout.triggerHeight &&
        currentLayout.triggerWidth === nextLayout.triggerWidth
      ) {
        return currentLayout;
      }

      return nextLayout;
    });
  }, []);

  const focusBoundaryItem = useCallback((target: "first" | "last") => {
    const items = getMenuItems(popoverRef.current);

    if (items.length === 0) {
      return;
    }

    const nextItem = target === "first" ? items[0] : items[items.length - 1];
    nextItem.focus();
  }, []);

  const focusRelativeItem = useCallback((delta: 1 | -1) => {
    const items = getMenuItems(popoverRef.current);

    if (items.length === 0) {
      return;
    }

    const activeElement = document.activeElement;
    const currentIndex = items.findIndex((item) => item === activeElement);

    if (currentIndex === -1) {
      const fallbackIndex = delta > 0 ? 0 : items.length - 1;
      items[fallbackIndex]?.focus();
      return;
    }

    const nextIndex = (currentIndex + delta + items.length) % items.length;
    items[nextIndex]?.focus();
  }, []);

  const openMenu = useCallback(() => {
    const popover = popoverRef.current;

    if (!popover || isPopoverOpen(popover)) {
      return;
    }

    syncLayout();
    popover.showPopover();
  }, [syncLayout]);

  const closeMenu = useCallback(() => {
    const popover = popoverRef.current;

    if (!popover || !isPopoverOpen(popover)) {
      return;
    }

    popover.hidePopover();
  }, []);

  const toggleMenu = useCallback(() => {
    const popover = popoverRef.current;

    if (!popover) {
      return;
    }

    if (isPopoverOpen(popover)) {
      popover.hidePopover();
      return;
    }

    syncLayout();
    popover.showPopover();
  }, [syncLayout]);

  useLayoutEffect(() => {
    syncLayout();
  }, [syncLayout]);

  useEffect(() => {
    const trigger = triggerRef.current;
    const measure = measureRef.current;

    if (!trigger || !measure) {
      return;
    }

    const resizeObserver = new ResizeObserver(() => {
      syncLayout();
    });

    resizeObserver.observe(trigger);
    resizeObserver.observe(measure);

    return () => {
      resizeObserver.disconnect();
    };
  }, [syncLayout]);

  useEffect(() => {
    if (!popoverNode) {
      return;
    }

    const handleToggle = (event: Event) => {
      const nextState = (event as Event & { newState?: "open" | "closed" }).newState ?? "closed";
      const nextOpen = nextState === "open";
      setIsOpen(nextOpen);

      if (nextOpen) {
        requestAnimationFrame(() => {
          focusBoundaryItem("first");
        });
        return;
      }

      requestAnimationFrame(() => {
        triggerRef.current?.focus();
      });
    };

    popoverNode.addEventListener("toggle", handleToggle);

    return () => {
      popoverNode.removeEventListener("toggle", handleToggle);
    };
  }, [focusBoundaryItem, popoverNode]);

  const contextValue = useMemo<DashboardMenuContextValue>(() => {
    return {
      anchorName,
      isOpen,
      layout,
      popoverId,
      registerMeasure,
      registerPopover,
      registerTrigger,
      closeMenu,
      openMenu,
      syncLayout,
      toggleMenu,
      focusBoundaryItem,
      focusRelativeItem,
    };
  }, [
    anchorName,
    closeMenu,
    focusBoundaryItem,
    focusRelativeItem,
    isOpen,
    layout,
    openMenu,
    popoverId,
    registerMeasure,
    registerPopover,
    registerTrigger,
    syncLayout,
    toggleMenu,
  ]);

  return (
    <DashboardMenuContext.Provider value={contextValue}>{children}</DashboardMenuContext.Provider>
  );
}

interface DashboardMenuTriggerProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
}

export function DashboardMenuTrigger({
  children,
  className,
  onClick,
  onKeyDown,
  style,
  ...props
}: DashboardMenuTriggerProps): ReactElement {
  const { anchorName, isOpen, popoverId, registerTrigger, openMenu, toggleMenu } =
    useDashboardMenuContext();

  const handleClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      onClick?.(event);

      if (event.defaultPrevented) {
        return;
      }

      toggleMenu();
    },
    [onClick, toggleMenu],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      onKeyDown?.(event);

      if (event.defaultPrevented) {
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        openMenu();
      }
    },
    [onKeyDown, openMenu],
  );

  const mergedStyle = {
    ...style,
    anchorName,
  } as AnchorStyle;

  return (
    <button
      ref={registerTrigger}
      type="button"
      aria-controls={popoverId}
      aria-expanded={isOpen}
      aria-haspopup="menu"
      data-open={isOpen ? "true" : "false"}
      className={cn("dashboard-menu-trigger", stylex.props(styles.trigger).className, className)}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      style={mergedStyle}
      {...props}
    >
      {children}
    </button>
  );
}

interface DashboardMenuContentProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  children: ReactNode;
}

export function DashboardMenuContent({
  children,
  className,
  onKeyDown,
  style,
  ...props
}: DashboardMenuContentProps): ReactElement {
  const {
    anchorName,
    popoverId,
    layout,
    registerMeasure,
    registerPopover,
    focusBoundaryItem,
    focusRelativeItem,
    syncLayout,
  } = useDashboardMenuContext();

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      onKeyDown?.(event);

      if (event.defaultPrevented) {
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        focusRelativeItem(1);
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        focusRelativeItem(-1);
        return;
      }

      if (event.key === "Home") {
        event.preventDefault();
        focusBoundaryItem("first");
        return;
      }

      if (event.key === "End") {
        event.preventDefault();
        focusBoundaryItem("last");
      }
    },
    [focusBoundaryItem, focusRelativeItem, onKeyDown],
  );

  const mergedStyle = {
    ...style,
    "--dashboard-menu-open-height": `${layout.openHeight}px`,
    "--dashboard-menu-open-width": `${layout.openWidth}px`,
    "--dashboard-menu-trigger-height": `${layout.triggerHeight}px`,
    "--dashboard-menu-trigger-width": `${layout.triggerWidth}px`,
    height: `${layout.openHeight}px`,
    positionAnchor: anchorName,
    width: `${layout.openWidth}px`,
  } as DashboardMenuStyle & AnchorStyle;

  useLayoutEffect(() => {
    syncLayout();
  }, [children, className, syncLayout]);

  return (
    <>
      <div ref={registerMeasure} aria-hidden="true" className="dashboard-menu-measure">
        <div className={cn("dashboard-menu-panel dashboard-menu-panel--measure", className)}>
          <div className="dashboard-menu-body">{children}</div>
        </div>
      </div>
      <div
        ref={registerPopover}
        id={popoverId}
        popover="auto"
        role="menu"
        className="dashboard-menu-popover"
        onKeyDown={handleKeyDown}
        style={mergedStyle}
        {...props}
      >
        <div className={cn("dashboard-menu-panel", className)}>
          <div className="dashboard-menu-shell" />
          <div className="dashboard-menu-body">{children}</div>
        </div>
      </div>
    </>
  );
}

interface DashboardMenuItemProps extends ComponentPropsWithoutRef<"button"> {
  children: ReactNode;
}

export function DashboardMenuItem({
  children,
  className,
  onClick,
  type,
  ...props
}: DashboardMenuItemProps): ReactElement {
  const { closeMenu } = useDashboardMenuContext();

  const handleClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      onClick?.(event);

      if (event.defaultPrevented) {
        return;
      }

      closeMenu();
    },
    [closeMenu, onClick],
  );

  return (
    <button
      data-dashboard-menu-item=""
      type={type ?? "button"}
      role="menuitem"
      className={cn(stylex.props(styles.item).className, className)}
      onClick={handleClick}
      {...props}
    >
      {children}
    </button>
  );
}
