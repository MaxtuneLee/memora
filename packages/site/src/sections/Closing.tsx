import { animate, stagger } from "animejs";
import { useEffect, useMemo, useRef, type ReactElement } from "react";

import { GithubButton } from "../lib/Github";
import { APP_URL } from "../lib/links";
import { clamp, prefersReducedMotion, sampleWordmark } from "../lib/dots";

// The pixel wordmark assembles from scattered dots as the section scrolls into view.
export function Closing(): ReactElement {
  const cells = useMemo(() => sampleWordmark(), []);
  const wmRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const wm = wmRef.current;
    if (!wm) return;
    const dots = [...wm.querySelectorAll<HTMLElement>("span:not(.off) i")];
    const spans = [...wm.children] as HTMLElement[];
    const assemble = animate(dots, {
      x: { from: () => (Math.random() - 0.5) * 700, to: 0 },
      y: { from: () => (Math.random() - 0.5) * 360 + 160, to: 0 },
      rotate: { from: () => (Math.random() - 0.5) * 360, to: 0 },
      scale: { from: 0, to: 1 },
      duration: 1000,
      ease: "out(3)",
      delay: stagger(12, { from: "random" }),
      autoplay: false,
    });
    const reduce = prefersReducedMotion();
    const scrub = () => {
      // Assemble over whatever scroll is left: from the wordmark entering the screen until it
      // reaches the upper fifth of the screen, or the page ends, whichever comes first.
      const top = wm.getBoundingClientRect().top + scrollY;
      const start = top - innerHeight;
      const end = Math.min(
        top - innerHeight * 0.2,
        document.documentElement.scrollHeight - innerHeight,
      );
      const p = reduce ? 1 : clamp((scrollY - start) / Math.max(1, end - start));
      assemble.seek(p * assemble.duration);
    };
    let queued = false;
    const onScroll = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        scrub();
      });
    };
    const onClick = (e: MouseEvent) => {
      const r = wm.getBoundingClientRect();
      const col = clamp(Math.floor(((e.clientX - r.left) / r.width) * 35), 0, 34);
      const row = clamp(Math.floor(((e.clientY - r.top) / r.height) * 5), 0, 4);
      animate(spans, {
        y: [
          { to: -14, duration: 160, ease: "out(2)" },
          { to: 0, duration: 700, ease: "outElastic(1, .4)" },
        ],
        delay: stagger(18, { grid: [35, 5], from: row * 35 + col }),
      });
    };
    addEventListener("scroll", onScroll, { passive: true });
    wm.addEventListener("click", onClick);
    scrub();
    return () => {
      removeEventListener("scroll", onScroll);
      wm.removeEventListener("click", onClick);
      assemble.revert();
    };
  }, [cells]);

  return (
    <section className="close" id="close">
      <div className="wrap">
        <div className="wm" ref={wmRef} role="img" aria-label="Memora">
          {cells.map((k, i) => (
            <span key={i} className={k}>
              <i />
            </span>
          ))}
        </div>
        <h2>
          Your workspace is <em>waiting.</em>
        </h2>
        <p className="lede">
          Memora is in active development and open on GitHub. Feel free to give any advice or
          implement anything.
        </p>
        <div className="actions">
          <GithubButton primary />
          <a className="btn btn-soft" href={APP_URL}>
            Try it yourself
          </a>
        </div>
      </div>
    </section>
  );
}
