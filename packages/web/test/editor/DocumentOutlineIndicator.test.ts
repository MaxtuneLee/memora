import { expect, test } from "vite-plus/test";

import { parseMarkdownHeadings } from "@/components/editor/DocumentOutlineIndicator";

test("includes every markdown heading level in document order", () => {
  const headings = parseMarkdownHeadings(`# Overview
## Context
### Method
#### Details
##### Notes
###### Sources`);

  expect(headings.map((heading) => [heading.level, heading.title, heading.line])).toEqual([
    [1, "Overview", 1],
    [2, "Context", 2],
    [3, "Method", 3],
    [4, "Details", 4],
    [5, "Notes", 5],
    [6, "Sources", 6],
  ]);
});

test("includes setext headings and ignores headings inside fenced code", () => {
  const headings = parseMarkdownHeadings(`Title
=====

\`\`\`md
## Not a heading
\`\`\`

Second section
--------------`);

  expect(headings.map((heading) => [heading.level, heading.title, heading.line])).toEqual([
    [1, "Title", 1],
    [2, "Second section", 8],
  ]);
});
