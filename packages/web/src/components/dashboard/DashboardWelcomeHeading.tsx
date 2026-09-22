import { memo, useEffect, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import type { ReactElement } from "react";

import { tokens } from "../../styles/stylex.stylex";

const WELCOME_TYPE_START_DELAY_MS = 140;
const WELCOME_TYPE_INTERVAL_MS = 34;
const cursorPulse = stylex.keyframes({
  "0%, 100%": { opacity: 1 },
  "50%": { opacity: 0.5 },
});

const styles = stylex.create({
  root: { display: "flex", flexDirection: "column", gap: 12 },
  title: {
    color: tokens.textStrong,
    fontSize: "clamp(1.85rem, 4.2vw, 2.9rem)",
    fontWeight: 600,
    letterSpacing: "-0.045em",
    lineHeight: 1,
    "@media (min-width: 40rem)": { whiteSpace: "nowrap" },
  },
  cursor: {
    animationDuration: "2s",
    animationIterationCount: "infinite",
    animationName: cursorPulse,
    color: tokens.textSoft,
    display: "inline-block",
    marginLeft: "0.08em",
    width: "0.65ch",
  },
  description: {
    color: tokens.textMuted,
    fontSize: 14,
    lineHeight: "24px",
    "@media (min-width: 48rem)": { fontSize: 15 },
  },
});

export const DashboardWelcomeHeading = memo(function DashboardWelcomeHeading({
  title,
  description,
  isReady,
  reducedMotion,
}: {
  title: string;
  description: string;
  isReady: boolean;
  reducedMotion: boolean;
}): ReactElement {
  const [typedWelcomeTitle, setTypedWelcomeTitle] = useState(title);
  const [hasTypedWelcomeTitle, setHasTypedWelcomeTitle] = useState(false);

  useEffect(() => {
    if (!isReady) {
      setTypedWelcomeTitle(title);
      return;
    }

    if (reducedMotion) {
      setTypedWelcomeTitle(title);
      setHasTypedWelcomeTitle(true);
      return;
    }

    if (hasTypedWelcomeTitle) {
      setTypedWelcomeTitle(title);
      return;
    }

    setTypedWelcomeTitle("");

    let intervalId: number | undefined;
    let characterIndex = 0;
    const timeoutId = window.setTimeout(() => {
      intervalId = window.setInterval(() => {
        characterIndex += 1;
        setTypedWelcomeTitle(title.slice(0, characterIndex));

        if (characterIndex >= title.length) {
          if (intervalId !== undefined) {
            window.clearInterval(intervalId);
          }
          setHasTypedWelcomeTitle(true);
        }
      }, WELCOME_TYPE_INTERVAL_MS);
    }, WELCOME_TYPE_START_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
      if (intervalId !== undefined) {
        window.clearInterval(intervalId);
      }
    };
  }, [hasTypedWelcomeTitle, isReady, reducedMotion, title]);

  const showTypingCursor =
    isReady && !reducedMotion && !hasTypedWelcomeTitle && typedWelcomeTitle.length < title.length;

  return (
    <div {...stylex.props(styles.root)}>
      <h1
        {...stylex.props(styles.title)}
        aria-label={title}
        style={{ fontFamily: "var(--font-serif)" }}
      >
        <span>{typedWelcomeTitle}</span>
        {showTypingCursor ? (
          <span aria-hidden="true" {...stylex.props(styles.cursor)}>
            |
          </span>
        ) : null}
      </h1>
      <p {...stylex.props(styles.description)}>{description}</p>
    </div>
  );
});
