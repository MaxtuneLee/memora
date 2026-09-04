import type { ContentParser } from "../types";
import { DEFAULT_CONTENT_PROCESSING_LIMITS } from "../processingLimits";
import type { ImageDocumentBlock } from "@/lib/playground/imageDocumentPipeline";

const IMAGE_EXTENSIONS = [".avif", ".bmp", ".gif", ".jpeg", ".jpg", ".png", ".webp"];

const isImageFile = (file: Pick<File, "name" | "type">): boolean => {
  const name = file.name.toLowerCase();
  return (
    file.type.startsWith("image/") || IMAGE_EXTENSIONS.some((extension) => name.endsWith(extension))
  );
};

const getBlockMarkdown = (block: ImageDocumentBlock): string | null => {
  if (!block.text && !block.latex) return null;
  if (block.kind === "doc_title") return `# ${block.text ?? ""}`.trim();
  if (block.kind === "paragraph_title") return `## ${block.text ?? ""}`.trim();
  if (block.kind === "display_formula") return `$$\n${block.latex ?? ""}\n$$`;
  if (block.kind === "inline_formula") return `$${block.latex ?? ""}$`;
  return (block.text ?? block.latex ?? "").trim() || null;
};

export const imageContentParser: ContentParser = {
  name: "image",
  version: "image-v1",
  supports: isImageFile,
  parse: async ({ file, signal, onProgress }) => {
    if (signal?.aborted) throw new DOMException("Parsing was cancelled", "AbortError");
    const bitmap = await createImageBitmap(file);
    const pixels = bitmap.width * bitmap.height;
    bitmap.close();
    if (pixels > DEFAULT_CONTENT_PROCESSING_LIMITS.maxImagePixels) {
      throw new Error(
        `${file.name} is ${pixels.toLocaleString()} pixels, exceeding the ${DEFAULT_CONTENT_PROCESSING_LIMITS.maxImagePixels.toLocaleString()} pixel processing limit.`,
      );
    }
    const { ImageDocumentPipelineSession } = await import("@/lib/playground/imageDocumentPipeline");
    const session = new ImageDocumentPipelineSession((progress) => {
      onProgress?.({ label: progress.label });
    });
    try {
      const result = await session.run(file);
      if (signal?.aborted) throw new DOMException("Parsing was cancelled", "AbortError");
      const headingPath: string[] = [];
      const segments = result.blocks.flatMap((block) => {
        const markdown = getBlockMarkdown(block);
        if (!markdown) return [];
        const isTitle = block.kind === "doc_title" || block.kind === "paragraph_title";
        if (isTitle) {
          const level = block.kind === "doc_title" ? 0 : 1;
          headingPath.splice(level);
          headingPath[level] = block.text?.trim() ?? "";
        }
        const text = block.text?.trim() || block.latex?.trim() || "";
        return [
          {
            kind: block.kind.includes("formula")
              ? ("formula" as const)
              : isTitle
                ? ("title" as const)
                : ("text" as const),
            text,
            markdown,
            headingPath: headingPath.filter(Boolean),
            locator: { kind: "image" as const, rect: block.rect },
            searchable: Boolean(text),
          },
        ];
      });
      return {
        title: file.name.replace(/\.[^.]+$/, ""),
        markdown: result.markdown,
        plainText: segments
          .map((segment) => segment.text)
          .filter(Boolean)
          .join("\n\n"),
        segments,
        warnings: result.warnings.map((message) => ({ code: "image-warning", message })),
      };
    } finally {
      await session.dispose();
    }
  },
};
