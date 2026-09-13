import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { CaretDownIcon, CheckIcon } from "@phosphor-icons/react";
import { Select as BaseSelect } from "@base-ui/react/select";

import { cn } from "@/lib/cn";

import "./select.css";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps {
  id?: string;
  name?: string;
  disabled?: boolean;
  required?: boolean;
  value: string | null;
  onValueChange: (value: string | null) => void;
  options: readonly SelectOption[];
  placeholder?: string;
  triggerClassName?: string;
}

interface SelectLayout {
  openHeight: number;
  openWidth: number;
  triggerHeight: number;
  triggerWidth: number;
}

type SelectPopupStyle = CSSProperties & {
  "--select-open-height"?: string;
  "--select-open-width"?: string;
  "--select-trigger-height"?: string;
  "--select-trigger-width"?: string;
};

const INITIAL_LAYOUT: SelectLayout = {
  openHeight: 240,
  openWidth: 224,
  triggerHeight: 42,
  triggerWidth: 172,
};

export function Select({
  id,
  value,
  onValueChange,
  options,
  placeholder,
  triggerClassName,
  ...props
}: SelectProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const measureRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [layout, setLayout] = useState<SelectLayout>(INITIAL_LAYOUT);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);

  const syncLayout = useCallback(() => {
    const trigger = triggerRef.current;
    const measure = measureRef.current;

    if (!trigger || !measure) {
      return;
    }

    const triggerRect = trigger.getBoundingClientRect();
    const measureRect = measure.getBoundingClientRect();
    const triggerWidth = Math.ceil(triggerRect.width);
    const nextLayout = {
      openHeight: Math.ceil(measureRect.height),
      openWidth: Math.max(triggerWidth, Math.ceil(measure.scrollWidth)),
      triggerHeight: Math.ceil(triggerRect.height),
      triggerWidth,
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

  useEffect(() => {
    // Base UI top-layer portals (dialogs, native popovers) need the popup rendered inside them.
    const ancestor = containerRef.current?.closest("dialog, [popover]");
    setPortalContainer((ancestor as HTMLElement | null) ?? null);
  }, []);

  useLayoutEffect(() => {
    syncLayout();
  }, [value, options, syncLayout]);

  useEffect(() => {
    const trigger = triggerRef.current;
    const measure = measureRef.current;

    if (!trigger || !measure || typeof ResizeObserver === "undefined") {
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

  const handleOpenChange = useCallback(
    (open: boolean) => {
      syncLayout();
      setIsOpen(open);
    },
    [syncLayout],
  );

  const setTriggerRef = useCallback((trigger: HTMLButtonElement | null) => {
    triggerRef.current = trigger;
  }, []);

  const popupStyle: SelectPopupStyle = {
    "--select-open-height": `${layout.openHeight}px`,
    "--select-open-width": `${layout.openWidth}px`,
    "--select-trigger-height": `${layout.triggerHeight}px`,
    "--select-trigger-width": `${layout.triggerWidth}px`,
    width: `${layout.openWidth}px`,
  };

  return (
    <div ref={containerRef} data-surface="select">
      <div
        ref={measureRef}
        aria-hidden="true"
        className="select-measure"
        style={{ minWidth: `${layout.triggerWidth}px` }}
      >
        <div className="select-panel select-panel--measure">
          <div className="select-body select-body--measure">
            <div className="select-list">
              {options.map((option) => (
                <div
                  key={option.value}
                  data-selected={option.value === value ? "" : undefined}
                  className="select-item"
                >
                  <span>{option.label}</span>
                  <span className="select-item-indicator" aria-hidden="true">
                    <CheckIcon className="size-4" weight="bold" />
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <BaseSelect.Root
        value={value}
        open={isOpen}
        onOpenChange={handleOpenChange}
        onValueChange={(nextValue) => onValueChange(nextValue)}
        items={options}
        {...props}
      >
        <BaseSelect.Trigger
          ref={setTriggerRef}
          id={id}
          className={cn(
            "flex w-full items-center gap-3 rounded-[1rem] border border-[var(--color-memora-border)] bg-[var(--color-memora-surface)] px-3.5 py-2.5 text-left text-sm text-[var(--color-memora-text)] outline-none transition-[border-color,box-shadow,background-color] duration-300 ease-[var(--ease-out-quart)] hover:bg-[var(--color-memora-hover)] focus-visible:border-[var(--color-memora-olive-soft)] focus-visible:ring-1 focus-visible:ring-[var(--color-memora-olive-soft)] data-[popup-open]:border-[var(--color-memora-olive-soft)]",
            triggerClassName,
          )}
        >
          <BaseSelect.Value className="min-w-0 flex-1 truncate text-left">
            {(selectedValue) =>
              options.find((option) => option.value === selectedValue)?.label ??
              selectedValue ??
              placeholder
            }
          </BaseSelect.Value>
          <BaseSelect.Icon className="shrink-0 text-[var(--color-memora-text-soft)]">
            <CaretDownIcon className="size-4" />
          </BaseSelect.Icon>
        </BaseSelect.Trigger>
        <BaseSelect.Portal container={portalContainer ?? undefined}>
          <BaseSelect.Positioner
            className="z-[70] outline-none"
            alignItemWithTrigger={false}
            positionMethod="fixed"
            side="bottom"
            align="start"
            sideOffset={8}
            collisionPadding={8}
          >
            <BaseSelect.Popup className="select-popup" style={popupStyle}>
              <div className="select-panel">
                <div className="select-shell" />
                <div className="select-body">
                  <BaseSelect.List className="select-list">
                    {options.map((option) => (
                      <BaseSelect.Item
                        key={option.value}
                        value={option.value}
                        disabled={option.disabled}
                        className="select-item data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50"
                      >
                        <BaseSelect.ItemText className="min-w-0 flex-1 truncate text-left">
                          {option.label}
                        </BaseSelect.ItemText>
                        <BaseSelect.ItemIndicator className="select-item-indicator">
                          <CheckIcon className="size-4" weight="bold" />
                        </BaseSelect.ItemIndicator>
                      </BaseSelect.Item>
                    ))}
                  </BaseSelect.List>
                </div>
              </div>
            </BaseSelect.Popup>
          </BaseSelect.Positioner>
        </BaseSelect.Portal>
      </BaseSelect.Root>
    </div>
  );
}
