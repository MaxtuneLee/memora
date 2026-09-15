import { useEffect, useState } from "react";

import MemoraMascot, { type MemoraMascotState } from "@/components/assistant/MemoraMascot";
import { cn } from "@/lib/cn";

const STATES: MemoraMascotState[] = ["idle", "listening", "thinking", "speaking", "asleep"];

const stateButtonClassName =
  "inline-flex h-10 items-center justify-center rounded-xl border border-memora-border bg-memora-surface px-4 text-sm font-medium text-memora-text transition hover:bg-memora-hover data-active:border-memora-olive-soft data-active:bg-memora-olive-soft/10 data-active:text-memora-text-strong";

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
    <div className="flex flex-col gap-8">
      <section className="rounded-2xl border border-memora-border bg-memora-surface p-6">
        <h2 className="font-serif text-lg font-medium text-memora-text-strong">
          Interactive state
        </h2>
        <p className="mt-1 text-sm text-memora-text-muted">
          Step through each mascot state, or autoplay the full cycle.
        </p>

        <div className="mt-6 flex flex-col items-center gap-6 sm:flex-row sm:justify-between">
          <div className="flex size-40 shrink-0 items-center justify-center rounded-full bg-mocha ring-8 ring-[#ddd1c1]">
            <MemoraMascot state={activeState} className="size-28" decorative />
          </div>

          <div className="flex flex-1 flex-wrap gap-2">
            {STATES.map((state) => (
              <button
                key={state}
                type="button"
                data-active={state === activeState ? "" : undefined}
                onClick={() => {
                  setAutoplay(false);
                  setActiveState(state);
                }}
                className={stateButtonClassName}
              >
                {state}
              </button>
            ))}
            <button
              type="button"
              data-active={autoplay ? "" : undefined}
              onClick={() => setAutoplay((value) => !value)}
              className={cn(stateButtonClassName, "border-dashed")}
            >
              {autoplay ? "Stop autoplay" : "Autoplay"}
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-memora-border bg-memora-surface p-6">
        <h2 className="font-serif text-lg font-medium text-memora-text-strong">All states</h2>

        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-5">
          {STATES.map((state) => (
            <div
              key={state}
              className="flex flex-col items-center gap-3 rounded-2xl border border-memora-border bg-memora-surface p-5"
            >
              <div className="flex size-24 shrink-0 items-center justify-center rounded-full bg-mocha ring-4 ring-[#ddd1c1]">
                <MemoraMascot state={state} className="size-16" decorative />
              </div>
              <span className="text-sm font-medium text-memora-text">{state}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
