import { createInstance } from "i18next";
import { useEffect, useRef, useState } from "react";
import {
  SlideCanvas,
  type PowerPointViewerHandle,
  useViewerBuildingBlocks,
} from "pptx-react-viewer";
import { keyToLabel, translationsEn } from "pptx-react-viewer/i18n";
import "pptx-react-viewer/styles";
import { I18nextProvider, initReactI18next } from "react-i18next";

const pptxViewerI18n = createInstance();

void pptxViewerI18n.use(initReactI18next).init({
  lng: "en",
  fallbackLng: "en",
  resources: { en: { translation: translationsEn } },
  interpolation: { escapeValue: false },
  parseMissingKeyHandler: keyToLabel,
  react: { useSuspense: false },
});

function PptxSlideCanvas({ content }: { content: Uint8Array }) {
  const handleRef = useRef<PowerPointViewerHandle>(null);
  const [activeSlideNumber, setActiveSlideNumber] = useState(1);
  const { canvasProps, error, loading } = useViewerBuildingBlocks({
    content,
    canEdit: false,
    autosaveEnabled: false,
    handle: handleRef,
    onActiveSlideChange: (slideIndex) => setActiveSlideNumber(slideIndex + 1),
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

export function PptxDocumentPreview({ file }: { file: File }) {
  const [content, setContent] = useState<Uint8Array | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    setContent(null);
    setError(null);
    void file
      .arrayBuffer()
      .then((buffer) => {
        if (!disposed) setContent(new Uint8Array(buffer));
      })
      .catch((reason) => {
        if (!disposed) {
          setError(reason instanceof Error ? reason.message : "Unable to read this PPTX file.");
        }
      });
    return () => {
      disposed = true;
    };
  }, [file]);

  return (
    <div className="h-full w-full overflow-hidden rounded-lg border border-memora-border bg-[#191919]">
      <I18nextProvider i18n={pptxViewerI18n}>
        {error ? (
          <div className="flex h-full items-center justify-center px-8 text-center text-sm leading-6 text-red-200">
            PPTX preview could not be rendered: {error}
          </div>
        ) : content ? (
          <PptxSlideCanvas content={content} />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-white/70">
            Preparing slide preview…
          </div>
        )}
      </I18nextProvider>
    </div>
  );
}
