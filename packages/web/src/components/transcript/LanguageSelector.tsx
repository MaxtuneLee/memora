import { Field } from "@base-ui/react/field";
import * as stylex from "@stylexjs/stylex";

import { Select } from "@/components/ui/Select";

const styles = stylex.create({
  root: { alignItems: "center", display: "flex", gap: 8, justifyContent: "space-between" },
  label: { color: "#52525b", fontSize: 14 },
  autoWidth: { width: "auto" },
});

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
    <Field.Root className={stylex.props(styles.root).className}>
      <Field.Label className={stylex.props(styles.label).className} render={<div />}>
        Language
      </Field.Label>
      <Select
        value={language}
        onValueChange={(value) => value && setLanguage(value)}
        options={options}
        triggerClassName={stylex.props(styles.autoWidth).className}
      />
    </Field.Root>
  );
}
