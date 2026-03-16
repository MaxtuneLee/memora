import { motion, useReducedMotion } from "motion/react";

import { cn } from "@/lib/cn";

export type MemoraMascotState =
  | "idle"
  | "listening"
  | "thinking"
  | "speaking"
  | "asleep";

interface MemoraMascotProps {
  state: MemoraMascotState;
  className?: string;
  animated?: boolean;
  decorative?: boolean;
}

const EASE_OUT_QUINT = [0.22, 1, 0.36, 1] as const;
const EASE_IN_OUT = [0.42, 0, 0.58, 1] as const;
const EYE_TRANSFORM_STYLE = {
  transformBox: "fill-box" as const,
  transformOrigin: "center center",
};
const INFINITE_REPEAT = Number.POSITIVE_INFINITY;
const BASE_EYE_STROKE_WIDTH = 8;

export default function MemoraMascot({
  state,
  className,
  animated = true,
  decorative = false,
}: MemoraMascotProps) {
  const prefersReducedMotion = useReducedMotion() ?? false;
  const shouldAnimate = animated && !prefersReducedMotion;
  const bodyMotion = getBodyMotion(state, shouldAnimate);
  const auraMotion = getAuraMotion(state, shouldAnimate);
  const shadowMotion = getShadowMotion(state, shouldAnimate);
  const leftEyeMotion = getEyePresenceMotion(state, shouldAnimate, "left");
  const rightEyeMotion = getEyePresenceMotion(state, shouldAnimate, "right");
  const leftBlinkMotion = getBlinkMotion(state, shouldAnimate, "left");
  const rightBlinkMotion = getBlinkMotion(state, shouldAnimate, "right");
  const leftEyeStrokeMotion = getEyeStrokeWidthMotion(state, shouldAnimate, "left");
  const rightEyeStrokeMotion = getEyeStrokeWidthMotion(state, shouldAnimate, "right");

  return (
    <div
      className={cn(
        "relative isolate inline-flex size-16 shrink-0 items-center justify-center",
        className,
      )}
      aria-hidden={decorative ? true : undefined}
      aria-label={decorative ? undefined : `Memora assistant is ${state}`}
      role={decorative ? undefined : "img"}
    >
      <motion.div
        className={cn(
          "pointer-events-none absolute inset-[16%] rounded-full blur-2xl",
          state === "listening"
            ? "bg-[#879a4f]/20"
            : state === "thinking"
              ? "bg-[#d1b170]/24"
              : state === "speaking"
                ? "bg-[#d69f63]/22"
                : state === "asleep"
                  ? "bg-[#b7aa8b]/12"
                  : "bg-[#c6b38f]/16",
        )}
        animate={auraMotion.animate}
        transition={auraMotion.transition}
      />

      <motion.div
        className="pointer-events-none absolute bottom-[11%] left-1/2 h-[8%] w-[56%] -translate-x-1/2 rounded-full bg-[#54483d]/18 blur-xl"
        animate={shadowMotion.animate}
        transition={shadowMotion.transition}
      />

      <motion.div
        className="relative z-10 size-full"
        animate={bodyMotion.animate}
        transition={bodyMotion.transition}
      >
        <svg
          className="size-full"
          viewBox="0 0 377 382"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M59.507 144.485C77.507 120.985 153.007 17.9851 153.007 17.9851C153.007 17.9851 180.626 63.5048 193.684 97.9843C227.292 67.5148 294.701 30.3705 294.701 30.3705C294.701 30.3705 316.432 125.608 324.505 153.485C332.578 181.362 384.539 229.489 359.726 291.369C334.913 353.249 246.259 378.874 165.507 369.485C93.9204 361.161 33.1334 319.224 14.507 268.985C-4.45795 217.833 41.507 167.985 59.507 144.485Z"
            fill="#16120F"
            stroke="#16120F"
            strokeWidth="20"
            strokeLinecap="round"
          />

          <g transform="translate(114 226) rotate(12)">
            <motion.g
              style={EYE_TRANSFORM_STYLE}
              animate={leftEyeMotion.animate}
              transition={leftEyeMotion.transition}
            >
              <motion.g
                style={EYE_TRANSFORM_STYLE}
                animate={leftBlinkMotion.animate}
                transition={leftBlinkMotion.transition}
              >
                <motion.ellipse
                  cx="0"
                  cy="0"
                  rx="33"
                  ry="78"
                  fill="none"
                  stroke="#FFFAF2"
                  strokeWidth={BASE_EYE_STROKE_WIDTH}
                  style={EYE_TRANSFORM_STYLE}
                  animate={leftEyeStrokeMotion.animate}
                  transition={leftEyeStrokeMotion.transition}
                  strokeLinecap="round"
                />
              </motion.g>
            </motion.g>
          </g>

          <g transform="translate(202 239) rotate(9)">
            <motion.g
              style={EYE_TRANSFORM_STYLE}
              animate={rightEyeMotion.animate}
              transition={rightEyeMotion.transition}
            >
              <motion.g
                style={EYE_TRANSFORM_STYLE}
                animate={rightBlinkMotion.animate}
                transition={rightBlinkMotion.transition}
              >
                <motion.ellipse
                  cx="0"
                  cy="0"
                  rx="33"
                  ry="79"
                  fill="none"
                  stroke="#FFFAF2"
                  strokeWidth={BASE_EYE_STROKE_WIDTH}
                  style={EYE_TRANSFORM_STYLE}
                  animate={rightEyeStrokeMotion.animate}
                  transition={rightEyeStrokeMotion.transition}
                  strokeLinecap="round"
                />
              </motion.g>
            </motion.g>
          </g>
        </svg>
      </motion.div>
    </div>
  );
}

