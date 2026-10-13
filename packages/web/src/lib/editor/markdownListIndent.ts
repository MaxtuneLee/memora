// The Lexical list transformers nest items per 4 spaces of indentation. Markdown written with 2 or
// 3 space nesting (common with Prettier and ordered lists) would otherwise lose its nesting, so
// the WYSIWYG import rewrites nested list items to 4-space steps and the export writes them back
// with the document's own step.

export const LEXICAL_LIST_INDENT_WIDTH = 4;

const LIST_ITEM_REGEXP = /^( *)(?:[-*+]|\d{1,9}[.)])(?:[ \t]|$)/;
const FENCE_REGEXP = /^ {0,3}(`{3,}|~{3,})/;

interface ListIndentNormalization {
  indentWidth: number;
  markdown: string;
}

const forEachLineOutsideFences = (markdown: string, visit: (line: string) => string): string => {
  let openFence: string | null = null;

  return markdown
    .split("\n")
    .map((line) => {
      const fence = line.match(FENCE_REGEXP)?.[1];
      if (openFence) {
        if (fence && fence[0] === openFence[0] && fence.length >= openFence.length) {
          openFence = null;
        }
        return line;
      }
      if (fence) {
        openFence = fence;
        return line;
      }
      return visit(line);
    })
    .join("\n");
};

export const normalizeMarkdownListIndent = (markdown: string): ListIndentNormalization => {
  let indentWidth: number | null = null;
  // Indentation of the list items that are open at each depth.
  let levels: number[] = [];

  const normalized = forEachLineOutsideFences(markdown, (line) => {
    const match = line.match(LIST_ITEM_REGEXP);
    if (!match) {
      if (line.trim() !== "" && !/^\s/.test(line)) {
        levels = [];
      }
      return line;
    }

    const indent = match[1]?.length ?? 0;
    if (levels.length === 0) {
      // An indented item without an open list is not nested; leave it untouched.
      if (indent > 0) {
        return line;
      }
      levels = [0];
      return line;
    }

    while (levels.length > 1 && (levels.at(-1) ?? 0) > indent) {
      levels.pop();
    }
    if (indent > (levels.at(-1) ?? 0)) {
      indentWidth ??= indent - (levels.at(-1) ?? 0);
      levels.push(indent);
    }

    const depth = levels.length - 1;
    return `${" ".repeat(depth * LEXICAL_LIST_INDENT_WIDTH)}${line.slice(indent)}`;
  });

  return {
    indentWidth: indentWidth ?? LEXICAL_LIST_INDENT_WIDTH,
    markdown: normalized,
  };
};

export const restoreMarkdownListIndent = (markdown: string, indentWidth: number): string => {
  if (indentWidth === LEXICAL_LIST_INDENT_WIDTH || indentWidth < 1) {
    return markdown;
  }

  return forEachLineOutsideFences(markdown, (line) => {
    const indent = line.match(LIST_ITEM_REGEXP)?.[1]?.length ?? 0;
    if (indent === 0 || indent % LEXICAL_LIST_INDENT_WIDTH !== 0) {
      return line;
    }

    const depth = indent / LEXICAL_LIST_INDENT_WIDTH;
    return `${" ".repeat(depth * indentWidth)}${line.slice(indent)}`;
  });
};
