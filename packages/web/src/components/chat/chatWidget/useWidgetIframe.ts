import { useCallback, useEffect, useRef, useState } from "react";

export const useWidgetIframe = () => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const iframeDocumentRef = useRef<Document | null>(null);
  const userStyleRef = useRef<HTMLStyleElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [iframeReady, setIframeReady] = useState(false);
  const [iframeHeight, setIframeHeight] = useState(1);
  const [hasRuntimeDom, setHasRuntimeDom] = useState(false);

  const syncIframeHeight = useCallback(() => {
    const iframe = iframeRef.current;
    const iframeDocument = iframeDocumentRef.current;
    const content = contentRef.current;
    if (!iframe || !iframeDocument || !content) {
      return;
    }

    const body = iframeDocument.body;
    const documentElement = iframeDocument.documentElement;
    const nextHeight = Math.max(
      1,
      content.scrollHeight,
      content.offsetHeight,
      body?.scrollHeight ?? 0,
      body?.offsetHeight ?? 0,
      documentElement?.scrollHeight ?? 0,
      documentElement?.offsetHeight ?? 0,
    );

    setIframeHeight((currentHeight) => {
      return currentHeight === nextHeight ? currentHeight : nextHeight;
    });
  }, []);

  const bindIframeDocument = useCallback(() => {
    const iframe = iframeRef.current;
    const iframeDocument = iframe?.contentDocument;
    if (!iframe || !iframeDocument) {
      return;
    }

    iframeDocumentRef.current = iframeDocument;
    userStyleRef.current = iframeDocument.querySelector<HTMLStyleElement>(
      "[data-widget-user-style]",
    );
    contentRef.current = iframeDocument.querySelector<HTMLDivElement>("[data-widget-content]");
    setIframeReady(Boolean(userStyleRef.current && contentRef.current));
    queueMicrotask(() => {
      syncIframeHeight();
    });
  }, [syncIframeHeight]);

  useEffect(() => {
    bindIframeDocument();
  }, [bindIframeDocument]);

  useEffect(() => {
    const content = contentRef.current;
    const iframeDocument = iframeDocumentRef.current;
    const iframeWindow = iframeDocument?.defaultView;
    if (!iframeReady || !content || !iframeDocument || !iframeWindow) {
      return;
    }

    const syncRuntimeDom = () => {
      const nextHasRuntimeDom =
        content.childElementCount > 0 || (content.textContent?.trim().length ?? 0) !== 0;
      setHasRuntimeDom(nextHasRuntimeDom);
      syncIframeHeight();
    };

    syncRuntimeDom();

    const observer = new iframeWindow.MutationObserver(() => {
      syncRuntimeDom();
    });
    observer.observe(content, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    const resizeObserver = new iframeWindow.ResizeObserver(() => {
      syncIframeHeight();
    });
    resizeObserver.observe(content);
    resizeObserver.observe(iframeDocument.body);
    resizeObserver.observe(iframeDocument.documentElement);

    return () => {
      observer.disconnect();
      resizeObserver.disconnect();
    };
  }, [iframeReady, syncIframeHeight]);

  return {
    iframeRef,
    iframeDocumentRef,
    userStyleRef,
    contentRef,
    iframeReady,
    iframeHeight,
    hasRuntimeDom,
    bindIframeDocument,
    syncIframeHeight,
  };
};