function getBodyMotion(state: MemoraMascotState, animate: boolean) {
  if (!animate) {
    return {
      animate: {
        x: 0,
        y: state === "asleep" ? 5 : 0,
        rotate: 0,
        scale: 1,
        opacity: state === "asleep" ? 0.84 : 1,
      },
    };
  }

  switch (state) {
    case "listening":
      return {
        animate: {
          x: [0, 1, 0],
          y: [0, -6, 0],
          rotate: [-1.4, 0.6, -1.4],
          scale: [1.01, 1.035, 1.01],
          opacity: 1,
        },
        transition: {
          duration: 2.3,
          repeat: INFINITE_REPEAT,
          ease: EASE_OUT_QUINT,
        },
      };
    case "thinking":
      return {
        animate: {
          x: [0, -1.4, 1.4, -0.6, 0],
          y: [0, -2, 0, -3, 0],
          rotate: [-1.8, 1.8, -1.2, 1.4, -1.8],
          scale: [1, 1.018, 0.996, 1.022, 1],
          opacity: 1,
        },
        transition: {
          duration: 3.4,
          repeat: INFINITE_REPEAT,
          ease: EASE_OUT_QUINT,
        },
      };
    case "speaking":
      return {
        animate: {
          x: [0, 0.6, 0, -0.5, 0],
          y: [0, -6, 0, -3, 0],
          rotate: [-0.8, 1.2, -0.4, 1, -0.8],
          scale: [1.01, 1.03, 1, 1.02, 1.01],
          opacity: 1,
        },
        transition: {
          duration: 1.45,
          repeat: INFINITE_REPEAT,
          ease: EASE_OUT_QUINT,
        },
      };
    case "asleep":
      return {
        animate: {
          x: [0, 0.2, 0],
          y: [4, 7, 4],
          rotate: [0, 0.5, 0],
          scale: [0.99, 0.985, 0.99],
          opacity: [0.8, 0.88, 0.8],
        },
        transition: {
          duration: 6.8,
          repeat: INFINITE_REPEAT,
          ease: EASE_OUT_QUINT,
        },
      };
    case "idle":
    default:
      return {
        animate: {
          x: [0, 0.4, 0],
          y: [0, -4, 0],
          rotate: [-0.6, 0.6, -0.6],
          scale: [1, 1.01, 1],
          opacity: 1,
        },
        transition: {
          duration: 4.8,
          repeat: INFINITE_REPEAT,
          ease: EASE_OUT_QUINT,
        },
      };
  }
}

