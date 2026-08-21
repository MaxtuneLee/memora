import { expect, test } from "vite-plus/test";

import {
  createMarkdownSafetyDiagnostics,
  isMarkdownRoundTripSafe,
  normalizeMarkdownRoundTripText,
  preflightMarkdownForWysiwyg,
} from "@/lib/editor/markdownRoundTripGuard";

test("normalizes crlf and bare cr input, then strips one trailing newline", () => {
  expect(normalizeMarkdownRoundTripText("line 1\r\nline 2\r\n")).toBe("line 1\nline 2");
  expect(normalizeMarkdownRoundTripText("a\rb\r")).toBe("a\nb");
  expect(normalizeMarkdownRoundTripText("line 1\nline 2\n")).toBe("line 1\nline 2");
  expect(normalizeMarkdownRoundTripText("line 1\nline 2\n\n")).toBe("line 1\nline 2\n");
});

test("accepts identical trailing newlines but not adding or removing multiple newlines", () => {
  expect(isMarkdownRoundTripSafe("line 1\r\nline 2\r\n", "line 1\nline 2\n")).toBe(true);
  expect(isMarkdownRoundTripSafe("a\n\n", "a\n\n")).toBe(true);
  expect(isMarkdownRoundTripSafe("line 1\nline 2\n\n", "line 1\nline 2\n")).toBe(false);
  expect(isMarkdownRoundTripSafe("a", "a\n\n")).toBe(false);
  expect(isMarkdownRoundTripSafe("a\n\n", "a")).toBe(false);
});

test("rejects whitespace, marker, and content changes", () => {
  expect(isMarkdownRoundTripSafe("a ", "a")).toBe(false);
  expect(isMarkdownRoundTripSafe("*a*", "_a_")).toBe(false);
  expect(isMarkdownRoundTripSafe("a", "b")).toBe(false);
});

test("preflights safe markdown with the production wysiwyg registry", () => {
  expect(preflightMarkdownForWysiwyg("# Safe\n")).toEqual({
    roundTrippedText: "# Safe",
    safe: true,
  });
});

test("preflights scientific Markdown with single-dollar TeX formulas", () => {
  const markdown =
    "The `i`-th subchannel has gain $\\lambda_i$ and allocated power $p_i$.\n\n" +
    "In the assignment notation, $\\gamma_i = P_t \\alpha_i$ and $1/\\gamma_0 = \\nu / P_t$.\n\n" +
    "For the rank-one case, $rank(H_{eq})=1$ with $\\lambda_{eq,2} = 0$.";

  expect(preflightMarkdownForWysiwyg(markdown)).toEqual({
    roundTrippedText: markdown,
    safe: true,
  });
});

test("rejects markdown changed by the production import and export", () => {
  const markdown = '<a href="https://example.com">link</a>';
  expect(preflightMarkdownForWysiwyg(markdown)).toEqual({
    diagnostics: [
      {
        column: 1,
        from: 0,
        line: 1,
        message:
          'Line 1: "<a href=\\\"https://example.com\\\">link</a>" would become "[link](https://example.com)".',
        replacementText: "[link](https://example.com)",
        sourceText: markdown,
        to: markdown.length,
      },
    ],
    reason: "content-changed",
    roundTrippedText: "[link](https://example.com)",
    safe: false,
  });
});

test("returns a conversion error when preflight conversion throws", () => {
  expect(
    preflightMarkdownForWysiwyg("# Safe", () => {
      throw new Error("conversion failed");
    }),
  ).toEqual({
    reason: "conversion-error",
    safe: false,
  });
});

test("locates a checklist marker normalized by the production converter", () => {
  expect(preflightMarkdownForWysiwyg("- [] item")).toEqual({
    reason: "content-changed",
    roundTrippedText: "- [ ] item",
    safe: false,
    diagnostics: [
      {
        column: 3,
        from: 2,
        line: 1,
        message: 'Line 1: "[]" would become "[ ]".',
        replacementText: "[ ]",
        sourceText: "[]",
        to: 4,
      },
    ],
  });
});

test("locates replacements and deletions in original source offsets", () => {
  expect(createMarkdownSafetyDiagnostics("alpha\n*item*\nomega", "alpha\n_item_\nomega")).toEqual([
    {
      column: 1,
      from: 6,
      line: 2,
      message: 'Line 2: "*item*" would become "_item_".',
      replacementText: "_item_",
      sourceText: "*item*",
      to: 12,
    },
  ]);
  expect(createMarkdownSafetyDiagnostics("alpha  beta", "alpha beta")).toEqual([
    {
      column: 7,
      from: 6,
      line: 1,
      message: 'Line 1: " " would be removed.',
      replacementText: "",
      sourceText: " ",
      to: 7,
    },
  ]);
});

test("returns separate diagnostics for non-adjacent changed lines", () => {
  const diagnostics = createMarkdownSafetyDiagnostics(
    "title\n*one*\nmiddle\n- [] two\nend",
    "title\n_one_\nmiddle\n- [ ] two\nend",
  );

  expect(diagnostics).toHaveLength(2);
  expect(
    diagnostics.map(({ line, sourceText, replacementText }) => ({
      line,
      replacementText,
      sourceText,
    })),
  ).toEqual([
    { line: 2, replacementText: "_one_", sourceText: "*one*" },
    { line: 4, replacementText: "[ ]", sourceText: "[]" },
  ]);
});

test("describes inserted lines without claiming the adjacent source character changed", () => {
  expect(createMarkdownSafetyDiagnostics("alpha\nomega", "alpha\ninserted\nomega")).toEqual([
    {
      column: 1,
      from: 6,
      line: 2,
      message: 'Line 2: "inserted" would be inserted.',
      replacementText: "inserted",
      sourceText: "",
      to: 7,
    },
  ]);
});

test("does not include an allowed terminal newline in a content-change diagnostic", () => {
  const markdown = '<a href="https://example.com">link</a>\n';
  const result = preflightMarkdownForWysiwyg(markdown);

  expect(result.safe).toBe(false);
  if (result.safe || result.reason !== "content-changed") {
    throw new Error("Expected a content-change diagnostic.");
  }
  expect(result.diagnostics).toHaveLength(1);
  expect(result.diagnostics?.[0]?.sourceText).toBe('<a href="https://example.com">link</a>');
});

test("describes whole-line deletions at the beginning, middle, and end", () => {
  const cases = [
    { original: "remove\nkeep", replacement: "keep", line: 1, sourceText: "remove" },
    { original: "a\nremove\nb", replacement: "a\nb", line: 2, sourceText: "remove" },
    { original: "keep\nremove", replacement: "keep", line: 2, sourceText: "remove" },
  ];

  for (const value of cases) {
    const diagnostics = createMarkdownSafetyDiagnostics(value.original, value.replacement);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toEqual(
      expect.objectContaining({
        line: value.line,
        message: `Line ${value.line}: ${JSON.stringify(value.sourceText)} would be removed.`,
        replacementText: "",
        sourceText: value.sourceText,
      }),
    );
  }
});

test("keeps distant changes separate in a large document", () => {
  const originalLines = Array.from({ length: 600 }, (_, index) => `line ${index + 1}`);
  const replacementLines = [...originalLines];
  replacementLines[19] = "changed 20";
  replacementLines[579] = "changed 580";

  const diagnostics = createMarkdownSafetyDiagnostics(
    originalLines.join("\n"),
    replacementLines.join("\n"),
  );

  expect(diagnostics.map(({ line }) => line)).toEqual([20, 580]);
  expect(diagnostics.every(({ message }) => message.length < 180)).toBe(true);
});
