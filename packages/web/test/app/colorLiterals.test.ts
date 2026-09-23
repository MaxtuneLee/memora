import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "vite-plus/test";

// Component colors come from the semantic StyleX tokens in src/styles/stylex.stylex.ts. A file
// may keep fixed color literals only for one of the reasons below. Transparent black or white
// (shadows, scrims) is allowed everywhere. Add to this list only with one of these reasons.
const ALLOWED_FILES: Record<string, string> = {
  // Token sources
  "src/styles/stylex.stylex.ts": "semantic token source: light and dark values",
  "src/styles/widgetBase.css": "generated widget token contract for the iframe document",
  "src/styles/tokens.css": "SVG illustration ramps",
  "src/index.css": "first-frame fallbacks painted before the StyleX theme classes apply",
  "src/lib/theme/documentTheme.ts": "theme-color metadata; browser chrome cannot read variables",
  // Data-visualization ramps
  "src/hooks/settings/useStorageStats.ts": "storage breakdown chart ramp",
  // Source artwork and media
  "src/components/assistant/MemoraMascot.tsx": "mascot artwork",
  "src/components/playground/MascotShowcase.tsx": "mascot artwork frame",
  "src/components/onboarding/OnboardingExperience.tsx": "brand panel artwork",
  "src/components/library/VideoPlayer.tsx": "controls drawn over video frames",
  "src/components/desktop/DocumentFilePreview.tsx": "PDF page background",
  "src/components/playground/DocumentParsing.tsx": "slide canvas for the PPTX viewer",
  "src/lib/playground/documentParsing.ts": "rendered PDF page background",
  "src/lib/playground/imageDocumentPipeline.ts": "rendered document page background",
  "src/components/playground/OcrBenchmark.tsx": "synthetic document image drawn for OCR",
  "src/components/playground/ImageDocumentPipeline.tsx":
    "synthetic document image and layout-label ramp drawn over page images",
};

const COLOR_LITERAL =
  /(?<![&\w-])#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\((?!\$\{)[^)]*\)|["'](?:white|black)["']/gi;
const TRANSPARENT_BLACK_OR_WHITE =
  /^rgba?\(\s*(?:0[\s,]+0[\s,]+0|255[\s,]+255[\s,]+255)\s*[,/]\s*[\d.]+%?\s*\)$/i;

const ROOT = path.resolve(import.meta.dirname, "../..");

const sourceFiles = (): string[] =>
  readdirSync(path.join(ROOT, "src"), { recursive: true, encoding: "utf8" })
    .filter((file) => /\.(tsx?|css)$/.test(file) && !file.endsWith(".d.ts"))
    .map((file) => path.posix.join("src", file.split(path.sep).join("/")));

export const findColorLiterals = (source: string): string[] =>
  [...source.matchAll(COLOR_LITERAL)]
    .map(([match]) => match)
    .filter((match) => !TRANSPARENT_BLACK_OR_WHITE.test(match));

test("finds opaque literals and ignores transparent black, white, and computed colors", () => {
  expect(
    findColorLiterals(
      'a: "#fff", b: "rgb(12 3 4)", c: "white", d: "0 1px 2px rgb(0 0 0 / 5%)", ' +
        'e: "rgba(255,255,255,0.2)", f: `rgb(${r}, ${g}, ${b})`, g: "&#10005;", h: tokens.text',
    ),
  ).toEqual(["#fff", "rgb(12 3 4)", '"white"']);
});

test("component styling has no unapproved color literals", () => {
  const offenders = sourceFiles()
    .filter((file) => !(file in ALLOWED_FILES))
    .flatMap((file) =>
      findColorLiterals(readFileSync(path.join(ROOT, file), "utf8")).map(
        (literal) => `${file}: ${literal}`,
      ),
    );
  expect(offenders).toEqual([]);
});

test("every allowlisted file still exists and still needs its exception", () => {
  const files = new Set(sourceFiles());
  for (const file of Object.keys(ALLOWED_FILES)) {
    expect.soft(files.has(file), file).toBe(true);
    if (files.has(file)) {
      expect
        .soft(findColorLiterals(readFileSync(path.join(ROOT, file), "utf8")).length, file)
        .toBeGreaterThan(0);
    }
  }
});
