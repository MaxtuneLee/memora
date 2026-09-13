import { Field } from "@base-ui/react/field";

import { Select } from "@/components/ui/Select";

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

const AUTO_DETECT_LANGUAGE = { code: "auto", name: "Auto-detect" };

interface LanguageSelectorProps {
  language: string;
  setLanguage: (language: string) => void;
  /** Only Nemotron actually auto-detects language; other models need an explicit code. */
  includeAutoDetect?: boolean;
}

export function LanguageSelector({
  language,
  setLanguage,
  includeAutoDetect = false,
}: LanguageSelectorProps) {
  const languages = includeAutoDetect ? [AUTO_DETECT_LANGUAGE, ...LANGUAGES] : LANGUAGES;
  const options = languages.map((entry) => ({ value: entry.code, label: entry.name }));

  return (
    <Field.Root className="flex items-center gap-2 justify-between">
      <Field.Label className="text-sm text-zinc-600" render={<div />}>
        Language
      </Field.Label>
      <Select
        value={language}
        onValueChange={(value) => value && setLanguage(value)}
        options={options}
        triggerClassName="w-auto"
      />
    </Field.Root>
  );
}
