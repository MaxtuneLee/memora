export interface PixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ContentArtifact {
  schemaVersion: 1;
  fileId: string;
  sourceRevision: string;
  parser: {
    name: string;
    version: string;
  };
  title: string;
  markdown: string;
  plainText: string;
  segments: ContentSegment[];
  warnings: ContentWarning[];
  createdAt: number;
}

export interface ContentSegment {
  id: string;
  kind: "title" | "text" | "formula" | "table" | "image" | "transcript";
  text: string;
  markdown?: string;
  headingPath: string[];
  locator: ContentLocator;
  searchable: boolean;
}

export type ContentLocator =
  | { kind: "text"; startOffset: number; endOffset: number }
  | { kind: "page"; pageNumber: number; rect?: PixelRect }
  | { kind: "slide"; slideNumber: number }
  | { kind: "image"; rect?: PixelRect }
  | { kind: "transcript"; startSeconds: number; endSeconds: number };

export interface ContentWarning {
  code: string;
  message: string;
  locator?: ContentLocator;
}

export interface ContentParserContext {
  fileId: string;
  sourceRevision: string;
  file: File;
  signal?: AbortSignal;
  onProgress?: (progress: { label: string; current?: number; total?: number }) => void;
}

export interface ContentParser {
  name: string;
  version: string;
  supports(file: Pick<File, "name" | "type">): boolean;
  parse(context: ContentParserContext): Promise<ContentArtifactDraft>;
}

export interface ContentArtifactDraft {
  title?: string;
  markdown: string;
  plainText?: string;
  segments: Omit<ContentSegment, "id">[];
  warnings?: ContentWarning[];
}
