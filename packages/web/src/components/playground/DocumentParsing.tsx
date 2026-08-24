import { Button } from "@base-ui/react/button";
import { Tabs } from "@base-ui/react/tabs";
import {
  ArrowClockwiseIcon,
  CheckCircleIcon,
  ClipboardIcon,
  CodeIcon,
  FileImageIcon,
  FileSearchIcon,
  PlayIcon,
  ScanIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { createInstance } from "i18next";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  SlideCanvas,
  type PowerPointViewerHandle,
  useViewerBuildingBlocks,
} from "pptx-react-viewer";
import { keyToLabel, translationsEn } from "pptx-react-viewer/i18n";
import "pptx-react-viewer/styles";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { Streamdown } from "streamdown";

import { cn } from "@/lib/cn";
import { formatBytes } from "@/lib/format";
import {
  getDocumentParseErrorMessage,
  getSupportedDocumentKind,
  parseDocumentFile,
  type DocumentParseProgress,
  type ParsedDocument,
  type ParsedDocxDocument,
  type ParsedPdfPage,
  type ParsedPptxImage,
  type ParsedPptxSlide,
} from "@/lib/playground/documentParsing";
import {
  ImageDocumentPipelineSession,
  type ImageDocumentPipelineProgress,
} from "@/lib/playground/imageDocumentPipeline";
import {
  MEMORA_STREAMDOWN_CLASS_NAME,
  MEMORA_STREAMDOWN_CONTROLS,
  MEMORA_STREAMDOWN_PLUGINS,
  MEMORA_STREAMDOWN_THEME,
} from "@/lib/streamdown";

