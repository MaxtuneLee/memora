import { expect, test } from "vite-plus/test";

import { buildRunnerHtml } from "../../plugins/widgetRunnerPlugin";

// Bundles the real runner (a nested Vite build), so this takes a few seconds.
test("builds the runner into one self-contained page with its policy and styles", async () => {
  const html = await buildRunnerHtml(true);

  expect(html).not.toContain("<!--widget-runner-");
  expect(html).toContain("Content-Security-Policy");
  expect(html).toContain("[data-widget-content]");
  expect(html).not.toMatch(/<script[^>]+src=/);
  expect(html).not.toMatch(/<link[^>]+rel="stylesheet"/);
  // The bundled script sits inside one inline <script>: only the theme script and the runner.
  expect(html.match(/<\/script>/g)).toHaveLength(2);
}, 60_000);
