import type { ParsedShowWidgetCode } from "@/lib/chat/showWidgetRuntime";

import { getAllowedCdnScriptHref } from "./cdnAllowlist";
import type { WidgetScriptSpec } from "./protocol";

// Allowlisted external scripts first, in document order, then every inline script as one block.
// A widget that loads a library (Chart.js, d3) needs its global set before the inline code that
// uses it, and a plain <script src> used to block parsing, which this keeps.
export const buildWidgetScripts = (parsed: ParsedShowWidgetCode): WidgetScriptSpec[] => {
  const external: WidgetScriptSpec[] = [];
  const inline: string[] = [];
  for (const script of parsed.scripts) {
    if (script.src) {
      const href = getAllowedCdnScriptHref(script.src);
      if (href) {
        external.push({ src: href });
      }
    } else if (script.content.trim()) {
      inline.push(script.content);
    }
  }
  return inline.length > 0 ? [...external, { content: inline.join("\n\n") }] : external;
};

// Identifies one version of a widget's code, so a rerun is a real code change and not a new
// object identity.
export const buildRunSignature = (parsed: ParsedShowWidgetCode): string =>
  [parsed.styleText, parsed.htmlText, parsed.scriptText].join("\u0000");