const formatMilliseconds = (value: number): string => {
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10_000 ? 1 : 2)} s`;
  return `${Math.round(value)} ms`;
};

const DOCUMENT_FILE_INPUT_ID = "playground-document-file";

const pptxViewerI18n = createInstance();

void pptxViewerI18n.use(initReactI18next).init({
  lng: "en",
  fallbackLng: "en",
  resources: { en: { translation: translationsEn } },
  interpolation: { escapeValue: false },
  parseMissingKeyHandler: keyToLabel,
  react: { useSuspense: false },
});

const getPageSourceLabel = (page: ParsedPdfPage): string =>
  page.source === "text" ? "PDF text layer" : "Local OCR";

interface DocumentPreviewProps {
  file: File | null;
  result: ParsedDocument | null;
  pdfUrl: string | null;
  selectedPage: ParsedPdfPage | null;
  selectedPptxSlide: ParsedPptxSlide | null;
  isRunning: boolean;
  onSelectFile: (file: File | null) => void;
  onPptxSlideChange: (slideNumber: number) => void;
}

interface DocxVisualPreviewProps {
  file: File;
}

function DocxVisualPreview({ file }: DocxVisualPreviewProps) {
  const bodyContainerRef = useRef<HTMLDivElement>(null);
  const styleContainerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const bodyContainer = bodyContainerRef.current;
    const styleContainer = styleContainerRef.current;
    if (!bodyContainer || !styleContainer) return;

    let disposed = false;
    bodyContainer.replaceChildren();
    styleContainer.replaceChildren();
    setError(null);

    void (async () => {
      try {
        const { renderAsync } = await import("docx-preview");
        if (disposed) return;

        await renderAsync(file, bodyContainer, styleContainer, {
          breakPages: true,
          className: "memora-docx-preview",
          ignoreHeight: true,
          ignoreWidth: true,
          renderAltChunks: false,
          renderComments: false,
          useBase64URL: true,
        });
      } catch (reason) {
        if (!disposed) {
          setError(reason instanceof Error ? reason.message : "Unable to render this DOCX file.");
        }
      }
    })();

    return () => {
      disposed = true;
      bodyContainer.replaceChildren();
      styleContainer.replaceChildren();
    };
  }, [file]);

  if (error) {
    return (
      <div className="flex h-[540px] w-full items-center justify-center rounded-xl bg-memora-surface px-8 text-center text-sm leading-6 text-memora-warning-text">
        DOCX preview could not be rendered: {error}
      </div>
    );
  }

  return (
    <div className="h-[540px] w-full overflow-auto rounded-xl bg-memora-surface">
      <div ref={styleContainerRef} />
      <div ref={bodyContainerRef} className="min-h-full" />
    </div>
  );
}

interface PptxVisualPreviewProps {
  content: Uint8Array;
  activeSlideNumber: number;
  onActiveSlideChange: (slideNumber: number) => void;
}

function PptxSlideCanvas({
  content,
  activeSlideNumber,
  onActiveSlideChange,
}: PptxVisualPreviewProps) {
  const handleRef = useRef<PowerPointViewerHandle>(null);
  const { canvasProps, error, loading } = useViewerBuildingBlocks({
    content,
    canEdit: false,
    autosaveEnabled: false,
    handle: handleRef,
    onActiveSlideChange: (slideIndex) => onActiveSlideChange(slideIndex + 1),
  });

  useEffect(() => {
    if (!loading && !error) handleRef.current?.goTo(activeSlideNumber - 1);
  }, [activeSlideNumber, error, loading]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-white/70">
        Rendering slides…
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex h-full items-center justify-center px-8 text-center text-sm leading-6 text-red-200">
        PPTX preview could not be rendered: {error}
      </div>
    );
  }
  return <SlideCanvas {...canvasProps} />;
}

function PptxVisualPreview({
  content,
  activeSlideNumber,
  onActiveSlideChange,
}: PptxVisualPreviewProps) {
  return (
    <div className="h-[540px] w-full overflow-hidden rounded-xl border border-memora-border bg-[#191919]">
      <I18nextProvider i18n={pptxViewerI18n}>
        <PptxSlideCanvas
          content={content}
          activeSlideNumber={activeSlideNumber}
          onActiveSlideChange={onActiveSlideChange}
        />
      </I18nextProvider>
    </div>
  );
}

function DocxParserComparison({ document }: { document: ParsedDocxDocument }) {
  const parser = document.docxPreviewParser;

  return (
    <div className="space-y-5">
      <div className="grid overflow-hidden rounded-2xl border border-memora-border md:grid-cols-2">
        <section className="p-5 md:border-r md:border-memora-border">
          <p className="text-sm font-semibold text-memora-text">Mammoth</p>
          <p className="mt-1 text-xs leading-5 text-memora-text-soft">
            Stable semantic HTML and plain-text extraction used by the document pipeline.
          </p>
          <dl className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-memora-surface-soft p-3">
              <dt className="text-[11px] text-memora-text-soft">Text</dt>
              <dd className="mt-1 text-sm font-semibold text-memora-text">
                {document.text.length.toLocaleString()} chars
              </dd>
            </div>
            <div className="rounded-xl bg-memora-surface-soft p-3">
              <dt className="text-[11px] text-memora-text-soft">Semantic HTML</dt>
              <dd className="mt-1 text-sm font-semibold text-memora-text">
                {document.html.length.toLocaleString()} chars
              </dd>
            </div>
          </dl>
        </section>

        <section className="p-5">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-memora-text">docx-preview.parseAsync</p>
            <span className="rounded-full border border-memora-warning-border bg-memora-warning-surface px-2 py-0.5 text-[10px] font-medium text-memora-warning-text">
              Experimental
            </span>
          </div>
          <p className="mt-1 text-xs leading-5 text-memora-text-soft">
            Internal document structure used here only for comparison and formula diagnostics.
          </p>
          {parser.status === "available" ? (
            <dl className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-memora-surface-soft p-3">
                <dt className="text-[11px] text-memora-text-soft">Math expressions</dt>
                <dd className="mt-1 text-sm font-semibold text-memora-text">
                  {parser.mathExpressionCount}
                </dd>
              </div>
              <div className="rounded-xl bg-memora-surface-soft p-3">
                <dt className="text-[11px] text-memora-text-soft">Body nodes</dt>
                <dd className="mt-1 text-sm font-semibold text-memora-text">
                  {parser.bodyNodeCount.toLocaleString()}
                </dd>
              </div>
              <div className="rounded-xl bg-memora-surface-soft p-3">
                <dt className="text-[11px] text-memora-text-soft">Package parts</dt>
                <dd className="mt-1 text-sm font-semibold text-memora-text">{parser.partCount}</dd>
              </div>
              <div className="rounded-xl bg-memora-surface-soft p-3">
                <dt className="text-[11px] text-memora-text-soft">Inspection time</dt>
                <dd className="mt-1 text-sm font-semibold text-memora-text">
                  {formatMilliseconds(parser.elapsedMs)}
                </dd>
              </div>
              <div className="rounded-xl bg-memora-surface-soft p-3">
                <dt className="text-[11px] text-memora-text-soft">Markdown</dt>
                <dd className="mt-1 text-sm font-semibold text-memora-text">
                  {parser.markdown.length.toLocaleString()} chars
                </dd>
              </div>
            </dl>
          ) : (
            <p className="mt-5 rounded-xl bg-memora-warning-surface p-3 text-xs leading-5 text-memora-warning-text">
              parseAsync could not inspect this file: {parser.error}
            </p>
          )}
        </section>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <section>
          <p className="text-xs font-medium text-memora-text-muted">Detected node types</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {parser.nodeTypes.length ? (
              parser.nodeTypes.slice(0, 12).map((entry) => (
                <span
                  key={entry.type}
                  className="rounded-lg border border-memora-border bg-memora-surface-soft px-2 py-1 text-[11px] text-memora-text-muted"
                >
                  {entry.type} · {entry.count}
                </span>
              ))
            ) : (
              <span className="text-xs text-memora-text-soft">No structure is available.</span>
            )}
          </div>
        </section>
        <section>
          <p className="text-xs font-medium text-memora-text-muted">Top-level parser fields</p>
          <p className="mt-2 text-xs leading-5 text-memora-text-soft">
            {parser.topLevelKeys.length
              ? parser.topLevelKeys.join(", ")
              : "No fields are available."}
          </p>
        </section>
      </div>
    </div>
  );
}

function DocxPreviewParsedContent({ document }: { document: ParsedDocxDocument }) {
  const parser = document.docxPreviewParser;

  if (parser.status === "unavailable") {
    return (
      <p className="text-sm leading-6 text-memora-warning-text">
        parseAsync could not inspect this file: {parser.error}
      </p>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-memora-border pb-4">
        <div>
          <p className="text-sm font-semibold text-memora-text">docx-preview parsed content</p>
          <p className="mt-1 text-xs leading-5 text-memora-text-soft">
            A safe projection of documentPart.body.children: node types, text runs, and formula
            nodes.
          </p>
        </div>
        <span className="rounded-full border border-memora-warning-border bg-memora-warning-surface px-2 py-0.5 text-[10px] font-medium text-memora-warning-text">
          Experimental API
        </span>
      </div>
      {parser.contentTruncated ? (
        <p className="mt-4 rounded-xl bg-memora-warning-surface px-3 py-2 text-xs leading-5 text-memora-warning-text">
          The displayed tree is capped at 10,000 nodes for this playground.
        </p>
      ) : null}
      <pre className="mt-4 max-h-[560px] overflow-auto whitespace-pre-wrap rounded-xl bg-memora-surface-soft p-4 text-xs leading-6 text-memora-text-muted">
        {JSON.stringify(parser.content, null, 2)}
      </pre>
    </div>
  );
}

function DocxPreviewMarkdown({ document }: { document: ParsedDocxDocument }) {
  const parser = document.docxPreviewParser;

  if (parser.status === "unavailable") {
    return (
      <p className="text-sm leading-6 text-memora-warning-text">
        parseAsync could not inspect this file: {parser.error}
      </p>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-memora-border pb-4">
        <div>
          <p className="text-sm font-semibold text-memora-text">docx-preview Markdown</p>
          <p className="mt-1 text-xs leading-5 text-memora-text-soft">
            Markdown generated from the parsed DOCX nodes, independently of Mammoth.
          </p>
        </div>
        <span className="rounded-full border border-memora-warning-border bg-memora-warning-surface px-2 py-0.5 text-[10px] font-medium text-memora-warning-text">
          Experimental conversion
        </span>
      </div>
      {parser.markdownWarnings.length ? (
        <ul className="mt-4 space-y-1 rounded-xl bg-memora-warning-surface px-3 py-2 text-xs leading-5 text-memora-warning-text">
          {parser.markdownWarnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
      {parser.markdown ? (
        <Streamdown
          className={`${MEMORA_STREAMDOWN_CLASS_NAME} mt-5`}
          controls={MEMORA_STREAMDOWN_CONTROLS}
          plugins={{ ...MEMORA_STREAMDOWN_PLUGINS }}
          shikiTheme={MEMORA_STREAMDOWN_THEME}
        >
          {parser.markdown}
        </Streamdown>
      ) : (
        <p className="mt-5 text-sm leading-6 text-memora-text-soft">
          No Markdown could be generated from this document.
        </p>
      )}
    </div>
  );
}

function DocumentPreview({
  file,
  result,
  pdfUrl,
  selectedPage,
  selectedPptxSlide,
  isRunning,
  onSelectFile,
  onPptxSlideChange,
}: DocumentPreviewProps) {
  const documentKind = file ? getSupportedDocumentKind(file) : null;
  const pdfSource =
    result?.kind === "pdf" && pdfUrl
      ? `${pdfUrl}#page=${selectedPage?.pageNumber ?? 1}&zoom=page-width`
      : null;

  return (
    <div
      className={cn(
        "group relative flex min-h-[560px] items-center justify-center overflow-hidden rounded-[24px] border border-dashed border-memora-border-soft bg-memora-surface-soft outline-none transition-colors focus-within:ring-2 focus-within:ring-memora-olive-soft",
        result && "border-solid bg-[#ebe7df] p-3",
      )}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        if (!isRunning) onSelectFile(event.dataTransfer.files[0] ?? null);
      }}
    >
      <input
        id={DOCUMENT_FILE_INPUT_ID}
        type="file"
        accept="application/pdf,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx,application/vnd.openxmlformats-officedocument.presentationml.presentation,.pptx"
        className="sr-only"
        disabled={isRunning}
        onChange={(event) => {
          onSelectFile(event.target.files?.[0] ?? null);
          event.target.value = "";
        }}
      />
      {result?.kind === "pdf" && pdfSource ? (
        <iframe
          key={pdfSource}
          title={`${result.fileName}, page ${selectedPage?.pageNumber ?? 1}`}
          src={pdfSource}
          className="h-[540px] w-full rounded-xl bg-memora-surface"
        />
      ) : result?.kind === "docx" && file ? (
        <DocxVisualPreview file={file} />
      ) : result?.kind === "pptx" ? (
        <PptxVisualPreview
          content={result.viewerContent}
          activeSlideNumber={selectedPptxSlide?.slideNumber ?? 1}
          onActiveSlideChange={onPptxSlideChange}
        />
      ) : (
        <label
          htmlFor={DOCUMENT_FILE_INPUT_ID}
          className="max-w-xs cursor-pointer px-8 text-center outline-none focus-visible:ring-2 focus-visible:ring-memora-olive-soft"
        >
          <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-memora-surface-muted text-memora-text-muted">
            <FileSearchIcon className="size-5" />
          </span>
          <p className="mt-4 text-sm font-semibold text-memora-text">Drop a PDF, DOCX, or PPTX</p>
          <p className="mt-2 text-xs leading-5 text-memora-text-soft">
            {documentKind === "pdf"
              ? "Ready to inspect the PDF text layer and route scanned pages through OCR."
              : documentKind === "docx"
                ? "Ready to convert DOCX content into a local semantic preview."
                : documentKind === "pptx"
                  ? "Ready to extract slide text, notes, and embedded images locally."
                  : "The file remains in this browser while the demo parses it."}
          </p>
        </label>
      )}
    </div>
  );
}

