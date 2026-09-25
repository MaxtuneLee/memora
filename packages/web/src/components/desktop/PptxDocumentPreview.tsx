import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react";
import * as stylex from "@stylexjs/stylex";
import { createInstance } from "i18next";
import { useEffect, useRef, useState } from "react";
import {
  SlideCanvas,
  type PowerPointViewerHandle,
  useViewerBuildingBlocks,
} from "pptx-react-viewer";
import { keyToLabel, translationsEn } from "pptx-react-viewer/i18n";
import "@/styles/pptxViewer.css";
import { I18nextProvider, initReactI18next } from "react-i18next";

import { tokens } from "../../styles/stylex.stylex";

const styles = stylex.create({
  status: {
    alignItems: "center",
    color: tokens.textMuted,
    display: "flex",
    fontSize: "0.875rem",
    height: "100%",
    justifyContent: "center",
    lineHeight: "1.25rem",
  },
  error: {
    color: tokens.dangerText,
    lineHeight: "1.5rem",
    paddingInline: "2rem",
    textAlign: "center",
  },
  canvasLayout: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    minHeight: 0,
  },
  canvas: {
    display: "flex",
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
  },
  // Slide-viewer chrome (toolbar, buttons, picker) follows the application theme; only the
  // rendered slide pixels below (SlideCanvas, third-party) keep their own intrinsic colors.
  controls: {
    alignItems: "center",
    backgroundColor: tokens.surfaceMuted,
    borderTopColor: tokens.border,
    borderTopStyle: "solid",
    borderTopWidth: 1,
    color: tokens.textMuted,
    display: "flex",
    flexShrink: 0,
    gap: "0.5rem",
    height: "2.75rem",
    justifyContent: "center",
    paddingInline: "0.75rem",
  },
  navigationButton: {
    alignItems: "center",
    borderRadius: "0.375rem",
    color: {
      default: "inherit",
      ":hover": tokens.textStrong,
    },
    display: "inline-flex",
    height: "1.75rem",
    justifyContent: "center",
    transitionDuration: "150ms",
    transitionProperty: "color, background-color, opacity",
    width: "1.75rem",
    ":hover": {
      backgroundColor: tokens.hover,
    },
    ":focus-visible": {
      boxShadow: `0 0 0 2px ${tokens.focusRing}`,
      outline: "none",
    },
    ":disabled": {
      cursor: "not-allowed",
      opacity: 0.3,
    },
  },
  icon: {
    height: "1rem",
    width: "1rem",
  },
  slidePicker: {
    alignItems: "center",
    display: "flex",
    fontSize: "0.75rem",
    fontVariantNumeric: "tabular-nums",
    gap: "0.375rem",
    lineHeight: "1rem",
  },
  visuallyHidden: {
    borderWidth: 0,
    clip: "rect(0, 0, 0, 0)",
    height: 1,
    margin: -1,
    overflow: "hidden",
    padding: 0,
    position: "absolute",
    whiteSpace: "nowrap",
    width: 1,
  },
  select: {
    backgroundColor: tokens.surface,
    borderColor: tokens.border,
    borderRadius: "0.375rem",
    borderStyle: "solid",
    borderWidth: 1,
    color: tokens.text,
    fontSize: "0.75rem",
    height: "1.75rem",
    lineHeight: "1rem",
    outline: "none",
    paddingInline: "0.5rem",
    ":focus-visible": {
      boxShadow: `0 0 0 2px ${tokens.focusRing}`,
    },
  },
  option: {
    color: tokens.text,
  },
  slideCount: {
    color: tokens.textSoft,
  },
  preview: {
    backgroundColor: tokens.surfaceMuted,
    borderColor: tokens.border,
    borderRadius: "0.5rem",
    borderStyle: "solid",
    borderWidth: 1,
    height: "100%",
    overflow: "hidden",
    width: "100%",
  },
});

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
    return <div {...stylex.props(styles.status)}>Rendering slides…</div>;
  }
  if (error) {
    return (
      <div {...stylex.props(styles.status, styles.error)}>
        PPTX preview could not be rendered: {error}
      </div>
    );
  }
  return (
    <div {...stylex.props(styles.canvasLayout)}>
      <div {...stylex.props(styles.canvas)}>
        <SlideCanvas {...canvasProps} />
      </div>
      <div {...stylex.props(styles.controls)}>
        <button
          type="button"
          aria-label="Previous slide"
          disabled={activeSlideNumber <= 1}
          onClick={goToPreviousSlide}
          {...stylex.props(styles.navigationButton)}
        >
          <CaretLeftIcon {...stylex.props(styles.icon)} weight="bold" />
        </button>
        <label {...stylex.props(styles.slidePicker)}>
          <span {...stylex.props(styles.visuallyHidden)}>Current slide</span>
          <select
            aria-label="Current slide"
            value={activeSlideNumber}
            onChange={(event) => handleRef.current?.goTo(Number(event.target.value) - 1)}
            {...stylex.props(styles.select)}
          >
            {Array.from({ length: slideCount }, (_, index) => index + 1).map((slideNumber) => (
              <option key={slideNumber} value={slideNumber} {...stylex.props(styles.option)}>
                {slideNumber}
              </option>
            ))}
          </select>
          <span {...stylex.props(styles.slideCount)}>of {slideCount}</span>
        </label>
        <button
          type="button"
          aria-label="Next slide"
          disabled={slideCount === 0 || activeSlideNumber >= slideCount}
          onClick={goToNextSlide}
          {...stylex.props(styles.navigationButton)}
        >
          <CaretRightIcon {...stylex.props(styles.icon)} weight="bold" />
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
    <div {...stylex.props(styles.preview)}>
      <I18nextProvider i18n={pptxViewerI18n}>
        {error ? (
          <div {...stylex.props(styles.status, styles.error)}>
            PPTX preview could not be rendered: {error}
          </div>
        ) : content ? (
          <PptxSlideCanvas content={content} />
        ) : (
          <div {...stylex.props(styles.status)}>Preparing slide preview…</div>
        )}
      </I18nextProvider>
    </div>
  );
}
