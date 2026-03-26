import { CheckIcon, CaretUpDownIcon } from "@phosphor-icons/react";
import { Field } from "@base-ui/react/field";
import { Select } from "@base-ui/react/select";

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

export function LanguageSelector({ language, setLanguage }: LanguageSelectorProps) {
  return (
    <Field.Root className="flex items-center gap-2 justify-between">
      <Field.Label className="text-sm text-zinc-600" render={<div />}>
        Language
      </Field.Label>
      <Select.Root
        value={language}
        onValueChange={(value) => setLanguage(String(value))}
        items={languageItems}
      >
        <Select.Trigger className="flex items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-900 outline-none transition-all focus-visible:ring-2 focus-visible:ring-zinc-400 data-[popup-open]:border-zinc-300">
          <Select.Value className="flex-1 text-left" />
          <Select.Icon className="text-zinc-400 data-popup-open:text-zinc-600">
            <CaretUpDownIcon className="size-4" />
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Backdrop className="fixed inset-0 bg-black/10 data-open:animate-in data-closed:animate-out" />
          <Select.Positioner className="z-50 outline-none" sideOffset={8}>
            <Select.Popup className="w-(--anchor-width) rounded-lg border border-zinc-200 bg-white p-1 shadow-lg data-starting-style:opacity-0 data-starting-style:translate-y-1 data-[ending-style]:opacity-0 data-[ending-style]:translate-y-1">
              <Select.List className="max-h-64 overflow-y-auto">
                {LANGUAGES.map((lang) => (
                  <Select.Item
                    key={lang.code}
                    value={lang.code}
                    className="flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-sm text-zinc-700 outline-none transition-colors data-highlighted:bg-zinc-100 data-[highlighted]:text-zinc-900 data-[selected]:bg-zinc-900 data-[selected]:text-white"
                  >
                    <Select.ItemText>{lang.name}</Select.ItemText>
                    <Select.ItemIndicator>
                      <CheckIcon className="size-4" weight="bold" />
                    </Select.ItemIndicator>
                  </Select.Item>
                ))}
              </Select.List>
            </Select.Popup>
          </Select.Positioner>
        </Select.Portal>
      </Select.Root>
    </Field.Root>
  );
}
