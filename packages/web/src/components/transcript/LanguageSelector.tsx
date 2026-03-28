import { CheckIcon, CaretUpDownIcon } from "@phosphor-icons/react";
import { Field } from "@base-ui/react/field";
import { Select } from "@base-ui/react/select";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

import "./languageSelector.css";

const LANGUAGES = [
  { code: "en", name: "English" },
  { code: "zh", name: "Chinese" },
  { code: "es", name: "Spanish" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "ja", name: "Japanese" },
  { code: "ko", name: "Korean" },
  { code: "ru", name: "Russian" },
  { code: "ar", name: "Arabic" },
  { code: "pt", name: "Portuguese" },
];

const languageItems = LANGUAGES.map((language) => ({
  value: language.code,
  label: language.name,
}));

interface LanguageSelectorProps {
  language: string;
  setLanguage: (language: string) => void;
}

interface LanguageSelectorLayout {
  openHeight: number;
  openWidth: number;
  triggerHeight: number;
  triggerWidth: number;
}

type LanguageSelectorPopupStyle = CSSProperties & {
  "--language-selector-open-height"?: string;
  "--language-selector-open-width"?: string;
  "--language-selector-trigger-height"?: string;
  "--language-selector-trigger-width"?: string;
};

const INITIAL_LAYOUT: LanguageSelectorLayout = {
  openHeight: 304,
  openWidth: 224,
  triggerHeight: 38,
  triggerWidth: 172,
};

export function LanguageSelector({ language, setLanguage }: LanguageSelectorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const measureRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [layout, setLayout] = useState<LanguageSelectorLayout>(INITIAL_LAYOUT);
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
    setPortalContainer(containerRef.current?.closest("[popover]") as HTMLElement | null);
  }, []);

  useLayoutEffect(() => {
    syncLayout();
  }, [language, syncLayout]);

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

  const handleOpenChange = useCallback(
    (open: boolean) => {
      syncLayout();
      setIsOpen(open);
    },
    [syncLayout],
  );

  const popupStyle: LanguageSelectorPopupStyle = {
    "--language-selector-open-height": `${layout.openHeight}px`,
    "--language-selector-open-width": `${layout.openWidth}px`,
    "--language-selector-trigger-height": `${layout.triggerHeight}px`,
    "--language-selector-trigger-width": `${layout.triggerWidth}px`,
    width: `${layout.openWidth}px`,
  };

  return (
    <div ref={containerRef} data-surface="language-selector">
      <div
        ref={measureRef}
        aria-hidden="true"
        data-language-selector-measure=""
        className="language-selector-measure"
        style={{ minWidth: `${layout.triggerWidth}px` }}
      >
        <div className="language-selector-panel language-selector-panel--measure">
          <div className="language-selector-body language-selector-body--measure">
            <div className="language-selector-list">
              {LANGUAGES.map((lang) => {
                const isSelected = lang.code === language;

                return (
                  <div
                    key={lang.code}
                    data-selected={isSelected ? "" : undefined}
                    className="language-selector-item"
                  >
                    <span>{lang.name}</span>
                    <span className="language-selector-item-indicator" aria-hidden="true">
                      <CheckIcon className="size-4" weight="bold" />
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      <Field.Root className="flex items-center gap-2 justify-between">
        <Field.Label className="text-sm text-zinc-600" render={<div />}>
          Language
        </Field.Label>
        <Select.Root
          modal={false}
          value={language}
          open={isOpen}
          onOpenChange={handleOpenChange}
          onValueChange={(value) => setLanguage(String(value))}
          items={languageItems}
        >
          <Select.Trigger
            ref={triggerRef}
            data-language-selector-trigger=""
            className="language-selector-trigger flex items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-900 outline-none transition-all focus-visible:ring-2 focus-visible:ring-zinc-400 data-[popup-open]:border-zinc-300"
          >
            <Select.Value className="flex-1 text-left" />
            <Select.Icon className="text-zinc-400 data-popup-open:text-zinc-600">
              <CaretUpDownIcon className="size-4" />
            </Select.Icon>
          </Select.Trigger>
          <Select.Portal container={portalContainer ?? undefined}>
            <Select.Positioner
              className="z-[60] outline-none"
              sideOffset={8}
              align="end"
              alignItemWithTrigger={false}
            >
              <Select.Popup className="language-selector-popup" style={popupStyle}>
                <div className="language-selector-panel">
                  <div className="language-selector-shell" />
                  <div className="language-selector-body">
                    <Select.List className="language-selector-list">
                      {LANGUAGES.map((lang) => (
                        <Select.Item
                          key={lang.code}
                          value={lang.code}
                          className="language-selector-item"
                        >
                          <Select.ItemText>{lang.name}</Select.ItemText>
                          <Select.ItemIndicator className="language-selector-item-indicator">
                            <CheckIcon className="size-4" weight="bold" />
                          </Select.ItemIndicator>
                        </Select.Item>
                      ))}
                    </Select.List>
                  </div>
                </div>
              </Select.Popup>
            </Select.Positioner>
          </Select.Portal>
        </Select.Root>
      </Field.Root>
    </div>
  );
}
