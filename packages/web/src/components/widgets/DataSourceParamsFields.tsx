import type { JSX } from "react";
import * as stylex from "@stylexjs/stylex";

import type { DataSourceCatalogEntry } from "@/lib/widgets/dataSourceCatalog";
import { tokens } from "../../styles/stylex.stylex";

const styles = stylex.create({
  field: { display: "flex", flexDirection: "column", gap: 8 },
  label: { color: tokens.text, fontSize: 14, fontWeight: 600 },
  input: {
    backgroundColor: tokens.surfaceSoft,
    border: `1px solid ${tokens.border}`,
    borderRadius: 10,
    color: tokens.text,
    fontSize: 14,
    minHeight: 40,
    paddingBlock: 8,
    paddingInline: 10,
    ":focus-visible": { outline: `2px solid ${tokens.oliveSoft}`, outlineOffset: 2 },
  },
});

interface DataSourceParamsFieldsProps {
  entry: DataSourceCatalogEntry | undefined;
  values: Record<string, string>;
  idPrefix: string;
  onChange: (key: string, value: string) => void;
}

export function DataSourceParamsFields({
  entry,
  values,
  idPrefix,
  onChange,
}: DataSourceParamsFieldsProps): JSX.Element | null {
  if (!entry?.params?.length) {
    return null;
  }

  return (
    <>
      {entry.params.map((field) => {
        const fieldId = `${idPrefix}-${field.key}`;
        return (
          <div key={field.key} {...stylex.props(styles.field)}>
            <label htmlFor={fieldId} {...stylex.props(styles.label)}>
              {field.label}
            </label>
            <input
              id={fieldId}
              type="number"
              min={field.min}
              step={field.step ?? 1}
              inputMode="numeric"
              value={values[field.key] ?? ""}
              onChange={(event) => onChange(field.key, event.target.value)}
              {...stylex.props(styles.input)}
            />
          </div>
        );
      })}
    </>
  );
}