function getAuraMotion(state: MemoraMascotState, animate: boolean) {
  if (!animate) {
    return {
      animate: {
        opacity:
          state === "thinking"
            ? 0.24
            : state === "listening"
              ? 0.18
              : state === "speaking"
                ? 0.2
                : state === "asleep"
                  ? 0.08
                  : 0.12,
        scale:
          state === "thinking"
            ? 1.1
            : state === "speaking"
              ? 1.05
              : state === "listening"
                ? 1.04
                : 0.96,
      },
    };
  }

  switch (state) {
    case "listening":
      return {
        animate: { opacity: [0.1, 0.2, 0.1], scale: [0.98, 1.08, 0.98] },
        transition: {
          duration: 2.4,
          repeat: INFINITE_REPEAT,
          ease: EASE_OUT_QUINT,
        },
      };
    case "thinking":
      return {
        animate: { opacity: [0.12, 0.26, 0.12], scale: [0.96, 1.14, 0.96] },
        transition: {
          duration: 3.2,
          repeat: INFINITE_REPEAT,
          ease: EASE_OUT_QUINT,
        },
      };
    case "speaking":
      return {
        animate: { opacity: [0.14, 0.24, 0.14], scale: [1, 1.09, 1] },
        transition: {
          duration: 1.5,
          repeat: INFINITE_REPEAT,
          ease: EASE_OUT_QUINT,
        },
      };
    case "asleep":
      return {
        animate: { opacity: [0.04, 0.08, 0.04], scale: [0.9, 0.98, 0.9] },
        transition: {
          duration: 6.8,
          repeat: INFINITE_REPEAT,
          ease: EASE_OUT_QUINT,
        },
      };
    case "idle":
    default:
      return {
        animate: { opacity: [0.08, 0.14, 0.08], scale: [0.92, 1.02, 0.92] },
        transition: {
          duration: 4.6,
          repeat: INFINITE_REPEAT,
          ease: EASE_OUT_QUINT,
        },
      };
  }
}

function getShadowMotion(state: MemoraMascotState, animate: boolean) {
  if (!animate) {
    return {
      animate: {
        opacity: state === "asleep" ? 0.2 : 0.18,
        scaleX: state === "speaking" ? 0.92 : 1,
      },
    };
  }

  switch (state) {
    case "listening":
      return {
        animate: { opacity: [0.14, 0.22, 0.14], scaleX: [0.88, 0.98, 0.88] },
        transition: {
          duration: 2.4,
          repeat: INFINITE_REPEAT,
          ease: EASE_OUT_QUINT,
        },
      };
    case "thinking":
      return {
        animate: { opacity: [0.16, 0.24, 0.16], scaleX: [0.9, 1.04, 0.9] },
        transition: {
          duration: 3.2,
          repeat: INFINITE_REPEAT,
          ease: EASE_OUT_QUINT,
        },
      };
    case "speaking":
      return {
        animate: { opacity: [0.16, 0.24, 0.16], scaleX: [0.86, 1.08, 0.9] },
        transition: {
          duration: 1.45,
          repeat: INFINITE_REPEAT,
          ease: EASE_OUT_QUINT,
        },
      };
    case "asleep":
      return {
        animate: { opacity: [0.16, 0.2, 0.16], scaleX: [0.96, 1.02, 0.96] },
        transition: {
          duration: 6.8,
          repeat: INFINITE_REPEAT,
          ease: EASE_OUT_QUINT,
        },
      };
    case "idle":
    default:
      return {
        animate: { opacity: [0.16, 0.22, 0.16], scaleX: [0.92, 1.02, 0.92] },
        transition: {
          duration: 4.8,
          repeat: INFINITE_REPEAT,
          ease: EASE_OUT_QUINT,
        },
      };
  }
}

function getEyePresenceMotion(
  state: MemoraMascotState,
  animate: boolean,
  side: "left" | "right",
) {
  const delay = side === "left" ? 0 : 0.04;

  if (!animate) {
    if (state === "asleep") {
      return {
        animate: { scaleX: 1.06, scaleY: 0.22 },
      };
    }

    if (state === "listening") {
      return {
        animate: { scale: 1.08 },
      };
    }

    return {
      animate: {
        scale: state === "speaking" ? 1.04 : state === "thinking" ? 1.03 : 1,
      },
    };
  }

  switch (state) {
    case "listening":
      return {
        animate: { scale: [1.04, 1.1, 1.04] },
        transition: {
          duration: 2.2,
          delay,
          repeat: INFINITE_REPEAT,
          ease: EASE_OUT_QUINT,
        },
      };
    case "thinking":
      return {
        animate: { scale: [1, 1.05, 1, 1.03, 1] },
        transition: {
          duration: 3.1,
          delay,
          repeat: INFINITE_REPEAT,
          ease: EASE_OUT_QUINT,
        },
      };
    case "speaking":
      return {
        animate: { scale: [1.03, 0.99, 1.05, 1, 1.03] },
        transition: {
          duration: 1.45,
          delay,
          repeat: INFINITE_REPEAT,
          ease: EASE_OUT_QUINT,
        },
      };
    case "asleep":
      return {
        animate: { scaleX: [1.03, 1.08, 1.03], scaleY: [0.16, 0.2, 0.16] },
        transition: {
          duration: 6.8,
          delay,
          repeat: INFINITE_REPEAT,
          ease: EASE_OUT_QUINT,
        },
      };
    case "idle":
    default:
      return {
        animate: { scale: [1, 1.02, 1] },
        transition: {
          duration: 4.8,
          delay,
          repeat: INFINITE_REPEAT,
          ease: EASE_OUT_QUINT,
        },
      };
  }
}

