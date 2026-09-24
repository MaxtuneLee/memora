import { expect, test } from "vite-plus/test";

import {
  GENERATED_WIDGET_DATA_MESSAGE,
  GENERATED_WIDGET_ERROR_MESSAGE,
  GENERATED_WIDGET_OPEN_LINK_MESSAGE,
  GENERATED_WIDGET_READY_MESSAGE,
  GENERATED_WIDGET_SEND_PROMPT_MESSAGE,
  GENERATED_WIDGET_THEME_MESSAGE,
  GENERATED_WIDGET_WRITE_DATA_MESSAGE,
  GENERATED_WIDGET_WRITE_DATA_RESULT_MESSAGE,
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

test("places generated widget controls inside the base-style scope", () => {
  const srcDoc = buildGeneratedWidgetSrcDoc("<button>Run</button><textarea>Notes</textarea>");

  expect(srcDoc).toContain('<div id="widget-root" data-widget-content>');
});

test("exposes a postMessage-only bridge, never a direct object handoff", () => {
  const srcDoc = buildGeneratedWidgetSrcDoc("<div>widget</div>");

  expect(srcDoc).toContain("window.MEMORA_HOME_WIDGET");
  expect(srcDoc).toContain('window.addEventListener("message"');
  expect(srcDoc).toContain(GENERATED_WIDGET_DATA_MESSAGE);
  expect(srcDoc).toContain(GENERATED_WIDGET_READY_MESSAGE);
});

test("reports script and data-listener failures to the host", () => {
  const srcDoc = buildGeneratedWidgetSrcDoc(
    '<div>widget</div><script>throw new Error("boom");</script>',
  );

  expect(srcDoc).toContain(GENERATED_WIDGET_ERROR_MESSAGE);
  expect(srcDoc).toContain('throw new Error("boom");');
  expect(srcDoc).toContain("reportError();");
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

test("exposes writeData as a postMessage hand-off, matching the host-mediated write channel", () => {
  const srcDoc = buildGeneratedWidgetSrcDoc("<div>widget</div>");

  expect(srcDoc).toContain("writeData:");
  expect(srcDoc).toContain(GENERATED_WIDGET_WRITE_DATA_MESSAGE);
  expect(srcDoc).toContain(GENERATED_WIDGET_WRITE_DATA_RESULT_MESSAGE);
});

test("only emits the external script tags, not their (empty) content, into the executed user script", () => {
  const srcDoc = buildGeneratedWidgetSrcDoc(
    '<script src="https://esm.sh/foo"></script><script>window.ran = true;</script>',
  );

  expect(srcDoc).toContain("window.ran = true;");
  expect(srcDoc).toContain('<script src="https://esm.sh/foo"></script>');
});

test("starts the widget document in the host's resolved theme", () => {
  expect(buildGeneratedWidgetSrcDoc("<div>widget</div>")).toContain(
    '<html data-theme="light" style="color-scheme: light">',
  );
  expect(buildGeneratedWidgetSrcDoc("<div>widget</div>", "dark")).toContain(
    '<html data-theme="dark" style="color-scheme: dark">',
  );
});

test("listens for host theme updates next to the data and write channels", () => {
  const srcDoc = buildGeneratedWidgetSrcDoc("<div>widget</div>");

  expect(srcDoc).toContain(GENERATED_WIDGET_THEME_MESSAGE);
  expect(srcDoc).toContain("event.source !== window.parent");
  expect(srcDoc).toContain('nextTheme === "light" || nextTheme === "dark"');
});
