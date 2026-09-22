import { motion, useReducedMotion } from "motion/react";
import MemoraMascot from "@/components/assistant/MemoraMascot";
import * as stylex from "@stylexjs/stylex";
import type { LiveStoreLoadingStatus } from "../liveStoreLoadingStatus";
import { tokens } from "../../styles/stylex.stylex";

interface LiveStoreLoadingScreenProps {
  status: LiveStoreLoadingStatus;
}

const STAGE_COPY: Record<LiveStoreLoadingStatus["stage"], string> = {
  loading: "Waking up your workspace",
  migrating: "Updating local data",
  rehydrating: "Restoring your library",
  syncing: "Syncing recent changes",
};

const EASE_OUT_QUINT = [0.22, 1, 0.36, 1] as const;
const BACKGROUND_IMAGE = `
  radial-gradient(circle at 50% 24%, var(--color-memora-shell) 0%, color-mix(in srgb, var(--color-memora-bg) 82%, transparent) 34%, transparent 70%),
  radial-gradient(circle at 18% 78%, rgba(135, 154, 79, 0.12) 0%, rgba(135, 154, 79, 0) 42%),
  radial-gradient(circle at 88% 14%, rgba(196, 167, 111, 0.14) 0%, rgba(196, 167, 111, 0) 36%),
  linear-gradient(180deg, var(--color-memora-surface) 0%, var(--color-memora-bg) 52%, var(--color-memora-rail) 100%)
`;

const styles = stylex.create({
  root: {
    alignItems: "center",
    backgroundColor: tokens.background,
    color: tokens.textStrong,
    display: "flex",
    justifyContent: "center",
    minHeight: "100dvh",
    overflow: "hidden",
    padding: "2.5rem 1.5rem",
    position: "relative",
    width: "100%",
  },
  backdrop: { inset: 0, overflow: "hidden", pointerEvents: "none", position: "absolute" },
  centerGlow: {
    backgroundColor: tokens.shell,
    opacity: 0.8,
    borderRadius: "9999px",
    filter: "blur(88px)",
    height: "26rem",
    left: "50%",
    position: "absolute",
    top: "18%",
    transform: "translateX(-50%)",
    width: "26rem",
  },
  lowerGlow: {
    backgroundColor: "rgba(142, 161, 91, 0.12)",
    borderRadius: "9999px",
    bottom: "-6rem",
    filter: "blur(96px)",
    height: "18rem",
    left: "-3rem",
    position: "absolute",
    width: "18rem",
  },
  upperGlow: {
    backgroundColor: "rgba(207, 178, 124, 0.16)",
    borderRadius: "9999px",
    filter: "blur(80px)",
    height: "16rem",
    position: "absolute",
    right: "-5rem",
    top: "-5rem",
    width: "16rem",
  },
  content: {
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    maxWidth: "24rem",
    position: "relative",
    width: "100%",
    zIndex: 10,
  },
  mascot: { height: "clamp(9.5rem, 20vw, 12rem)", width: "clamp(9.5rem, 20vw, 12rem)" },
  copy: {
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
    marginTop: "1.25rem",
    textAlign: "center",
  },
  title: {
    color: tokens.textStrong,
    fontSize: "clamp(1.55rem, 2.8vw, 1.9rem)",
    fontWeight: 600,
    letterSpacing: "-0.05em",
  },
  description: {
    color: tokens.textMuted,
    fontSize: "0.875rem",
    lineHeight: 1.5,
    maxWidth: "17rem",
    letterSpacing: "0.01em",
  },
  progress: { marginTop: "2rem", maxWidth: "15rem", width: "100%" },
  progressStack: { display: "flex", flexDirection: "column", gap: "0.625rem" },
  progressTrack: {
    backgroundColor: tokens.border,
    borderRadius: "9999px",
    height: "0.375rem",
    overflow: "hidden",
  },
  progressFill: {
    backgroundColor: tokens.primaryBackground,
    borderRadius: "9999px",
    height: "100%",
  },
  progressText: {
    color: tokens.textMuted,
    fontSize: "0.68rem",
    letterSpacing: "0.26em",
    textAlign: "center",
    textTransform: "uppercase",
  },
  dots: { alignItems: "center", display: "flex", gap: "0.625rem", justifyContent: "center" },
  dot: {
    backgroundColor: tokens.primaryBackground,
    borderRadius: "9999px",
    height: "0.625rem",
    width: "0.625rem",
  },
});

