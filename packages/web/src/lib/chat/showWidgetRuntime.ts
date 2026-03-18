export interface ParsedShowWidgetCode {
  styleText: string;
  hasStyle: boolean;
  styleReady: boolean;
  htmlText: string;
  htmlRenderable: string;
  scriptText: string;
  hasScript: boolean;
  scriptReady: boolean;
}

const findTagStart = (
  source: string,
  tagName: string,
  fromIndex = 0,
): number => {
  return source.toLowerCase().indexOf(`<${tagName}`, fromIndex);
};

const findTagEnd = (source: string, fromIndex: number): number => {
  return source.indexOf(">", fromIndex);
};

const findClosingTagRange = (
  source: string,
  tagName: string,
  fromIndex: number,
): { start: number; end: number } | null => {
  const lowerSource = source.toLowerCase();
  const lowerTagName = tagName.toLowerCase();
  const closingPrefix = `</${lowerTagName}`;
  let searchIndex = fromIndex;

  while (searchIndex < source.length) {
    const closeStart = lowerSource.indexOf(closingPrefix, searchIndex);
    if (closeStart === -1) {
      return null;
    }

    let cursor = closeStart + closingPrefix.length;
    const boundary = source[cursor];
    if (boundary && !/\s|>/.test(boundary)) {
      searchIndex = closeStart + 1;
      continue;
    }

    while (/\s/.test(source[cursor] ?? "")) {
      cursor += 1;
    }

    if (source[cursor] === ">") {
      return {
        start: closeStart,
        end: cursor + 1,
      };
    }

    searchIndex = closeStart + 1;
  }

  return null;
};

const VOID_HTML_TAGS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

const getSafeHtmlPrefix = (html: string): string => {
  let state: "text" | "tag" | "comment" = "text";
  let quote: '"' | "'" | null = null;
  let lastSafeIndex = 0;

  for (let index = 0; index < html.length; index += 1) {
    if (state === "text") {
      if (html.startsWith("<!--", index)) {
        state = "comment";
        index += 3;
        continue;
      }

      if (html[index] === "<") {
        state = "tag";
        continue;
      }

      lastSafeIndex = index + 1;
      continue;
    }

    if (state === "comment") {
      if (html.startsWith("-->", index)) {
        state = "text";
        index += 2;
        lastSafeIndex = index + 1;
      }
      continue;
    }

    if (quote) {
      if (html[index] === quote && html[index - 1] !== "\\") {
        quote = null;
      }
      continue;
    }

    if (html[index] === '"' || html[index] === "'") {
      quote = html[index] as '"' | "'";
      continue;
    }

    if (html[index] === ">") {
      state = "text";
      lastSafeIndex = index + 1;
    }
  }

  return state === "text" ? html : html.slice(0, lastSafeIndex);
};

const findHtmlTagEnd = (html: string, fromIndex: number): number => {
  let quote: '"' | "'" | null = null;

  for (let index = fromIndex; index < html.length; index += 1) {
    if (quote) {
      if (html[index] === quote && html[index - 1] !== "\\") {
        quote = null;
      }
      continue;
    }

    if (html[index] === '"' || html[index] === "'") {
      quote = html[index] as '"' | "'";
      continue;
    }

    if (html[index] === ">") {
      return index;
    }
  }

  return -1;
};

const getRenderableHtml = (html: string): string => {
  const safeHtml = getSafeHtmlPrefix(html);
  if (!safeHtml) {
    return safeHtml;
  }

  const openTags: string[] = [];

  for (let index = 0; index < safeHtml.length; index += 1) {
    if (safeHtml.startsWith("<!--", index)) {
      const commentClose = safeHtml.indexOf("-->", index + 4);
      if (commentClose === -1) {
        break;
      }
      index = commentClose + 2;
      continue;
    }

    if (safeHtml[index] !== "<") {
      continue;
    }

    const nextChar = safeHtml[index + 1];
    if (!nextChar) {
      break;
    }

    if (nextChar === "!" || nextChar === "?") {
      const tagEnd = findHtmlTagEnd(safeHtml, index + 1);
      if (tagEnd === -1) {
        break;
      }
      index = tagEnd;
      continue;
    }

    let cursor = index + 1;
    let isClosingTag = false;

    if (safeHtml[cursor] === "/") {
      isClosingTag = true;
      cursor += 1;
    }

    while (/\s/.test(safeHtml[cursor] ?? "")) {
      cursor += 1;
    }

    const nameStart = cursor;
    while (/[A-Za-z0-9:-]/.test(safeHtml[cursor] ?? "")) {
      cursor += 1;
    }

    if (cursor === nameStart) {
      continue;
    }

    const tagName = safeHtml.slice(nameStart, cursor).toLowerCase();
    const tagEnd = findHtmlTagEnd(safeHtml, cursor);
    if (tagEnd === -1) {
      break;
    }

    const rawTag = safeHtml.slice(index, tagEnd + 1);
    const isSelfClosingTag =
      !isClosingTag &&
      (VOID_HTML_TAGS.has(tagName) || /\/\s*>$/.test(rawTag));

    if (isClosingTag) {
      const openIndex = openTags.lastIndexOf(tagName);
      if (openIndex !== -1) {
        openTags.splice(openIndex);
      }
    } else if (!isSelfClosingTag) {
      openTags.push(tagName);
    }

    index = tagEnd;
  }

  if (openTags.length === 0) {
    return safeHtml;
  }

  return `${safeHtml}${[...openTags].reverse().map((tagName) => `</${tagName}>`).join("")}`;
};

export const parseShowWidgetCode = (
  widgetCode: string,
): ParsedShowWidgetCode => {
  const source = widgetCode ?? "";
  let cursor = 0;
  let styleText = "";
  let hasStyle = false;
  let styleReady = true;
  let scriptText = "";
  let scriptReady = false;
  let hasScript = false;

  const styleStart = findTagStart(source, "style");
  if (styleStart !== -1) {
    hasStyle = true;
    styleReady = false;
    const styleOpenEnd = findTagEnd(source, styleStart);
    if (styleOpenEnd !== -1) {
      const styleClose = findClosingTagRange(source, "style", styleOpenEnd + 1);
      if (styleClose) {
        styleText = source.slice(styleOpenEnd + 1, styleClose.start);
        cursor = styleClose.end;
        styleReady = true;
      } else {
        styleText = source.slice(styleOpenEnd + 1);
        cursor = source.length;
      }
    } else {
      cursor = styleStart;
    }
  }

  let htmlEnd = source.length;
  const scriptStart = findTagStart(source, "script", cursor);
  if (scriptStart !== -1) {
    hasScript = true;
    htmlEnd = scriptStart;

    const scriptOpenEnd = findTagEnd(source, scriptStart);
    if (scriptOpenEnd !== -1) {
      const scriptClose = findClosingTagRange(source, "script", scriptOpenEnd + 1);
      if (scriptClose) {
        scriptText = source.slice(scriptOpenEnd + 1, scriptClose.start);
        scriptReady = true;
      } else {
        scriptText = source.slice(scriptOpenEnd + 1);
      }
    }
  } else {
    scriptReady = true;
  }

  const htmlText = source.slice(cursor, htmlEnd);
  const htmlRenderable = getRenderableHtml(htmlText);

  return {
    styleText,
    hasStyle,
    styleReady,
    htmlText,
    htmlRenderable,
    scriptText,
    hasScript,
    scriptReady,
  };
};
