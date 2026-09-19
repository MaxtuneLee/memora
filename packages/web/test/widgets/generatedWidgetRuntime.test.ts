import { expect, test } from "vite-plus/test";

import {
  GENERATED_WIDGET_DATA_MESSAGE,
  GENERATED_WIDGET_OPEN_LINK_MESSAGE,
  GENERATED_WIDGET_READY_MESSAGE,
  GENERATED_WIDGET_SEND_PROMPT_MESSAGE,
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
  expect(srcDoc).toContain('window.addEventListener("message"');
  expect(srcDoc).toContain(GENERATED_WIDGET_DATA_MESSAGE);
  expect(srcDoc).toContain(GENERATED_WIDGET_READY_MESSAGE);
});

test("escapes a closing script tag so it cannot break out of the srcDoc string build", () => {
  expect(escapeClosingScriptTag('const s = "</script>";')).toBe('const s = "<\\/script>";');
  expect(escapeClosingScriptTag("no closing tag here")).toBe("no closing tag here");
});

test("exposes sendPrompt and openLink as a postMessage hand-off, matching Chat's widget surface", () => {
  const srcDoc = buildGeneratedWidgetSrcDoc("<div>widget</div>");

  expect(srcDoc).toContain("sendPrompt:");
  expect(srcDoc).toContain("openLink:");
  expect(srcDoc).toContain(GENERATED_WIDGET_SEND_PROMPT_MESSAGE);
  expect(srcDoc).toContain(GENERATED_WIDGET_OPEN_LINK_MESSAGE);
});

test("embeds a script src from every allowlisted CDN", () => {
  const srcDoc = buildGeneratedWidgetSrcDoc(
    '<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js"></script>' +
      '<script src="https://esm.sh/lodash-es"></script>' +
      '<script src="https://cdn.jsdelivr.net/npm/foo"></script>' +
      '<script src="https://unpkg.com/foo"></script>',
  );

  expect(srcDoc).toContain(
    '<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js"></script>',
  );
  expect(srcDoc).toContain('<script src="https://esm.sh/lodash-es"></script>');
  expect(srcDoc).toContain('<script src="https://cdn.jsdelivr.net/npm/foo"></script>');
  expect(srcDoc).toContain('<script src="https://unpkg.com/foo"></script>');
});

test("drops a script src whose origin is outside the CDN allowlist", () => {
  const srcDoc = buildGeneratedWidgetSrcDoc(
    '<script src="https://evil.example.com/malware.js"></script>',
  );

  expect(srcDoc).not.toContain("evil.example.com");
  expect(srcDoc).not.toContain("<script src=");
});

test("drops a non-https script src even on an allowlisted host", () => {
  const srcDoc = buildGeneratedWidgetSrcDoc(
    '<script src="http://cdnjs.cloudflare.com/ajax/libs/foo.js"></script>',
  );

  expect(srcDoc).not.toContain("<script src=");
});

test("only emits the external script tags, not their (empty) content, into the executed user script", () => {
  const srcDoc = buildGeneratedWidgetSrcDoc(
    '<script src="https://esm.sh/foo"></script><script>window.ran = true;</script>',
  );

  expect(srcDoc).toContain("window.ran = true;");
  expect(srcDoc).toContain('<script src="https://esm.sh/foo"></script>');
});