export default function LiveStoreLoadingScreen({ status }: LiveStoreLoadingScreenProps) {
  const shouldReduceMotion = useReducedMotion() ?? false;
  const progressRatio =
    "progress" in status && status.progress.total > 0
      ? clamp(status.progress.done / status.progress.total, 0, 1)
      : 0;

  return (
    <div
      {...stylex.props(styles.root)}
      role="status"
      aria-live="polite"
      style={{ backgroundImage: BACKGROUND_IMAGE }}
    >
      <div {...stylex.props(styles.backdrop)}>
        <motion.div
          {...stylex.props(styles.centerGlow)}
          animate={
            shouldReduceMotion ? undefined : { opacity: [0.72, 1, 0.72], scale: [0.96, 1.04, 0.96] }
          }
          transition={{
            duration: 5.8,
            repeat: Number.POSITIVE_INFINITY,
            ease: EASE_OUT_QUINT,
          }}
        />
        <motion.div
          {...stylex.props(styles.lowerGlow)}
          animate={
            shouldReduceMotion
              ? undefined
              : { opacity: [0.28, 0.48, 0.28], scale: [0.94, 1.08, 0.94] }
          }
          transition={{
            duration: 7.2,
            repeat: Number.POSITIVE_INFINITY,
            ease: EASE_OUT_QUINT,
          }}
        />
        <motion.div
          {...stylex.props(styles.upperGlow)}
          animate={
            shouldReduceMotion ? undefined : { opacity: [0.22, 0.42, 0.22], scale: [1, 1.12, 1] }
          }
          transition={{
            duration: 6.4,
            repeat: Number.POSITIVE_INFINITY,
            ease: EASE_OUT_QUINT,
          }}
        />
      </div>

      <motion.div
        {...stylex.props(styles.content)}
        initial={{ opacity: 0, y: 18, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.55, ease: EASE_OUT_QUINT }}
      >
        <MemoraMascot
          state="thinking"
          decorative
          animated={!shouldReduceMotion}
          style={styles.mascot}
        />

        <div {...stylex.props(styles.copy)}>
          <p {...stylex.props(styles.title)}>Preparing Memora</p>
          <p {...stylex.props(styles.description)}>{STAGE_COPY[status.stage]}</p>
        </div>

        <div {...stylex.props(styles.progress)}>
          {"progress" in status ? (
            <div {...stylex.props(styles.progressStack)}>
              <div {...stylex.props(styles.progressTrack)}>
                <motion.div
                  {...stylex.props(styles.progressFill)}
                  initial={{ scaleX: 0.02 }}
                  animate={{ scaleX: Math.max(progressRatio, 0.02) }}
                  transition={{ duration: 0.35, ease: EASE_OUT_QUINT }}
                  style={{ transformOrigin: "left center" }}
                />
              </div>
              <p {...stylex.props(styles.progressText)}>
                {status.progress.done} / {status.progress.total}
              </p>
            </div>
          ) : (
            <div {...stylex.props(styles.dots)}>
              {[0, 1, 2].map((index) => (
                <motion.span
                  key={index}
                  {...stylex.props(styles.dot)}
                  animate={
                    shouldReduceMotion
                      ? { opacity: 0.7 }
                      : {
                          opacity: [0.25, 1, 0.25],
                          scale: [0.86, 1, 0.86],
                          y: [0, -2, 0],
                        }
                  }
                  transition={{
                    duration: 1.35,
                    delay: index * 0.18,
                    repeat: Number.POSITIVE_INFINITY,
                    ease: "easeInOut",
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
