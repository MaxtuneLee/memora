import { useEffect, useState } from "react";
import { file as opfsFile } from "@memora/fs";

import { activeFilesQuery$ } from "@/lib/library/queries";
import type { ReactiveWidgetStore } from "@/lib/widgets/widgetStore";
import type { file as LiveStoreFile } from "@/livestore/file";

export type WidgetSourceCodeStatus = "loading" | "ready" | "missing" | "error";

export interface WidgetSourceCodeState {
  status: WidgetSourceCodeStatus;
  code: string | null;
}

const LOADING_STATE: WidgetSourceCodeState = { status: "loading", code: null };
const MISSING_STATE: WidgetSourceCodeState = { status: "missing", code: null };

// Reads a generated Widget Definition's widget.html from OPFS and re-reads it whenever the
// backing file row's updatedAt changes, so editing widget.html in the text editor (or via the
// chat modify_text_file tool) updates every placed Instance without re-placing it.
export const useWidgetSourceCode = (
  store: ReactiveWidgetStore,
  sourceFileId: string | null | undefined,
): WidgetSourceCodeState => {
  const files = store.useQuery(activeFilesQuery$) as readonly LiveStoreFile[];
  const sourceFile = sourceFileId ? (files.find((file) => file.id === sourceFileId) ?? null) : null;
  const storagePath = sourceFile?.storagePath ?? null;
  const updatedAtMs = sourceFile?.updatedAt instanceof Date ? sourceFile.updatedAt.getTime() : null;

  const [state, setState] = useState<WidgetSourceCodeState>(
    sourceFileId ? LOADING_STATE : MISSING_STATE,
  );

  useEffect(() => {
    if (!storagePath) {
      setState(MISSING_STATE);
      return;
    }

    let cancelled = false;
    setState((previous) => ({ status: "loading", code: previous.code }));

    void opfsFile(storagePath)
      .text()
      .then((text) => {
        if (!cancelled) {
          setState({ status: "ready", code: text });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState({ status: "error", code: null });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [storagePath, updatedAtMs]);

  return state;
};
