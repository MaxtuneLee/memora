import { useCallback, useRef } from "react";
import { CaretDownIcon, CheckIcon } from "@phosphor-icons/react";
import { Select as BaseSelect } from "@base-ui/react/select";

import { cn } from "@/lib/cn";

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

export function Select({
  id,
  value,
  onValueChange,
  options,
  placeholder,
  triggerClassName,
  ...props
}: SelectProps) {
  const portalContainerRef = useRef<HTMLDialogElement | null>(null);
  const setTriggerRef = useCallback((trigger: HTMLButtonElement | null) => {
    // Native modal dialogs live in the top layer; a body portal cannot cover them.
    portalContainerRef.current = trigger?.closest("dialog") ?? null;
  }, []);

  return (
    <BaseSelect.Root
      value={value}
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
      <BaseSelect.Portal container={portalContainerRef}>
        <BaseSelect.Positioner
          className="z-[70] outline-none"
          alignItemWithTrigger={false}
          positionMethod="fixed"
          side="bottom"
          align="start"
          sideOffset={8}
          collisionPadding={8}
        >
          <BaseSelect.Popup className="min-w-[var(--anchor-width)] overflow-hidden rounded-[1rem] border border-[var(--color-memora-border)] bg-[var(--color-memora-surface)] shadow-[0_20px_48px_-28px_rgba(34,33,29,0.35)] outline-none">
            <BaseSelect.List className="max-h-[min(18rem,calc(var(--available-height)_-_2px))] space-y-0.5 overflow-y-auto overscroll-contain p-1.5">
              {options.map((option) => (
                <BaseSelect.Item
                  key={option.value}
                  value={option.value}
                  disabled={option.disabled}
                  className="flex w-full items-center justify-start gap-3 rounded-[0.75rem] px-3 py-2.5 text-left text-sm text-[var(--color-memora-text-muted)] outline-none transition-colors data-[highlighted]:bg-[var(--color-memora-hover-strong)] data-[selected]:font-semibold data-[selected]:text-[var(--color-memora-text-strong)] data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50"
                >
                  <BaseSelect.ItemText className="min-w-0 flex-1 text-left">
                    {option.label}
                  </BaseSelect.ItemText>
                  <BaseSelect.ItemIndicator className="shrink-0 text-[var(--color-memora-olive)]">
                    <CheckIcon className="size-4" weight="bold" />
                  </BaseSelect.ItemIndicator>
                </BaseSelect.Item>
              ))}
            </BaseSelect.List>
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  );
}
