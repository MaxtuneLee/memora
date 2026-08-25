import type { ContentParser } from "../types";

const TEXT_EXTENSIONS = [".md", ".markdown", ".txt", ".csv", ".json"];

const splitTextSegments = (text: string) => {
  const segments: Array<{
    kind: "title" | "text";
    text: string;
    headingPath: string[];
    locator: { kind: "text"; startOffset: number; endOffset: number };
    searchable: boolean;
  }> = [];
  const headingPath: string[] = [];
  let offset = 0;
  for (const block of text.split(/\n{2,}/)) {
    const value = block.trim();
    const startOffset = text.indexOf(value, offset);
    const start = startOffset >= 0 ? startOffset : offset;
    offset = start + value.length;
    if (!value) continue;
    const heading = value.match(/^#{1,6}\s+(.+)$/);
    if (heading) {
      const level = value.match(/^#+/)?.[0].length ?? 1;
      headingPath.splice(level - 1);
      headingPath[level - 1] = heading[1].trim();
      segments.push({
        kind: "title",
        text: heading[1].trim(),
        headingPath: headingPath.filter(Boolean),
        locator: { kind: "text", startOffset: start, endOffset: start + value.length },
        searchable: true,
      });
      continue;
    }
    segments.push({
      kind: "text",
      text: value,
      headingPath: headingPath.filter(Boolean),
      locator: { kind: "text", startOffset: start, endOffset: start + value.length },
      searchable: true,
    });
  }
  return segments;
};

export const textContentParser: ContentParser = {
  name: "text",
  version: "text-v1",
  supports: (file) => {
    const name = file.name.toLowerCase();
    return (
      file.type.startsWith("text/") || TEXT_EXTENSIONS.some((extension) => name.endsWith(extension))
    );
  },
  parse: async ({ file }) => {
    const markdown = await file.text();
    return {
      title: file.name.replace(/\.[^.]+$/, ""),
      markdown,
      plainText: markdown.replace(/[*_`#>-]/g, " "),
      segments: splitTextSegments(markdown),
    };
  },
};
