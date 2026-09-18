import { expect, test } from "vite-plus/test";

import {
  GENERATED_WIDGET_DATA_MESSAGE,
  GENERATED_WIDGET_READY_MESSAGE,
  buildGeneratedWidgetSrcDoc,
  escapeClosingScriptTag,
} from "@/lib/widgets/generatedWidgetRuntime";

test("embeds style, renderable html, and script from the widget source", () => {
  const srcDoc = buildGeneratedWidgetSrcDoc(
    '<style>.a{color:red}</style><div class="a">Hello</div><script>console.log("run");</script>',
  );

  expect(srcDoc).toContain(".a{color:red}");
  expect(srcDoc).toContain('<div class="a">Hello</div>');
  expect(srcDoc).toContain('console.log("run");');
});

test("exposes a postMessage-only bridge, never a direct object handoff", () => {
  const srcDoc = buildGeneratedWidgetSrcDoc("<div>widget</div>");

  expect(srcDoc).toContain("window.MEMORA_HOME_WIDGET");
  expect(srcDoc).toContain("window.addEventListener(\"message\"");
  expect(srcDoc).toContain(GENERATED_WIDGET_DATA_MESSAGE);
  expect(srcDoc).toContain(GENERATED_WIDGET_READY_MESSAGE);
});

test("escapes a closing script tag so it cannot break out of the srcDoc string build", () => {
  expect(escapeClosingScriptTag('const s = "</script>";')).toBe('const s = "<\\/script>";');
  expect(escapeClosingScriptTag("no closing tag here")).toBe("no closing tag here");
});