function getEyeStrokeWidthMotion(
  state: MemoraMascotState,
  animate: boolean,
  side: "left" | "right",
) {
  const delay = side === "left" ? 0 : 0.03;

  if (!animate) {
    return {
      animate: {
        strokeWidth:
          state === "listening"
            ? 11.6
            : state === "speaking"
              ? 11.4
              : state === "asleep"
                ? 9.2
                : BASE_EYE_STROKE_WIDTH + 4,
      },
    };
  }

  switch (state) {
    case "listening":
      return {
        animate: { strokeWidth: [10.1, 11.9, 10.1] },
        transition: {
          duration: 2.2,
          delay,
          repeat: INFINITE_REPEAT,
          ease: EASE_OUT_QUINT,
        },
      };
    case "thinking":
      return {
        animate: { strokeWidth: [9.9, 11.4, 10.2, 11.1, 9.9] },
        transition: {
          duration: 3.1,
          delay,
          repeat: INFINITE_REPEAT,
          ease: EASE_OUT_QUINT,
        },
      };
    case "speaking":
      return {
        animate: { strokeWidth: [11.2, 9.4, 12, 9.8, 11.3] },
        transition: {
          duration: 1.45,
          delay,
          repeat: INFINITE_REPEAT,
          ease: EASE_OUT_QUINT,
        },
      };
    case "asleep":
      return {
        animate: { strokeWidth: [8.8, 9.9, 8.8] },
        transition: {
          duration: 6.8,
          delay,
          repeat: INFINITE_REPEAT,
          ease: EASE_OUT_QUINT,
        },
      };
    case "idle":
    default:
      return {
        animate: { strokeWidth: [9.9, 11, 9.9] },
        transition: {
          duration: 4.8,
          delay,
          repeat: INFINITE_REPEAT,
          ease: EASE_OUT_QUINT,
        },
      };
  }
}

function getBlinkMotion(
  state: MemoraMascotState,
  animate: boolean,
  side: "left" | "right",
) {
  const delay = side === "left" ? 0 : 0.02;

  if (!animate) {
    return {
      animate:
        state === "asleep"
          ? { scaleY: 0.12 }
          : state === "speaking"
            ? { scaleY: 0.84 }
            : { scaleY: 1 },
    };
  }

  switch (state) {
    case "listening":
      return {
        animate: { scaleY: [1, 1, 1, 0.24, 1, 1] },
        transition: {
          duration: 4.8,
          delay,
          repeat: INFINITE_REPEAT,
          ease: EASE_IN_OUT,
          times: [0, 0.72, 0.8, 0.84, 0.9, 1],
        },
      };
    case "thinking":
      return {
        animate: { scaleY: [1, 0.95, 1, 0.78, 1] },
        transition: {
          duration: 3.2,
          delay,
          repeat: INFINITE_REPEAT,
          ease: EASE_IN_OUT,
          times: [0, 0.22, 0.4, 0.72, 1],
        },
      };
    case "speaking":
      return {
        animate: { scaleY: [1, 0.82, 1, 0.72, 1] },
        transition: {
          duration: 1.4,
          delay,
          repeat: INFINITE_REPEAT,
          ease: EASE_IN_OUT,
          times: [0, 0.22, 0.44, 0.68, 1],
        },
      };
    case "asleep":
      return {
        animate: { scaleY: [0.12, 0.18, 0.12] },
        transition: {
          duration: 6.8,
          delay,
          repeat: INFINITE_REPEAT,
          ease: EASE_IN_OUT,
        },
      };
    case "idle":
    default:
      return {
        animate: { scaleY: [1, 1, 1, 0.14, 1, 1] },
        transition: {
          duration: 6.2,
          delay,
          repeat: INFINITE_REPEAT,
          ease: EASE_IN_OUT,
          times: [0, 0.74, 0.78, 0.82, 0.88, 1],
        },
      };
  }
}
