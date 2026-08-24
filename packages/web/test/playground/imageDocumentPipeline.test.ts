import { readFileSync } from "node:fs";
import { describe, expect, test } from "vite-plus/test";

import {
  composeImageDocumentBlocks,
  deduplicateLayoutDetections,
  normalizeLayoutKind,
  postprocessTexoLatex,
  serializeImageDocumentMarkdown,
  type ImageDocumentBlock,
} from "@/lib/playground/imageDocumentPipeline";
import {
  configureTransformersCache,
  getModelResourceCachePath,
  OPFSCache,
} from "@/workers/local-model/cache";

describe("image document layout mapping", () => {
  test("preserves PP-DocLayoutV3 formula classes that EmbedPDF labels alike", () => {
    expect(normalizeLayoutKind(5, "formula")).toBe("display_formula");
    expect(normalizeLayoutKind(15, "formula")).toBe("inline_formula");
    expect(normalizeLayoutKind(11, "formula_number")).toBe("formula_number");
  });

  test("maps text, titles, media placeholders, and ignored furniture", () => {
    expect(normalizeLayoutKind(0, "abstract")).toBe("abstract");
    expect(normalizeLayoutKind(17, "paragraph_title")).toBe("paragraph_title");
    expect(normalizeLayoutKind(21, "table")).toBe("table");
    expect(normalizeLayoutKind(8, "footer")).toBe("ignored");
  });

  test("removes near-identical overlapping detections", () => {
    const detections = deduplicateLayoutDetections([
      {
        id: 1,
        classId: 22,
        label: "text",
        score: 0.94,
        bbox: [10, 10, 400, 80],
        readingOrder: 0,
      },
      {
        id: 2,
        classId: 23,
        label: "text",
        score: 0.91,
        bbox: [12, 11, 398, 81],
        readingOrder: 1,
      },
    ]);

    expect(detections).toHaveLength(1);
    expect(detections[0]?.id).toBe(1);
  });
});

describe("image document composition", () => {
  test("assigns OCR lines to layout blocks and keeps formula output separate", () => {
    const blocks = composeImageDocumentBlocks({
      detections: [
        {
          id: 1,
          classId: 2,
          label: "doc_title",
          score: 0.95,
          bbox: [10, 10, 390, 60],
          readingOrder: 0,
        },
        {
          id: 2,
          classId: 5,
          label: "formula",
          score: 0.91,
          bbox: [90, 100, 310, 150],
          readingOrder: 1,
        },
      ],
      ocrItems: [
        {
          poly: [
            [15, 15],
            [380, 15],
            [380, 55],
            [15, 55],
          ],
          text: "A browser-native pipeline",
          score: 0.98,
        },
      ],
      formulaLatex: new Map([[2, "E = mc^2"]]),
    });

    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ kind: "doc_title", text: "A browser-native pipeline" });
    expect(blocks[1]).toMatchObject({
      kind: "display_formula",
      latex: "E = mc^2",
      recognition: "texo",
    });
  });

  test("filters detections below the selected confidence threshold", () => {
    expect(
      composeImageDocumentBlocks({
        detections: [
          {
            id: 1,
            classId: 22,
            label: "text",
            score: 0.2,
            bbox: [0, 0, 100, 20],
            readingOrder: 0,
          },
        ],
        ocrItems: [],
        confidenceThreshold: 0.35,
      }),
    ).toEqual([]);
  });

  test("assigns each OCR line to only one overlapping text block", () => {
    const blocks = composeImageDocumentBlocks({
      detections: [
        {
          id: 1,
          classId: 22,
          label: "text",
          score: 0.9,
          bbox: [0, 0, 400, 120],
          readingOrder: 0,
        },
        {
          id: 2,
          classId: 22,
          label: "text",
          score: 0.88,
          bbox: [0, 0, 400, 55],
          readingOrder: 1,
        },
      ],
      ocrItems: [
        {
          poly: [
            [10, 10],
            [390, 10],
            [390, 45],
            [10, 45],
          ],
          text: "A line must not be duplicated",
          score: 0.97,
        },
      ],
    });

    expect(blocks.filter((block) => block.text === "A line must not be duplicated")).toHaveLength(1);
  });
});

describe("Texo LaTeX postprocessing", () => {
  test("removes repeated decoder padding and repairs subscript syntax", () => {
    const padding = Array.from({ length: 64 }, () => "\\~").join(" ");

    expect(postprocessTexoLatex(`$: P \\_ { t } ${padding}$`)).toBe("P_{t}");
  });

  test("repairs an unbraced escaped subscript", () => {
    expect(postprocessTexoLatex("P \\_ t")).toBe("P_t");
  });

  test("preserves legitimate tilde and similarity commands", () => {
    expect(postprocessTexoLatex("\\tilde{x} \\sim y")).toBe("\\tilde{x} \\sim y");
  });
});

