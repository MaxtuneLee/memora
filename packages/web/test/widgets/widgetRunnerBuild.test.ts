import { expect, test } from "vite-plus/test";

import { buildRunnerHtml } from "../../plugins/widgetRunnerPlugin";

// Bundles the real runner (a nested Vite build), so this takes a few seconds.
test("builds the runner into one self-contained page with its policy and styles", async () => {
  const html = await buildRunnerHtml(true);

  expect(html).not.toContain("<!--widget-runner-");
  expect(html).toContain("Content-Security-Policy");
  expect(html).toContain("[data-widget-content]");
  expect(html).not.toMatch(/<script[^>]+src=/);
  expect(html.match(/<link[^>]+rel="stylesheet"/g)).toHaveLength(1);
  // The web fonts load without holding back the runner script.
  expect(html).not.toContain("@import");
  expect(html).toMatch(
    /<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*media="print"/,
  );
  // The bundled script sits inside one inline <script>: only the theme script and the runner.
  expect(html.match(/<\/script>/g)).toHaveLength(2);
}, 60_000);
