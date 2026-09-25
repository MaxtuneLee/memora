import type { ReactElement } from "react";

export type FileKind = "audio" | "doc" | "image" | "video" | "note" | "slides";

// Static, trusted SVG markup. Kept as strings so the same glyphs work for React and for the
// hero's imperatively created flying tiles.
const PATHS: Record<FileKind, string> = {
  audio:
    '<path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />',
  doc: '<path d="M6 3h8l4 4v14H6z M9 12h6M9 16h6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" />',
  image:
    '<rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="2.2" /><path d="m3 16 5-5 4 4 3-3 6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" />',
  video: '<path d="M8 5.5v13l10-6.5z" fill="currentColor" />',
  note: '<path d="M5 4h14v16H5z M8 9h8M8 13h8M8 17h5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" />',
  slides:
    '<rect x="3" y="4" width="18" height="13" rx="2" fill="none" stroke="currentColor" stroke-width="2.2" /><path d="M8 14v-3M12 14V8M16 14v-2M12 17v3" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />',
};

export const glyphMarkup = (kind: FileKind): string =>
  `<svg viewBox="0 0 24 24" aria-hidden="true">${PATHS[kind]}</svg>`;

export function FileChip({
  kind,
  className = "",
}: {
  kind: FileKind;
  className?: string;
}): ReactElement {
  return (
    <span
      className={`ic ${kind} ${className}`}
      dangerouslySetInnerHTML={{ __html: glyphMarkup(kind) }}
    />
  );
}