describe("image document Markdown", () => {
  const block = (
    overrides: Partial<ImageDocumentBlock> & Pick<ImageDocumentBlock, "id" | "kind">,
  ): ImageDocumentBlock => {
    const { id, kind, ...rest } = overrides;
    return {
      id,
      classId: 22,
      label: kind,
      kind,
      score: 0.9,
      rect: { x: 0, y: 0, width: 300, height: 40 },
      readingOrder: 0,
      recognition: "none",
      ...rest,
    };
  };

  test("serializes titles, formulas with numbers, and honest media placeholders", () => {
    const markdown = serializeImageDocumentMarkdown([
      block({ id: "title", kind: "doc_title", text: "Local documents" }),
      block({
        id: "formula",
        kind: "display_formula",
        latex: "E = mc^2",
        formulaNumber: "1",
      }),
      block({ id: "table", kind: "table", score: 0.82, recognition: "placeholder" }),
    ]);

    expect(markdown).toContain("# Local documents");
    expect(markdown).toContain("E = mc^2 \\tag{1}");
    expect(markdown).toContain("<!-- table region · confidence 82.0% -->");
  });

  test("places inline formula LaTeX into the host text line by x coordinate", () => {
    const markdown = serializeImageDocumentMarkdown([
      block({
        id: "text",
        kind: "text",
        text: "Energy equals",
        recognition: "ocr",
        rect: { x: 0, y: 100, width: 500, height: 50 },
        lines: [
          {
            text: "Energy equals",
            score: 0.96,
            rect: { x: 20, y: 105, width: 150, height: 30 },
          },
        ],
      }),
      block({
        id: "inline",
        kind: "inline_formula",
        latex: "mc^2",
        recognition: "texo",
        rect: { x: 190, y: 104, width: 90, height: 32 },
      }),
    ]);

    expect(markdown).toBe("Energy equals $mc^2$");
  });

  test("merges inline formulas into their own OCR line instead of reordering a paragraph", () => {
    const markdown = serializeImageDocumentMarkdown([
      block({
        id: "text",
        kind: "text",
        recognition: "ocr",
        rect: { x: 0, y: 100, width: 500, height: 100 },
        lines: [
          {
            text: "First line",
            score: 0.97,
            rect: { x: 20, y: 105, width: 100, height: 25 },
          },
          {
            text: "Second line",
            score: 0.96,
            rect: { x: 20, y: 160, width: 120, height: 25 },
          },
        ],
      }),
      block({
        id: "inline",
        kind: "inline_formula",
        latex: "x^2",
        recognition: "texo",
        rect: { x: 150, y: 103, width: 45, height: 28 },
      }),
    ]);

    expect(markdown).toBe("First line $x^2$\nSecond line");
  });
});

describe("shared OPFS model cache", () => {
  test("uses the same transformers-cache root as ASR and local LLM models", () => {
    expect(
      getModelResourceCachePath(
        "https://huggingface.co/alephpi/FormulaNet/resolve/main/onnx/encoder_model.onnx",
      ),
    ).toBe("/transformers-cache/alephpi/FormulaNet/resolve/main/onnx/encoder_model.onnx");
  });

  test("configures Transformers.js to prefer OPFS and disable Cache API", () => {
    const environment = {
      useCustomCache: false,
      customCache: null as unknown,
      useBrowserCache: true,
    };

    configureTransformersCache(environment);

    expect(environment.useCustomCache).toBe(true);
    expect(environment.customCache).toBe(OPFSCache);
    expect(environment.useBrowserCache).toBe(false);
  });
});

describe("image pipeline interface copy", () => {
  test("omits redundant eyebrow labels and uppercase styling", () => {
    const source = readFileSync(
      new URL("../../src/components/playground/ImageDocumentPipeline.tsx", import.meta.url),
      "utf8",
    );

    expect(source).not.toContain(" uppercase");
    expect(source).not.toContain('fillText("LAYOUT"');
    expect(source).not.toContain('fillText("RECOGNIZE"');
    expect(source).not.toContain('fillText("MARKDOWN"');
    expect(source).not.toContain("Execution trace");
    expect(source).not.toContain("Document image");
    expect(source).not.toContain("Selected block");
  });
});
