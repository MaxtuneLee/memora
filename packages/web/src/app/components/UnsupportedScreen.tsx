import { motion, useReducedMotion, type Transition } from "motion/react";
import * as stylex from "@stylexjs/stylex";

import MemoraMascot from "@/components/assistant/MemoraMascot";

import { tokens } from "../../styles/stylex.stylex";

const styles = stylex.create({
  root: {
    alignItems: "center",
    backgroundColor: tokens.background,
    display: "flex",
    justifyContent: "center",
    minHeight: "100dvh",
    paddingBlock: "2.5rem",
    paddingInline: "1.5rem",
    textAlign: "center",
  },
  content: {
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    gap: "0.75rem",
    maxWidth: "22rem",
  },
  scene: {
    height: "14.5rem",
    marginBottom: "1rem",
    position: "relative",
    width: "13rem",
  },
  head: { left: "2.5rem", position: "absolute", top: "0.25rem" },
  mascot: { height: "8rem", width: "8rem" },
  lid: {
    alignItems: "center",
    backgroundColor: tokens.surfaceMuted,
    borderColor: tokens.border,
    borderRadius: "0.75rem 0.75rem 0.25rem 0.25rem",
    borderStyle: "solid",
    borderWidth: 1,
    display: "flex",
    // 16:10, like a laptop screen seen from behind.
    height: "7rem",
    justifyContent: "center",
    left: "0.9rem",
    position: "absolute",
    top: "7rem",
    width: "11.2rem",
  },
  lidLogo: {
    backgroundColor: tokens.border,
    borderRadius: 9999,
    height: "1rem",
    width: "1rem",
  },
  base: {
    backgroundColor: tokens.textSoft,
    borderRadius: 9999,
    bottom: 0,
    height: "0.5rem",
    left: 0,
    position: "absolute",
    width: "13rem",
  },
  title: { color: tokens.textStrong, fontSize: "1.5rem", fontWeight: 600, lineHeight: 1.2 },
  description: { color: tokens.textMuted, fontSize: "1rem", lineHeight: 1.5 },
});

const PEEK_TRANSITION: Transition = {
  duration: 7,
  ease: "easeInOut",
  repeat: Infinity,
  times: [0, 0.14, 0.34, 0.56, 0.78, 1],
};

// Memora peeks over the back of a laptop lid, glances around, then ducks back down.
function MascotBehindLaptop() {
  const prefersReducedMotion = useReducedMotion();

  return (
    <div aria-hidden="true" {...stylex.props(styles.scene)}>
      <motion.div
        {...stylex.props(styles.head)}
        initial={false}
        animate={
          prefersReducedMotion
            ? { x: 0, y: 0 }
            : { x: [0, 0, -8, 8, 0, 0], y: [40, 0, 0, 0, 0, 40] }
        }
        transition={prefersReducedMotion ? undefined : PEEK_TRANSITION}
      >
        <MemoraMascot state="idle" decorative style={styles.mascot} />
      </motion.div>
      <div {...stylex.props(styles.lid)}>
        <span {...stylex.props(styles.lidLogo)} />
      </div>
      <div {...stylex.props(styles.base)} />
    </div>
  );
}

interface UnsupportedScreenProps {
  title: string;
  description: string;
}

export default function UnsupportedScreen({ title, description }: UnsupportedScreenProps) {
  return (
    <main {...stylex.props(styles.root)}>
      <div {...stylex.props(styles.content)}>
        <MascotBehindLaptop />
        <h1 {...stylex.props(styles.title)}>{title}</h1>
        <p {...stylex.props(styles.description)}>{description}</p>
      </div>
    </main>
  );
}
