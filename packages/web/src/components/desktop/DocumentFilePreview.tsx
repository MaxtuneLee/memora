import { lazy, Suspense, useEffect, useRef, useState } from "react";
import * as stylex from "@stylexjs/stylex";

import { getSupportedDocumentKind } from "@/lib/playground/documentParsing";

const styles = stylex.create({
  docx: {
    backgroundColor: "#f4f4f5",
    borderRadius: 8,
    height: "100%",
    overflow: "auto",
    padding: 12,
  },
  docxBody: { minHeight: "100%" },
  message: {
    alignItems: "center",
    color: "#71717a",
    display: "flex",
    fontSize: 14,
    height: "100%",
    justifyContent: "center",
  },
  error: {
    alignItems: "center",
    color: "#dc2626",
    display: "flex",
    fontSize: 14,
    height: "100%",
    justifyContent: "center",
    paddingInline: 24,
    textAlign: "center",
  },
  pdf: { backgroundColor: "#fff", borderRadius: 8, height: "100%", width: "100%" },
});

const PptxDocumentPreview = lazy(() =>
  import("./PptxDocumentPreview").then(({ PptxDocumentPreview: Preview }) => ({
    default: Preview,
  })),
);

function DocxPreview({ file }: { file: File }) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const stylesRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const body = bodyRef.current;
    const styles = stylesRef.current;
    if (!body || !styles) return;
    let disposed = false;
    body.replaceChildren();
    styles.replaceChildren();
    setError(null);
    void (async () => {
      try {
        const { renderAsync } = await import("docx-preview");
        if (disposed) return;
        await renderAsync(file, body, styles, {
          breakPages: true,
          className: "memora-docx-preview",
          ignoreHeight: true,
          ignoreWidth: true,
          renderAltChunks: false,
          renderComments: false,
          useBase64URL: true,
        });
      } catch (reason) {
        if (!disposed) setError(reason instanceof Error ? reason.message : "DOCX preview failed.");
      }
    })();
    return () => {
      disposed = true;
      body.replaceChildren();
      styles.replaceChildren();
    };
  }, [file]);

  if (error) return <PreviewError message={`DOCX preview could not be rendered: ${error}`} />;
  return (
    <div {...stylex.props(styles.docx)}>
      <div ref={stylesRef} />
      <div ref={bodyRef} {...stylex.props(styles.docxBody)} />
    </div>
  );
}

function PreviewMessage({ children }: { children: string }) {
  return <div {...stylex.props(styles.message)}>{children}</div>;
}

function PreviewError({ message }: { message: string }) {
  return <div {...stylex.props(styles.error)}>{message}</div>;
}

export function DocumentFilePreview({ file }: { file: File }) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const kind = getSupportedDocumentKind(file);

  useEffect(() => {
    setError(null);
    setPdfUrl(null);
    if (kind === "pdf") {
      const url = URL.createObjectURL(file);
      setPdfUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    return;
  }, [file, kind]);

  if (error) return <PreviewError message={error} />;
  if (kind === "pdf" && pdfUrl) {
    return <iframe title={`${file.name} preview`} src={pdfUrl} {...stylex.props(styles.pdf)} />;
  }
  if (kind === "docx") return <DocxPreview file={file} />;
  if (kind === "pptx") {
    return (
      <Suspense fallback={<PreviewMessage>Preparing slide preview…</PreviewMessage>}>
        <PptxDocumentPreview file={file} />
      </Suspense>
    );
  }
  if (kind) return <PreviewMessage>Preparing preview…</PreviewMessage>;
  return <PreviewError message="This document format is not supported for preview yet." />;
}
