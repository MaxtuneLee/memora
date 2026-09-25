import { useCallback, useMemo, useRef, useState } from "react";

import { validateWidgetDataWrite, type WriteWidgetDataResult } from "@/lib/widgets/widgetDataFile";

// Chat's unsandboxed preview runtime (ADR 0006) has no Definition/folder yet — the widget hasn't
// been saved — so writeData here stays in memory for the lifetime of this hook instance rather
// than touching OPFS, per ADR 0008. Reuses the same declared-names/size-cap rules the host
// applies after saving, so a widget that passes validation in preview also passes it once saved.
export const usePreviewWidgetData = (
  allowedNames: readonly string[] | undefined,
): {
  value: Record<string, unknown>;
  write: (name: string, content: string) => Promise<WriteWidgetDataResult>;
} => {
  const dataRef = useRef<Record<string, string>>({});
  const [version, setVersion] = useState(0);

  const write = useCallback(
    (name: string, content: string): Promise<WriteWidgetDataResult> => {
      const existingSizesByName = Object.fromEntries(
        Object.entries(dataRef.current).map(([key, existing]) => [key, new Blob([existing]).size]),
      );
      const result = validateWidgetDataWrite({
        name,
        content,
        allowedNames: allowedNames ?? null,
        existingSizesByName,
      });
      if (!result.ok) {
        return Promise.resolve(result);
      }
      dataRef.current = { ...dataRef.current, [name]: content };
      setVersion((current) => current + 1);
      return Promise.resolve({ ok: true });
    },
    [allowedNames],
  );

  const value = useMemo(() => {
    const parsed: Record<string, unknown> = {};
    for (const [name, content] of Object.entries(dataRef.current)) {
      try {
        parsed[name] = JSON.parse(content);
      } catch {
        parsed[name] = content;
      }
    }
    return parsed;
    // dataRef is mutated in place; `version` is the change signal that triggers a recompute.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  return { value, write };
};
