import { readFileSync } from "node:fs";

import { describe, expect, test } from "vite-plus/test";

import {
  convertDocxPreviewToMarkdown,
  getSupportedDocumentKind,
  joinPdfTextItems,
  shouldRunPdfOcrFallback,
  summarizeDocxPreviewDocument,
} from "@/lib/playground/documentParsing";

describe("document parsing helpers", () => {
  test("keeps PDF text item line breaks while normalizing extra whitespace", () => {
    expect(
      joinPdfTextItems([
        { text: "Local", hasLineBreak: false },
        { text: " parsing", hasLineBreak: true },
        { text: "works", hasLineBreak: false },
      ]),
    ).toBe("Local parsing\nworks");
  });

  test("routes pages with no usable text layer to OCR", () => {
    expect(shouldRunPdfOcrFallback("Page 1")).toBe(true);
    expect(shouldRunPdfOcrFallback("A sufficiently long native PDF paragraph stays local.")).toBe(
      false,
    );
  });

  test("recognizes PDF, DOCX, and PPTX even when browsers omit MIME types", () => {
    expect(getSupportedDocumentKind(new File([""], "paper.PDF"))).toBe("pdf");
    expect(getSupportedDocumentKind(new File([""], "meeting-notes.docx"))).toBe("docx");
    expect(getSupportedDocumentKind(new File([""], "slides.pptx"))).toBe("pptx");
    expect(getSupportedDocumentKind(new File([""], "legacy.doc"))).toBeNull();
  });

  test("uses docx-preview for visual DOCX rendering", () => {
    const source = readFileSync(
      new URL("../../src/components/playground/DocumentParsing.tsx", import.meta.url),
      "utf8",
    );

    expect(source).toContain('import("docx-preview")');
    expect(source).toContain("renderAltChunks: false");
    expect(source).toContain("<DocxVisualPreview file={file} />");
  });

  test("uses pptx-viewer core for parsing, Markdown conversion, and pure canvas rendering", () => {
    const parserSource = readFileSync(
      new URL("../../src/lib/playground/documentParsing.ts", import.meta.url),
      "utf8",
    );
    const viewerSource = readFileSync(
      new URL("../../src/components/playground/DocumentParsing.tsx", import.meta.url),
      "utf8",
    );

    expect(parserSource).toContain('from "pptx-viewer-core"');
    expect(parserSource).toContain("PptxHandler");
    expect(parserSource).toContain("PptxMarkdownConverter");
    expect(parserSource).toContain("await handler.load(fileBuffer");
    expect(viewerSource).toContain("useViewerBuildingBlocks");
    expect(viewerSource).toContain("<SlideCanvas {...canvasProps} />");
    expect(viewerSource).toContain("<I18nextProvider i18n={pptxViewerI18n}>");
    expect(viewerSource).toContain("<PptxMarkdownPreview document={result} />");
    expect(viewerSource).toContain("<PptxVisualPreview");
  });

  test("summarizes docx-preview structure without exposing its experimental object", () => {
    const summary = summarizeDocxPreviewDocument({
      documentPart: {
        body: {
          children: [
            {
              type: "paragraph",
              children: [{ type: "run", children: [{ type: "text", text: "x" }] }],
            },
            { type: "mmlMath", children: [{ type: "mmlFraction" }] },
          ],
        },
      },
      parts: [{}, {}],
      documentPartName: "word/document.xml",
    });

    expect(summary.partCount).toBe(2);
    expect(summary.bodyNodeCount).toBe(5);
    expect(summary.mathExpressionCount).toBe(1);
    expect(summary.nodeTypes).toContainEqual({ type: "mmlFraction", count: 1 });
    expect(summary.topLevelKeys).toEqual(["documentPart", "documentPartName", "parts"]);
    expect(summary.content).toMatchObject([
      { type: "paragraph", children: [{ type: "run", children: [{ type: "text", text: "x" }] }] },
      { type: "mmlMath", children: [{ type: "mmlFraction" }] },
    ]);
  });

  test("converts docx-preview paragraphs, formatting, tables, and formulas to Markdown", () => {
    const conversion = convertDocxPreviewToMarkdown({
      documentPart: {
        body: {
          children: [
            {
              type: "paragraph",
              styleName: "Heading 1",
              children: [{ type: "run", children: [{ type: "text", text: "Overview" }] }],
            },
            {
              type: "paragraph",
              children: [
                {
                  type: "run",
                  cssStyle: { "font-weight": "bold" },
                  children: [{ type: "text", text: "Local" }],
                },
                { type: "run", children: [{ type: "text", text: " parsing" }] },
              ],
            },
            {
              type: "paragraph",
              children: [
                {
                  type: "mmlMath",
                  children: [
                    {
                      type: "mmlFraction",
                      children: [
                        {
                          type: "mmlNumerator",
                          children: [{ type: "mmlRun", children: [{ type: "text", text: "a" }] }],
                        },
                        {
                          type: "mmlDenominator",
                          children: [{ type: "mmlRun", children: [{ type: "text", text: "b" }] }],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
            {
              type: "table",
              children: [
                {
                  type: "row",
                  children: [
                    {
                      type: "cell",
                      children: [
                        {
                          type: "paragraph",
                          children: [{ type: "run", children: [{ type: "text", text: "Name" }] }],
                        },
                      ],
                    },
                    {
                      type: "cell",
                      children: [
                        {
                          type: "paragraph",
                          children: [{ type: "run", children: [{ type: "text", text: "Value" }] }],
                        },
                      ],
                    },
                  ],
                },
                {
                  type: "row",
                  children: [
                    {
                      type: "cell",
                      children: [
                        {
                          type: "paragraph",
                          children: [{ type: "run", children: [{ type: "text", text: "Mode" }] }],
                        },
                      ],
                    },
                    {
                      type: "cell",
                      children: [
                        {
                          type: "paragraph",
                          children: [{ type: "run", children: [{ type: "text", text: "Local" }] }],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
    });

    expect(conversion.markdown).toContain("# Overview");
    expect(conversion.markdown).toContain("**Local** parsing");
    expect(conversion.markdown).toContain("$\\frac{a}{b}$");
    expect(conversion.markdown).toContain("| Name | Value |");
    expect(conversion.markdown).toContain("| Mode | Local |");
  });

  test("infers unstyled cover and numbered section headings without keeping run-level bold markers", () => {
    const conversion = convertDocxPreviewToMarkdown({
      documentPart: {
        body: {
          children: [
            {
              type: "paragraph",
              children: [
                {
                  type: "run",
                  cssStyle: { "font-weight": "bold" },
                  children: [{ type: "text", text: "THE HONG KONG POLYTECHNIC UNI" }],
                },
                {
                  type: "run",
                  cssStyle: { "font-weight": "bold" },
                  children: [{ type: "text", text: "VERSITY" }],
                },
              ],
            },
            {
              type: "paragraph",
              children: [{ type: "run", children: [{ type: "text", text: "2. Project Title:" }] }],
            },
            {
              type: "paragraph",
              children: [
                {
                  type: "run",
                  cssStyle: { "font-weight": "bold" },
                  children: [{ type: "text", text: "Far Field Wireless Power" }],
                },
                {
                  type: "run",
                  cssStyle: { "font-weight": "bold" },
                  children: [{ type: "text", text: " Transfer Technology" }],
                },
              ],
            },
          ],
        },
      },
    });

    expect(conversion.markdown).toContain("# THE HONG KONG POLYTECHNIC UNIVERSITY");
    expect(conversion.markdown).toContain("## 2. Project Title");
    expect(conversion.markdown).toContain("# Far Field Wireless Power Transfer Technology");
    expect(conversion.markdown).not.toContain("UNI**VERSITY");
  });

  test("uses DOCX numbering levels for section hierarchy instead of treating headings as lists", () => {
    const conversion = convertDocxPreviewToMarkdown({
      numberingPart: {
        numberings: [{ id: "1", abstractId: "1" }],
        abstractNumberings: [
          {
            id: "1",
            levels: [
              { level: 0, format: "decimal", start: 6 },
              { level: 1, format: "decimal", start: 1 },
              { level: 2, format: "decimal", start: 1 },
            ],
          },
        ],
      },
      documentPart: {
        body: {
          children: [
            {
              type: "paragraph",
              styleName: "ListParagraph",
              numbering: { id: "1", level: 0 },
              children: [
                {
                  type: "run",
                  children: [{ type: "text", text: "Proposed System Configuration" }],
                },
              ],
            },
            {
              type: "paragraph",
              styleName: "ListParagraph",
              numbering: { id: "1", level: 1 },
              children: [{ type: "run", children: [{ type: "text", text: "Introduction" }] }],
            },
            {
              type: "paragraph",
              styleName: "ListParagraph",
              numbering: { id: "1", level: 1 },
              children: [
                {
                  type: "run",
                  children: [{ type: "text", text: "Power Consumption Calculation" }],
                },
              ],
            },
            {
              type: "paragraph",
              styleName: "ListParagraph",
              numbering: { id: "1", level: 2 },
              children: [
                {
                  type: "run",
                  children: [{ type: "text", text: "Smart Home Comfort Monitoring Scenario" }],
                },
              ],
            },
          ],
        },
      },
    });

    expect(conversion.markdown).toContain("## 6. Proposed System Configuration");
    expect(conversion.markdown).toContain("### 6.1. Introduction");
    expect(conversion.markdown).toContain("### 6.2. Power Consumption Calculation");
    expect(conversion.markdown).toContain("#### 6.2.1. Smart Home Comfort Monitoring Scenario");
  });
});
