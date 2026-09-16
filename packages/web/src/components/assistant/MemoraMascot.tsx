import { motion, useReducedMotion } from "motion/react";
import * as stylex from "@stylexjs/stylex";

const styles = stylex.create({
  root: {
    alignItems: "center",
    display: "inline-flex",
    flexShrink: 0,
    height: 64,
    isolation: "isolate",
    justifyContent: "center",
    position: "relative",
    width: 64,
  },
  aura: {
    borderRadius: 9999,
    filter: "blur(24px)",
    inset: "16%",
    pointerEvents: "none",
    position: "absolute",
  },
  listeningAura: { backgroundColor: "rgb(135 154 79 / 0.2)" },
  thinkingAura: { backgroundColor: "rgb(209 177 112 / 0.24)" },
  speakingAura: { backgroundColor: "rgb(214 159 99 / 0.22)" },
  asleepAura: { backgroundColor: "rgb(183 170 139 / 0.12)" },
  idleAura: { backgroundColor: "rgb(198 179 143 / 0.16)" },
  shadow: {
    backgroundColor: "rgb(84 72 61 / 0.18)",
    borderRadius: 9999,
    bottom: "11%",
    filter: "blur(16px)",
    height: "8%",
    left: "50%",
    pointerEvents: "none",
    position: "absolute",
    transform: "translateX(-50%)",
    width: "56%",
  },
  body: { height: "100%", position: "relative", width: "100%", zIndex: 10 },
  svg: { height: "100%", width: "100%" },
});

import {
  BASE_EYE_STROKE_WIDTH,
  EYE_TRANSFORM_STYLE,
  getAuraMotion,
  getBlinkMotion,
  getBodyMotion,
  getEyePresenceMotion,
  getEyeStrokeWidthMotion,
  getShadowMotion,
} from "./memoraMascot/motions";
import type { MemoraMascotState } from "./memoraMascot/types";

export type { MemoraMascotState } from "./memoraMascot/types";

interface MemoraMascotProps {
  state: MemoraMascotState;
  className?: string;
  animated?: boolean;
  decorative?: boolean;
}

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
      className={`${stylex.props(styles.root).className} ${className ?? ""}`}
      aria-hidden={decorative ? true : undefined}
      aria-label={decorative ? undefined : `Memora assistant is ${state}`}
      role={decorative ? undefined : "img"}
    >
      <motion.div
        {...stylex.props(
          styles.aura,
          state === "listening"
            ? styles.listeningAura
            : state === "thinking"
              ? styles.thinkingAura
              : state === "speaking"
                ? styles.speakingAura
                : state === "asleep"
                  ? styles.asleepAura
                  : styles.idleAura,
        )}
        animate={auraMotion.animate}
        transition={auraMotion.transition}
      />

      <motion.div
        {...stylex.props(styles.shadow)}
        animate={shadowMotion.animate}
        transition={shadowMotion.transition}
      />

      <motion.div
        {...stylex.props(styles.body)}
        animate={bodyMotion.animate}
        transition={bodyMotion.transition}
      >
        <svg
          className={stylex.props(styles.svg).className}
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
