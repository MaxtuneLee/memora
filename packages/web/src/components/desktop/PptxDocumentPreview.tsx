import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react";
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
  const [slideCount, setSlideCount] = useState(0);
  const { canvasProps, error, loading } = useViewerBuildingBlocks({
    content,
    canEdit: false,
    autosaveEnabled: false,
    handle: handleRef,
    onActiveSlideChange: (slideIndex) => setActiveSlideNumber(slideIndex + 1),
    onSlideCountChange: setSlideCount,
  });

  useEffect(() => {
    setActiveSlideNumber(1);
    setSlideCount(0);
  }, [content]);

  const goToPreviousSlide = () => {
    if (activeSlideNumber <= 1) return;
    handleRef.current?.goPrev();
  };

  const goToNextSlide = () => {
    if (slideCount === 0 || activeSlideNumber >= slideCount) return;
    handleRef.current?.goNext();
  };

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
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <SlideCanvas {...canvasProps} />
      </div>
      <div className="flex h-11 shrink-0 items-center justify-center gap-2 border-t border-white/10 bg-black/25 px-3 text-white/80">
        <button
          type="button"
          aria-label="Previous slide"
          disabled={activeSlideNumber <= 1}
          onClick={goToPreviousSlide}
          className="inline-flex size-7 items-center justify-center rounded-md transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <CaretLeftIcon className="size-4" weight="bold" />
        </button>
        <label className="flex items-center gap-1.5 text-xs tabular-nums">
          <span className="sr-only">Current slide</span>
          <select
            aria-label="Current slide"
            value={activeSlideNumber}
            onChange={(event) => handleRef.current?.goTo(Number(event.target.value) - 1)}
            className="h-7 rounded-md border border-white/10 bg-white/5 px-2 text-xs text-white outline-none focus-visible:ring-2 focus-visible:ring-white/40"
          >
            {Array.from({ length: slideCount }, (_, index) => index + 1).map((slideNumber) => (
              <option key={slideNumber} value={slideNumber} className="text-zinc-900">
                {slideNumber}
              </option>
            ))}
          </select>
          <span className="text-white/55">of {slideCount}</span>
        </label>
        <button
          type="button"
          aria-label="Next slide"
          disabled={slideCount === 0 || activeSlideNumber >= slideCount}
          onClick={goToNextSlide}
          className="inline-flex size-7 items-center justify-center rounded-md transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <CaretRightIcon className="size-4" weight="bold" />
        </button>
      </div>
    </div>
  );
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
