import { memo, useEffect, useState } from "react";
import type { ReactElement } from "react";

const WELCOME_TYPE_START_DELAY_MS = 140;
const WELCOME_TYPE_INTERVAL_MS = 34;

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
    isReady &&
    !reducedMotion &&
    !hasTypedWelcomeTitle &&
    typedWelcomeTitle.length < title.length;

  return (
    <div className="flex flex-col gap-3">
      <h1
        className="text-[clamp(1.85rem,4.2vw,2.9rem)] leading-[1] font-semibold tracking-[-0.045em] text-[#22211d] sm:whitespace-nowrap"
        aria-label={title}
        style={{ fontFamily: "var(--font-serif)" }}
      >
        <span>{typedWelcomeTitle}</span>
        {showTypingCursor ? (
          <span
            aria-hidden="true"
            className="ml-[0.08em] inline-block w-[0.65ch] animate-pulse text-[#8d907a]"
          >
            |
          </span>
        ) : null}
      </h1>
      <p className=" text-sm leading-6 text-[#716c64] md:text-[15px]">
        {description}
      </p>
    </div>
  );
});
