import { expect, test } from "vite-plus/test";

import {
  buildLineAnchor,
  buildReferenceLink,
  parseLineAnchor,
  parseReferenceLink,
} from "@/lib/editor/referenceLinks";

test("builds a single-line reference link", () => {
  expect(
    buildReferenceLink({
      label: "Parser notes",
      relativePath: "../notes/parser.md",
      startLine: 12,
    }),
  ).toBe("[Parser notes](../notes/parser.md#L12)");
});

test("builds a range reference link", () => {
  expect(
    buildReferenceLink({
      label: "Parser notes",
      relativePath: "../notes/parser.md",
      startLine: 12,
      endLine: 18,
    }),
  ).toBe("[Parser notes](../notes/parser.md#L12-L18)");
});

test("escapes markdown labels and encodes target segments safely", () => {
  expect(
    buildReferenceLink({
      label: "Parser [notes] (draft)",
      relativePath: "../notes (draft)/parser (final).md",
      startLine: 12,
    }),
  ).toBe("[Parser \\[notes\\] \\(draft\\)](../notes%20%28draft%29/parser%20%28final%29.md#L12)");
});

test("builds and parses line anchors", () => {
  expect(buildLineAnchor(12)).toBe("#L12");
  expect(buildLineAnchor(12, 18)).toBe("#L12-L18");
  expect(parseLineAnchor("#L12")).toEqual({ startLine: 12, endLine: null });
  expect(parseLineAnchor("#L12-L18")).toEqual({ startLine: 12, endLine: 18 });
  expect(parseLineAnchor("#L18-L12")).toBeNull();
});

test("parses a reference link with a line range", () => {
  expect(parseReferenceLink("[Parser notes](../notes/parser.md#L12-L18)")).toEqual({
    label: "Parser notes",
    relativePath: "../notes/parser.md",
    startLine: 12,
    endLine: 18,
  });
});

test("parses a reference link without an anchor", () => {
  expect(parseReferenceLink("[Parser notes](../notes/parser.md)")).toEqual({
    label: "Parser notes",
    relativePath: "../notes/parser.md",
    startLine: null,
    endLine: null,
  });
});

test("parses escaped labels and encoded targets back to logical values", () => {
  expect(
    parseReferenceLink(
      "[Parser \\[notes\\] \\(draft\\)](../notes%20%28draft%29/parser%20%28final%29.md#L12)",
    ),
  ).toEqual({
    label: "Parser [notes] (draft)",
    relativePath: "../notes (draft)/parser (final).md",
    startLine: 12,
    endLine: null,
  });
});