interface PageInspectorProps {
  page: ParsedPdfPage | null;
  totalPages: number;
  onSelectPage: (page: number) => void;
}

function PageInspector({ page, totalPages, onSelectPage }: PageInspectorProps) {
  if (!page) {
    return (
      <div className="flex min-h-40 items-center justify-center rounded-2xl border border-dashed border-memora-border-soft px-5 text-center text-xs leading-5 text-memora-text-soft">
        Parse a PDF to inspect its text layer or local OCR result page by page.
      </div>
    );
  }
  return (
    <section className="rounded-2xl border border-memora-border bg-memora-surface-soft p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-memora-text">Page {page.pageNumber}</h3>
          <p className="mt-1 text-xs text-memora-text-soft">{getPageSourceLabel(page)}</p>
        </div>
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-[10px] font-semibold",
            page.source === "text"
              ? "bg-memora-olive-faint text-memora-olive-strong"
              : "bg-memora-warning-surface text-memora-warning-text",
          )}
        >
          {page.source === "text" ? "Text" : "OCR"}
        </span>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-2 border-t border-memora-border pt-3 text-[11px]">
        <div>
          <dt className="text-memora-text-soft">Text items</dt>
          <dd className="mt-0.5 font-medium text-memora-text">{page.textItems.length}</dd>
        </div>
        <div>
          <dt className="text-memora-text-soft">Page size</dt>
          <dd className="mt-0.5 font-medium text-memora-text">
            {Math.round(page.width)} × {Math.round(page.height)}
          </dd>
        </div>
        {page.ocr ? (
          <>
            <div>
              <dt className="text-memora-text-soft">OCR blocks</dt>
              <dd className="mt-0.5 font-medium text-memora-text">{page.ocr.blockCount}</dd>
            </div>
            <div>
              <dt className="text-memora-text-soft">OCR time</dt>
              <dd className="mt-0.5 font-medium text-memora-text">
                {formatMilliseconds(page.ocr.elapsedMs)}
              </dd>
            </div>
          </>
        ) : null}
      </dl>
      {totalPages > 1 ? (
        <div className="mt-4 border-t border-memora-border pt-3">
          <p className="text-[11px] font-medium text-memora-text-soft">Pages</p>
          <div className="mt-2 flex max-h-24 flex-wrap gap-1.5 overflow-y-auto pr-1">
            {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
              <button
                key={pageNumber}
                type="button"
                aria-pressed={pageNumber === page.pageNumber}
                className={cn(
                  "size-7 rounded-lg text-[11px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-memora-olive-soft",
                  pageNumber === page.pageNumber
                    ? "bg-memora-olive text-white"
                    : "bg-memora-surface text-memora-text-muted hover:bg-memora-hover",
                )}
                onClick={() => onSelectPage(pageNumber)}
              >
                {pageNumber}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

interface PptxInspectorProps {
  slide: ParsedPptxSlide | null;
  totalSlides: number;
  onSelectSlide: (slideNumber: number) => void;
}

function PptxInspector({ slide, totalSlides, onSelectSlide }: PptxInspectorProps) {
  if (!slide) {
    return (
      <div className="flex min-h-40 items-center justify-center rounded-2xl border border-dashed border-memora-border-soft px-5 text-center text-xs leading-5 text-memora-text-soft">
        Parse a PPTX to inspect its slide text, notes, and embedded images.
      </div>
    );
  }
  return (
    <section className="rounded-2xl border border-memora-border bg-memora-surface-soft p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-memora-text">Slide {slide.slideNumber}</h3>
          <p className="mt-1 text-xs text-memora-text-soft">PPTX viewer active</p>
        </div>
        <span className="rounded-full bg-memora-olive-faint px-2.5 py-1 text-[10px] font-semibold text-memora-olive-strong">
          PPTX
        </span>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-2 border-t border-memora-border pt-3 text-[11px]">
        <div>
          <dt className="text-memora-text-soft">Extracted text</dt>
          <dd className="mt-0.5 font-medium text-memora-text">
            {slide.text.length.toLocaleString()} chars
          </dd>
        </div>
        <div>
          <dt className="text-memora-text-soft">Embedded images</dt>
          <dd className="mt-0.5 font-medium text-memora-text">
            {slide.imageAttachmentNames.length}
          </dd>
        </div>
        <div>
          <dt className="text-memora-text-soft">Speaker notes</dt>
          <dd className="mt-0.5 font-medium text-memora-text">{slide.notes.length}</dd>
        </div>
        <div>
          <dt className="text-memora-text-soft">Comments</dt>
          <dd className="mt-0.5 font-medium text-memora-text">{slide.comments.length}</dd>
        </div>
      </dl>
      {totalSlides > 1 ? (
        <div className="mt-4 border-t border-memora-border pt-3">
          <p className="text-[11px] font-medium text-memora-text-soft">Slides</p>
          <div className="mt-2 flex max-h-24 flex-wrap gap-1.5 overflow-y-auto pr-1">
            {Array.from({ length: totalSlides }, (_, index) => index + 1).map((slideNumber) => (
              <button
                key={slideNumber}
                type="button"
                aria-pressed={slideNumber === slide.slideNumber}
                className={cn(
                  "size-7 rounded-lg text-[11px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-memora-olive-soft",
                  slideNumber === slide.slideNumber
                    ? "bg-memora-olive text-white"
                    : "bg-memora-surface text-memora-text-muted hover:bg-memora-hover",
                )}
                onClick={() => onSelectSlide(slideNumber)}
              >
                {slideNumber}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function PptxImageThumbnail({ image }: { image: ParsedPptxImage }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const nextUrl = URL.createObjectURL(image.file);
    setUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [image.file]);

  if (!url)
    return <div className="aspect-video animate-pulse rounded-xl bg-memora-surface-muted" />;
  return (
    <img
      src={url}
      alt={image.altText ?? image.name}
      className="aspect-video w-full rounded-xl object-contain"
    />
  );
}

interface PptxParsedContentProps {
  slide: ParsedPptxSlide | null;
  images: ParsedPptxImage[];
  isRunning: boolean;
  onRunImageOcr: (image: ParsedPptxImage) => void;
}

function PptxParsedContent({ slide, images, isRunning, onRunImageOcr }: PptxParsedContentProps) {
  if (!slide) {
    return (
      <div className="flex min-h-[300px] items-center justify-center text-center text-sm text-memora-text-soft">
        Select a slide to inspect its parsed content.
      </div>
    );
  }
  const slideImages = images.filter((image) => slide.imageAttachmentNames.includes(image.name));
  return (
    <div className="space-y-6">
      <section>
        <p className="text-xs font-semibold text-memora-text-muted">
          Slide {slide.slideNumber} text
        </p>
        <pre className="mt-3 whitespace-pre-wrap text-sm leading-7 text-memora-text-muted">
          {slide.text || "No text was extracted from this slide."}
        </pre>
      </section>
      {slide.notes.length ? (
        <section className="rounded-2xl border border-memora-border bg-memora-surface-soft p-4">
          <p className="text-xs font-semibold text-memora-text-muted">Speaker notes</p>
          <pre className="mt-3 whitespace-pre-wrap text-sm leading-6 text-memora-text-muted">
            {slide.notes.join("\n\n")}
          </pre>
        </section>
      ) : null}
      {slide.comments.length ? (
        <section className="rounded-2xl border border-memora-border bg-memora-surface-soft p-4">
          <p className="text-xs font-semibold text-memora-text-muted">Comments</p>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-memora-text-muted">
            {slide.comments.map((comment) => (
              <li key={comment}>{comment}</li>
            ))}
          </ul>
        </section>
      ) : null}
      {slideImages.length ? (
        <section>
          <p className="text-xs font-semibold text-memora-text-muted">Embedded images</p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {slideImages.map((image) => (
              <article
                key={image.name}
                className="overflow-hidden rounded-2xl border border-memora-border bg-memora-surface-soft p-3"
              >
                <PptxImageThumbnail image={image} />
                <div className="mt-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p
                      className="truncate text-xs font-semibold text-memora-text"
                      title={image.name}
                    >
                      {image.name}
                    </p>
                    <p className="mt-1 text-[11px] text-memora-text-soft">{image.mimeType}</p>
                  </div>
                  <Button
                    onClick={() => onRunImageOcr(image)}
                    disabled={isRunning}
                    className="shrink-0 rounded-lg border border-memora-border bg-memora-surface px-2 py-1.5 text-[11px] font-semibold text-memora-text-muted disabled:opacity-45"
                  >
                    {image.ocr ? "Run again" : "Run OCR"}
                  </Button>
                </div>
                {image.ocr ? (
                  <pre className="mt-3 max-h-28 overflow-auto whitespace-pre-wrap rounded-xl bg-memora-surface p-3 text-[11px] leading-5 text-memora-text-muted">
                    {image.ocr.markdown || "No text was recognised from this image."}
                  </pre>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function PptxMarkdownPreview({
  document,
}: {
  document: Extract<ParsedDocument, { kind: "pptx" }>;
}) {
  if (!document.markdown) {
    return (
      <p className="text-sm leading-6 text-memora-warning-text">
        Markdown conversion did not return any content for this presentation.
      </p>
    );
  }

  return (
    <div>
      <div className="border-b border-memora-border pb-4">
        <p className="text-sm font-semibold text-memora-text">PPTX converted to Markdown</p>
        <p className="mt-1 text-xs leading-5 text-memora-text-soft">
          Semantic Markdown generated locally from the parsed slide model, including speaker notes.
        </p>
      </div>
      <Streamdown
        className={`${MEMORA_STREAMDOWN_CLASS_NAME} mt-5`}
        controls={MEMORA_STREAMDOWN_CONTROLS}
        plugins={{ ...MEMORA_STREAMDOWN_PLUGINS }}
        shikiTheme={MEMORA_STREAMDOWN_THEME}
      >
        {document.markdown}
      </Streamdown>
    </div>
  );
}

export default function DocumentParsing() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ParsedDocument | null>(null);
  const [progress, setProgress] = useState<DocumentParseProgress | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPageNumber, setSelectedPageNumber] = useState(1);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const ocrSessionRef = useRef<ImageDocumentPipelineSession | null>(null);

  if (!ocrSessionRef.current) {
    ocrSessionRef.current = new ImageDocumentPipelineSession(
      (ocrProgress: ImageDocumentPipelineProgress) => {
        setProgress({ stage: "ocr", label: ocrProgress.label });
      },
    );
  }

  useEffect(() => {
    if (!file || getSupportedDocumentKind(file) !== "pdf") {
      setPdfUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPdfUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => () => void ocrSessionRef.current?.dispose(), []);

  const selectFile = useCallback((nextFile: File | null) => {
    if (!nextFile) return;
    if (!getSupportedDocumentKind(nextFile)) {
      setError(
        "Choose a PDF, DOCX, or PPTX file. Legacy .doc files are not supported in this browser demo.",
      );
      return;
    }
    setFile(nextFile);
    setResult(null);
    setSelectedPageNumber(1);
    setProgress(null);
    setError(null);
  }, []);

  const handleRun = useCallback(async () => {
    if (!file || !ocrSessionRef.current) return;
    setIsRunning(true);
    setResult(null);
    setError(null);
    setSelectedPageNumber(1);
    try {
      const parsed = await parseDocumentFile(file, {
        onProgress: setProgress,
        runOcrPage: async (pageFile) => {
          const ocrResult = await ocrSessionRef.current!.run(pageFile);
          return {
            markdown: ocrResult.markdown,
            blockCount: ocrResult.blocks.length,
            warnings: ocrResult.warnings,
            elapsedMs: ocrResult.timings.totalMs,
          };
        },
      });
      setResult(parsed);
    } catch (reason) {
      setError(getDocumentParseErrorMessage(reason));
    } finally {
      setIsRunning(false);
      setProgress(null);
    }
  }, [file]);

  const handleReleaseOcr = useCallback(async () => {
    if (isRunning || !ocrSessionRef.current) return;
    await ocrSessionRef.current.dispose();
    setResult(null);
    setSelectedPageNumber(1);
  }, [isRunning]);

  const handleCopy = useCallback(async () => {
    if (!result?.text) return;
    await navigator.clipboard.writeText(result.text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }, [result]);

  const selectedPage = useMemo(
    () =>
      result?.kind === "pdf"
        ? (result.pages.find((page) => page.pageNumber === selectedPageNumber) ??
          result.pages[0] ??
          null)
        : null,
    [result, selectedPageNumber],
  );
  const selectedPptxSlide = useMemo(
    () =>
      result?.kind === "pptx"
        ? (result.slides.find((slide) => slide.slideNumber === selectedPageNumber) ??
          result.slides[0] ??
          null)
        : null,
    [result, selectedPageNumber],
  );
  const hasOcrPages = result?.kind === "pdf" && result.pages.some((page) => page.source === "ocr");
  const hasPptxOcrImages = result?.kind === "pptx" && result.images.some((image) => image.ocr);

  const handleRunPptxImageOcr = useCallback(
    async (image: ParsedPptxImage) => {
      if (!ocrSessionRef.current || isRunning) return;
      setIsRunning(true);
      setError(null);
      setProgress({ stage: "ocr", label: `Running OCR for ${image.name}` });
      try {
        const ocrResult = await ocrSessionRef.current.run(image.file);
        const ocr = {
          markdown: ocrResult.markdown,
          blockCount: ocrResult.blocks.length,
          warnings: ocrResult.warnings,
          elapsedMs: ocrResult.timings.totalMs,
        };
        setResult((current) => {
          if (!current || current.kind !== "pptx") return current;
          return {
            ...current,
            images: current.images.map((currentImage) =>
              currentImage.name === image.name ? { ...currentImage, ocr } : currentImage,
            ),
          };
        });
      } catch (reason) {
        setError(getDocumentParseErrorMessage(reason));
      } finally {
        setIsRunning(false);
        setProgress(null);
      }
    },
    [isRunning],
  );

  const sourceData = useMemo(() => {
    if (result?.kind !== "pptx") return result;
    const { viewerContent: _viewerContent, ...sourceResult } = result;
    return {
      ...sourceResult,
      images: result.images.map(({ file: imageFile, ...image }) => ({
        ...image,
        fileSize: imageFile.size,
      })),
    };
  }, [result]);

  return (
    <div className="space-y-7">
      <div className="grid gap-7 xl:grid-cols-[minmax(460px,1.1fr)_minmax(380px,0.9fr)]">
        <section className="overflow-hidden rounded-[28px] border border-memora-border bg-memora-surface shadow-sm-soft">
          <div className="flex flex-wrap items-end justify-between gap-4 border-b border-memora-border px-6 py-5">
            <div>
              <h2 className="font-serif text-2xl font-medium tracking-tight text-memora-text-strong">
                Parse and preview a document
              </h2>
              <p className="mt-1.5 text-sm text-memora-text-muted">
                PDFs, DOCX, and PPTX stay in this browser; OCR runs only when needed.
              </p>
            </div>
            {result ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-memora-border bg-memora-surface-muted px-3 py-1.5 text-[11px] font-medium text-memora-text-muted">
                <CheckCircleIcon weight="fill" className="size-3.5 text-memora-olive" />
                Parsed locally
              </span>
            ) : null}
            <label
              htmlFor={DOCUMENT_FILE_INPUT_ID}
              className="cursor-pointer rounded-xl border border-memora-border bg-memora-surface px-3 py-2 text-xs font-semibold text-memora-text-muted transition-colors hover:bg-memora-surface-muted focus-within:ring-2 focus-within:ring-memora-olive-soft"
            >
              Choose file
            </label>
          </div>
          <div className="p-5">
            <DocumentPreview
              file={file}
              result={result}
              pdfUrl={pdfUrl}
              selectedPage={selectedPage}
              selectedPptxSlide={selectedPptxSlide}
              isRunning={isRunning}
              onSelectFile={selectFile}
              onPptxSlideChange={setSelectedPageNumber}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-memora-border px-6 py-5">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-memora-text">
                {file?.name ?? "No document selected"}
              </p>
              <p className="mt-0.5 text-xs text-memora-text-soft">
                {file
                  ? `${getSupportedDocumentKind(file)?.toUpperCase()} · ${formatBytes(file.size)}`
                  : "PDF, DOCX, or PPTX"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={handleReleaseOcr}
                disabled={isRunning}
                title="Release local OCR models"
                className="flex size-10 items-center justify-center rounded-xl border border-memora-border bg-memora-surface text-memora-text-muted transition-colors hover:bg-memora-surface-muted disabled:opacity-50"
              >
                <ArrowClockwiseIcon className="size-4" />
              </Button>
              <Button
                onClick={handleRun}
                disabled={!file || isRunning}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-memora-olive px-4 text-sm font-semibold text-white transition-colors hover:bg-memora-olive-strong disabled:cursor-not-allowed disabled:opacity-45"
              >
                <PlayIcon weight="fill" className="size-3.5" />
                {isRunning ? "Parsing…" : "Parse document"}
              </Button>
            </div>
          </div>
        </section>

        <div className="space-y-7">
          {result?.kind === "pptx" ? (
            <PptxInspector
              slide={selectedPptxSlide}
              totalSlides={result.slides.length}
              onSelectSlide={setSelectedPageNumber}
            />
          ) : (
            <PageInspector
              page={selectedPage}
              totalPages={result?.kind === "pdf" ? result.pages.length : 0}
              onSelectPage={setSelectedPageNumber}
            />
          )}

          <section className="rounded-[28px] border border-memora-border bg-memora-surface p-6 shadow-sm-soft">
            <h2 className="font-serif text-2xl font-medium tracking-tight text-memora-text-strong">
              Processing status
            </h2>
            {progress ? (
              <div className="mt-5 rounded-2xl bg-memora-surface-muted p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-memora-text-muted">
                  <span className="size-2 shrink-0 animate-pulse rounded-full bg-memora-olive" />
                  {progress.label}
                </div>
                {progress.current && progress.total ? (
                  <p className="mt-2 text-xs text-memora-text-soft">
                    Page {progress.current} of {progress.total}
                  </p>
                ) : null}
              </div>
            ) : result ? (
              <dl className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl bg-memora-surface-soft p-3">
                  <dt className="text-[11px] font-medium text-memora-text-soft">Total time</dt>
                  <dd className="mt-1 text-sm font-semibold text-memora-text">
                    {formatMilliseconds(result.elapsedMs)}
                  </dd>
                </div>
                <div className="rounded-2xl bg-memora-surface-soft p-3">
                  <dt className="text-[11px] font-medium text-memora-text-soft">
                    {result.kind === "pdf"
                      ? "Pages"
                      : result.kind === "pptx"
                        ? "Slides"
                        : "Extracted text"}
                  </dt>
                  <dd className="mt-1 text-sm font-semibold text-memora-text">
                    {result.kind === "pdf"
                      ? result.pages.length
                      : result.kind === "pptx"
                        ? result.slides.length
                        : `${result.text.length.toLocaleString()} chars`}
                  </dd>
                </div>
                {result.kind === "pdf" ? (
                  <div className="rounded-2xl bg-memora-surface-soft p-3">
                    <dt className="text-[11px] font-medium text-memora-text-soft">OCR fallback</dt>
                    <dd className="mt-1 text-sm font-semibold text-memora-text">
                      {result.pages.filter((page) => page.source === "ocr").length} pages
                    </dd>
                  </div>
                ) : null}
                {result.kind === "pptx" ? (
                  <div className="rounded-2xl bg-memora-surface-soft p-3">
                    <dt className="text-[11px] font-medium text-memora-text-soft">
                      Embedded images
                    </dt>
                    <dd className="mt-1 text-sm font-semibold text-memora-text">
                      {result.images.length}
                    </dd>
                  </div>
                ) : null}
                {result.kind === "docx" ? (
                  <div className="rounded-2xl bg-memora-surface-soft p-3">
                    <dt className="text-[11px] font-medium text-memora-text-soft">Formula nodes</dt>
                    <dd className="mt-1 text-sm font-semibold text-memora-text">
                      {result.docxPreviewParser.mathExpressionCount}
                    </dd>
                  </div>
                ) : null}
              </dl>
            ) : (
              <p className="mt-4 text-sm leading-6 text-memora-text-soft">
                Select a local document, then run the parser to inspect the processing path.
              </p>
            )}
            {error ? (
              <div className="mt-4 flex gap-3 rounded-2xl border border-memora-warning-border bg-memora-warning-surface p-4 text-sm text-memora-warning-text">
                <WarningCircleIcon className="mt-0.5 size-4 shrink-0" />
                <p className="min-w-0 break-words">{error}</p>
              </div>
            ) : null}
            {result?.warnings.length ? (
              <div className="mt-4 rounded-2xl border border-memora-warning-border bg-memora-warning-surface p-4">
                <div className="flex gap-2 text-sm font-medium text-memora-warning-text">
                  <WarningCircleIcon className="mt-0.5 size-4 shrink-0" />
                  Parser notes
                </div>
                <ul className="mt-2 space-y-1.5 pl-6 text-xs leading-5 text-memora-warning-text">
                  {result.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        </div>
      </div>

      <section className="overflow-hidden rounded-[28px] border border-memora-border bg-memora-surface shadow-sm-soft">
        <Tabs.Root defaultValue="parsed">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-memora-border px-4 py-3">
            <Tabs.List className="flex gap-1 rounded-xl bg-memora-surface-muted p-1">
              <Tabs.Tab
                value="parsed"
                className="flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-memora-text-muted outline-none data-active:bg-memora-surface data-active:text-memora-text data-active:shadow-sm"
              >
                <FileImageIcon className="size-3.5" />
                Parsed content
              </Tabs.Tab>
              <Tabs.Tab
                value="source"
                className="flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-memora-text-muted outline-none data-active:bg-memora-surface data-active:text-memora-text data-active:shadow-sm"
              >
                <CodeIcon className="size-3.5" />
                Source data
              </Tabs.Tab>
              {result?.kind === "docx" ? (
                <Tabs.Tab
                  value="comparison"
                  className="flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-memora-text-muted outline-none data-active:bg-memora-surface data-active:text-memora-text data-active:shadow-sm"
                >
                  Parser comparison
                </Tabs.Tab>
              ) : null}
              {result?.kind === "pptx" ? (
                <Tabs.Tab
                  value="pptx-markdown"
                  className="flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-memora-text-muted outline-none data-active:bg-memora-surface data-active:text-memora-text data-active:shadow-sm"
                >
                  PPTX Markdown
                </Tabs.Tab>
              ) : null}
              {result?.kind === "docx" ? (
                <Tabs.Tab
                  value="docx-preview-content"
                  className="flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-memora-text-muted outline-none data-active:bg-memora-surface data-active:text-memora-text data-active:shadow-sm"
                >
                  docx-preview content
                </Tabs.Tab>
              ) : null}
              {result?.kind === "docx" ? (
                <Tabs.Tab
                  value="docx-preview-markdown"
                  className="flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-memora-text-muted outline-none data-active:bg-memora-surface data-active:text-memora-text data-active:shadow-sm"
                >
                  docx-preview Markdown
                </Tabs.Tab>
              ) : null}
            </Tabs.List>
            <Button
              onClick={handleCopy}
              disabled={!result?.text}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-memora-border px-2.5 text-xs font-semibold text-memora-text-muted disabled:opacity-40"
            >
              <ClipboardIcon className="size-3.5" />
              {copied ? "Copied" : "Copy text"}
            </Button>
          </div>
          <Tabs.Panel value="parsed" className="min-h-[360px] p-6 outline-none [[hidden]]:hidden">
            {selectedPage?.source === "ocr" && selectedPage.text ? (
              <Streamdown
                className={MEMORA_STREAMDOWN_CLASS_NAME}
                controls={MEMORA_STREAMDOWN_CONTROLS}
                plugins={{ ...MEMORA_STREAMDOWN_PLUGINS }}
                shikiTheme={MEMORA_STREAMDOWN_THEME}
              >
                {selectedPage.text}
              </Streamdown>
            ) : result?.kind === "pdf" && selectedPage ? (
              <pre className="whitespace-pre-wrap text-sm leading-7 text-memora-text-muted">
                {selectedPage.text || "No usable text was returned for this page."}
              </pre>
            ) : result?.kind === "docx" ? (
              <pre className="whitespace-pre-wrap text-sm leading-7 text-memora-text-muted">
                {result.text || "The document did not contain extractable text."}
              </pre>
            ) : result?.kind === "pptx" ? (
              <PptxParsedContent
                slide={selectedPptxSlide}
                images={result.images}
                isRunning={isRunning}
                onRunImageOcr={handleRunPptxImageOcr}
              />
            ) : (
              <div className="flex min-h-[300px] items-center justify-center text-center text-sm text-memora-text-soft">
                <div>
                  <ScanIcon className="mx-auto size-5" />
                  <p className="mt-3">Parsed document content will appear here.</p>
                </div>
              </div>
            )}
          </Tabs.Panel>
          <Tabs.Panel value="source" className="min-h-[360px] outline-none [[hidden]]:hidden">
            <pre className="min-h-[360px] overflow-auto whitespace-pre-wrap bg-memora-surface-soft p-6 text-xs leading-6 text-memora-text-muted">
              {sourceData
                ? JSON.stringify(sourceData, null, 2)
                : "Run the parser to inspect page metadata, text items, and OCR routing."}
            </pre>
          </Tabs.Panel>
          <Tabs.Panel
            value="comparison"
            className="min-h-[360px] p-6 outline-none [[hidden]]:hidden"
          >
            {result?.kind === "docx" ? (
              <DocxParserComparison document={result} />
            ) : (
              <p className="text-sm text-memora-text-soft">
                Select a DOCX file to compare its parsers.
              </p>
            )}
          </Tabs.Panel>
          <Tabs.Panel
            value="docx-preview-content"
            className="min-h-[360px] p-6 outline-none [[hidden]]:hidden"
          >
            {result?.kind === "docx" ? (
              <DocxPreviewParsedContent document={result} />
            ) : (
              <p className="text-sm text-memora-text-soft">
                Select a DOCX file to inspect docx-preview parsed content.
              </p>
            )}
          </Tabs.Panel>
          <Tabs.Panel
            value="docx-preview-markdown"
            className="min-h-[360px] p-6 outline-none [[hidden]]:hidden"
          >
            {result?.kind === "docx" ? (
              <DocxPreviewMarkdown document={result} />
            ) : (
              <p className="text-sm text-memora-text-soft">
                Select a DOCX file to inspect docx-preview Markdown.
              </p>
            )}
          </Tabs.Panel>
          <Tabs.Panel
            value="pptx-markdown"
            className="min-h-[360px] p-6 outline-none [[hidden]]:hidden"
          >
            {result?.kind === "pptx" ? (
              <PptxMarkdownPreview document={result} />
            ) : (
              <p className="text-sm text-memora-text-soft">
                Select a PPTX file to inspect its Markdown conversion.
              </p>
            )}
          </Tabs.Panel>
        </Tabs.Root>
      </section>

      <div className="flex gap-3 rounded-2xl border border-memora-border bg-memora-surface-soft px-4 py-3 text-xs leading-5 text-memora-text-soft">
        <WarningCircleIcon className="mt-0.5 size-4 shrink-0" />
        <p>
          PDF.js, Mammoth, docx-preview, pptx-viewer-core, and pptx-react-viewer run in this
          browser. PDF pages without a usable text layer are rendered locally and sent only to the
          existing PP-DocLayoutV3, PP-OCRv6, and Texo pipeline. DOCX runs Mammoth text extraction
          beside an experimental docx-preview.parseAsync() structure inspection and Markdown
          conversion. PPTX uses the core parser for slide, notes, comments, and image extraction,
          while the React viewer renders the original local file; only a selected embedded image is
          sent to local OCR. {hasOcrPages ? "This document includes OCR-derived pages." : ""}
          {hasPptxOcrImages ? " This presentation includes OCR-derived image text." : ""}
        </p>
      </div>
    </div>
  );
}
