import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vite-plus/test";

import { LanguageSelector } from "../../src/components/transcript/LanguageSelector";

test("renders a dedicated morph surface around the language select trigger", () => {
  const html = renderToStaticMarkup(<LanguageSelector language="en" setLanguage={() => {}} />);

  expect(html).toContain('data-surface="language-selector"');
  expect(html).toContain('data-language-selector-trigger=""');
  expect(html).toContain('data-language-selector-measure=""');
});

test("defines dashboard-style morph transitions for the language selector popup", () => {
  const source = readFileSync(
    new URL("../../src/components/transcript/LanguageSelector.tsx", import.meta.url),
    "utf8",
  );
  const css = readFileSync(
    new URL("../../src/components/transcript/languageSelector.css", import.meta.url),
    "utf8",
  );

  expect(source).toContain("languageSelector.css");
  expect(css).toContain("clip-path");
  expect(css).toContain("@starting-style");
  expect(css).toContain("[data-ending-style]");
});

test("uses warm active-row styling and popup-level exit transitions", () => {
  const css = readFileSync(
    new URL("../../src/components/transcript/languageSelector.css", import.meta.url),
    "utf8",
  );

  expect(css).toContain(".language-selector-item[data-selected]");
  expect(css).toContain(".language-selector-popup[data-ending-style] {");
});

test("measures an expanded popup width independently from the capsule trigger", () => {
  const source = readFileSync(
    new URL("../../src/components/transcript/LanguageSelector.tsx", import.meta.url),
    "utf8",
  );
  const css = readFileSync(
    new URL("../../src/components/transcript/languageSelector.css", import.meta.url),
    "utf8",
  );

  expect(source).toContain("openWidth");
  expect(css).toContain("--language-selector-open-width");
  expect(css).toContain("--language-selector-trigger-width");
});

test("anchors the expanded popup and morph animation to the right edge", () => {
  const source = readFileSync(
    new URL("../../src/components/transcript/LanguageSelector.tsx", import.meta.url),
    "utf8",
  );
  const css = readFileSync(
    new URL("../../src/components/transcript/languageSelector.css", import.meta.url),
    "utf8",
  );

  expect(source).toContain('align="end"');
  expect(source).toContain("alignItemWithTrigger={false}");
  expect(css).toContain("transform-origin: top right");
});

test("uses compact menu sizing so the open surface can stay close to trigger width", () => {
  const css = readFileSync(
    new URL("../../src/components/transcript/languageSelector.css", import.meta.url),
    "utf8",
  );

  expect(css).toContain("padding: 0.25rem");
  expect(css).toContain("min-height: 2.375rem");
  expect(css).toContain("font-size: 0.875rem");
  expect(css).toContain("width: 1.5rem");
});
