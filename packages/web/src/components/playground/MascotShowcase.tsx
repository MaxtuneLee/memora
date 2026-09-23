import * as stylex from "@stylexjs/stylex";
import { useEffect, useState } from "react";

import MemoraMascot, { type MemoraMascotState } from "@/components/assistant/MemoraMascot";
import { tokens } from "../../styles/stylex.stylex";

const STATES: MemoraMascotState[] = ["idle", "listening", "thinking", "speaking", "asleep"];

// ponytail: the mascot's own SVG artwork uses fixed brand colors (see MemoraMascot.tsx), so
// the circular backdrop behind it keeps the matching fixed brand green/cream ring in both
// themes too — a justified "media artwork" exception, not a missed token.
const MASCOT_FRAME_BACKGROUND = "#aebe79";
const MASCOT_FRAME_RING = "#ddd1c1";

const styles = stylex.create({
  root: { display: "flex", flexDirection: "column", gap: "2rem" },
  section: {
    backgroundColor: tokens.surface,
    borderColor: tokens.border,
    borderRadius: "1rem",
    borderStyle: "solid",
    borderWidth: 1,
    padding: "1.5rem",
  },
  title: {
    color: tokens.textStrong,
    fontFamily: '"IBM Plex Serif", serif',
    fontSize: "1.125rem",
    fontWeight: 500,
    lineHeight: "1.75rem",
  },
  description: {
    color: tokens.textMuted,
    fontSize: "0.875rem",
    lineHeight: "1.25rem",
    marginTop: "0.25rem",
  },
  interactive: {
    alignItems: "center",
    display: "flex",
    flexDirection: { default: "column", "@media (min-width: 640px)": "row" },
    gap: "1.5rem",
    justifyContent: { default: "flex-start", "@media (min-width: 640px)": "space-between" },
    marginTop: "1.5rem",
  },
  heroFrame: {
    alignItems: "center",
    backgroundColor: MASCOT_FRAME_BACKGROUND,
    borderRadius: "9999px",
    boxShadow: `0 0 0 8px ${MASCOT_FRAME_RING}`,
    display: "flex",
    flexShrink: 0,
    height: "10rem",
    justifyContent: "center",
    width: "10rem",
  },
  heroMascot: { height: "7rem", width: "7rem" },
  stateControls: { display: "flex", flex: 1, flexWrap: "wrap", gap: "0.5rem" },
  stateButton: {
    alignItems: "center",
    backgroundColor: {
      default: tokens.surface,
      ":hover": tokens.hover,
    },
    borderColor: tokens.border,
    borderRadius: "0.75rem",
    borderStyle: "solid",
    borderWidth: 1,
    color: tokens.text,
    display: "inline-flex",
    fontSize: "0.875rem",
    fontWeight: 500,
    height: "2.5rem",
    justifyContent: "center",
    lineHeight: "1.25rem",
    paddingInline: "1rem",
    transition: "background-color 150ms, border-color 150ms, color 150ms",
    "[data-active]": {
      backgroundColor: `color-mix(in srgb, ${tokens.oliveSoft} 10%, transparent)`,
      borderColor: tokens.oliveSoft,
      color: tokens.textStrong,
    },
  },
  dashed: { borderStyle: "dashed" },
  grid: {
    display: "grid",
    gap: "1rem",
    gridTemplateColumns: {
      default: "repeat(2, minmax(0, 1fr))",
      "@media (min-width: 640px)": "repeat(5, minmax(0, 1fr))",
    },
    marginTop: "1.5rem",
  },
  stateCard: {
    alignItems: "center",
    backgroundColor: tokens.surface,
    borderColor: tokens.border,
    borderRadius: "1rem",
    borderStyle: "solid",
    borderWidth: 1,
    display: "flex",
    flexDirection: "column",
    gap: "0.75rem",
    padding: "1.25rem",
  },
  stateFrame: {
    alignItems: "center",
    backgroundColor: MASCOT_FRAME_BACKGROUND,
    borderRadius: "9999px",
    boxShadow: `0 0 0 4px ${MASCOT_FRAME_RING}`,
    display: "flex",
    flexShrink: 0,
    height: "6rem",
    justifyContent: "center",
    width: "6rem",
  },
  stateMascot: { height: "4rem", width: "4rem" },
  stateLabel: {
    color: tokens.text,
    fontSize: "0.875rem",
    fontWeight: 500,
    lineHeight: "1.25rem",
  },
});

export default function MascotShowcase() {
  const [activeState, setActiveState] = useState<MemoraMascotState>("idle");
  const [autoplay, setAutoplay] = useState(false);

  useEffect(() => {
    if (!autoplay) return;
    const id = window.setInterval(() => {
      setActiveState((current) => STATES[(STATES.indexOf(current) + 1) % STATES.length]);
    }, 2200);
    return () => window.clearInterval(id);
  }, [autoplay]);

  return (
    <div {...stylex.props(styles.root)}>
      <section {...stylex.props(styles.section)}>
        <h2 {...stylex.props(styles.title)}>Interactive state</h2>
        <p {...stylex.props(styles.description)}>
          Step through each mascot state, or autoplay the full cycle.
        </p>

        <div {...stylex.props(styles.interactive)}>
          <div {...stylex.props(styles.heroFrame)}>
            <MemoraMascot state={activeState} style={styles.heroMascot} decorative />
          </div>

          <div {...stylex.props(styles.stateControls)}>
            {STATES.map((state) => (
              <button
                key={state}
                type="button"
                data-active={state === activeState ? "" : undefined}
                onClick={() => {
                  setAutoplay(false);
                  setActiveState(state);
                }}
                className={stylex.props(styles.stateButton).className}
              >
                {state}
              </button>
            ))}
            <button
              type="button"
              data-active={autoplay ? "" : undefined}
              onClick={() => setAutoplay((value) => !value)}
              className={stylex.props(styles.stateButton, styles.dashed).className}
            >
              {autoplay ? "Stop autoplay" : "Autoplay"}
            </button>
          </div>
        </div>
      </section>

      <section {...stylex.props(styles.section)}>
        <h2 {...stylex.props(styles.title)}>All states</h2>

        <div {...stylex.props(styles.grid)}>
          {STATES.map((state) => (
            <div key={state} className={stylex.props(styles.stateCard).className}>
              <div {...stylex.props(styles.stateFrame)}>
                <MemoraMascot state={state} style={styles.stateMascot} decorative />
              </div>
              <span {...stylex.props(styles.stateLabel)}>{state}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
