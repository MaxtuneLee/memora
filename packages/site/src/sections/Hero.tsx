import { animate, createTimeline, stagger, utils } from "animejs";
import { useEffect, useMemo, useRef, type ReactElement } from "react";

import { GithubButton } from "../lib/Github";
import { APP_URL } from "../lib/links";
import { glyphMarkup, type FileKind } from "../lib/FileIcon";
import { clamp, prefersReducedMotion, sampleCat } from "../lib/dots";

const N = 30;
const HEART = [".##.##.", "#######", "#######", ".#####.", "..###..", "...#..."];
const FLY_KINDS: FileKind[] = ["audio", "doc", "image", "video", "note", "slides"];

export function Hero(): ReactElement {
  const cat = useMemo(() => sampleCat(N), []);
  const stageRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stage = stageRef.current,
      grid = gridRef.current;
    if (!stage || !grid) return;
    const reduce = prefersReducedMotion();
    const cells = [...grid.children] as HTMLElement[];
    const dots = cells.map((c) => c.firstElementChild as HTMLElement);
    const timers: number[] = [];
    const cleanups: Array<() => void> = [];
    const listen = <K extends keyof WindowEventMap>(
      target: Window | HTMLElement,
      type: K | string,
      fn: EventListener,
      opts?: AddEventListenerOptions,
    ) => {
      target.addEventListener(type, fn, opts);
      cleanups.push(() => target.removeEventListener(type, fn, opts));
    };

    // Continue the cat's dot grid across the whole page, aligned to its cells.
    const alignPageGrid = () => {
      const r = grid.getBoundingClientRect();
      const cell = r.width / N;
      const st = document.body.style;
      st.setProperty("--cell", `${cell}px`);
      st.setProperty("--gx", `${(r.left + scrollX) % cell}px`);
      st.setProperty("--gy", `${(r.top + scrollY) % cell}px`);
    };
    alignPageGrid();
    const ro = new ResizeObserver(alignPageGrid);
    ro.observe(grid);
    cleanups.push(() => ro.disconnect());

    // Pixel eyes: the eye mask shifts one cell toward whatever the cat is watching.
    let gaze = "";
    const look = (gx: number, gy: number) => {
      const key = `${gx},${gy}`;
      if (key === gaze) return;
      gaze = key;
      cells.forEach((c) => c.classList.remove("eye"));
      cat.eyes.forEach((i) => {
        const j = (Math.floor(i / N) + gy) * N + (i % N) + gx;
        if (cat.cells[j] === "body") cells[j].classList.add("eye");
      });
    };
    const lookAt = (x: number, y: number) => {
      const r = stage.getBoundingClientRect();
      const dx = x - (r.left + r.width / 2),
        dy = y - (r.top + r.height * 0.6);
      look(
        dx < -r.width * 0.22 ? -1 : dx > r.width * 0.22 ? 1 : 0,
        dy < -r.height * 0.3 ? -1 : dy > r.height * 0.3 ? 1 : 0,
      );
    };
    look(0, 0);
    let flying = false,
      lookQueued = false;
    listen(
      window,
      "pointermove",
      ((e: PointerEvent) => {
        if (lookQueued || flying) return;
        lookQueued = true;
        requestAnimationFrame(() => {
          lookQueued = false;
          lookAt(e.clientX, e.clientY);
        });
      }) as EventListener,
      { passive: true },
    );

    const ripple = (idx: number, strength = 1.5) => {
      animate(dots, {
        scale: [
          { to: strength, duration: 150, ease: "out(2)" },
          { to: 1, duration: 700, ease: "outElastic(1, .45)" },
        ],
        delay: stagger(22, { grid: [N, N], from: idx }),
      });
    };
    const indexAt = (x: number, y: number) => {
      const r = grid.getBoundingClientRect();
      const c = clamp(Math.floor(((x - r.left) / r.width) * N), 0, N - 1);
      const rr = clamp(Math.floor(((y - r.top) / r.height) * N), 0, N - 1);
      return rr * N + c;
    };
    listen(grid, "click", ((e: MouseEvent) =>
      ripple(indexAt(e.clientX, e.clientY), 1.7)) as EventListener);

    // Dots near the pointer lean away from it.
    let pushed: HTMLElement[] = [];
    let pushQueued = false;
    listen(grid, "pointermove", ((e: PointerEvent) => {
      if (pushQueued || e.pointerType === "touch") return;
      pushQueued = true;
      requestAnimationFrame(() => {
        pushQueued = false;
        const r = grid.getBoundingClientRect();
        const px = e.clientX - r.left,
          py = e.clientY - r.top;
        const cell = r.width / N,
          R = r.width * 0.15;
        pushed.forEach((el) => (el.style.transform = ""));
        pushed = [];
        const c0 = Math.floor(px / cell),
          r0 = Math.floor(py / cell),
          span = Math.ceil(R / cell);
        for (let rr = Math.max(0, r0 - span); rr <= Math.min(N - 1, r0 + span); rr++) {
          for (let cc = Math.max(0, c0 - span); cc <= Math.min(N - 1, c0 + span); cc++) {
            const cx = (cc + 0.5) * cell,
              cy = (rr + 0.5) * cell;
            const d = Math.hypot(cx - px, cy - py);
            if (d >= R) continue;
            const k = 1 - d / R,
              ux = (cx - px) / (d || 1),
              uy = (cy - py) / (d || 1);
            const el = cells[rr * N + cc];
            el.style.transform = `translate(${(ux * k * cell * 0.7).toFixed(1)}px, ${(uy * k * cell * 0.7).toFixed(1)}px) scale(${(1 + k * 0.45).toFixed(2)})`;
            pushed.push(el);
          }
        }
      });
    }) as EventListener);
    listen(grid, "pointerleave", () => {
      pushed.forEach((el) => (el.style.transform = ""));
      pushed = [];
    });

    if (reduce) return () => cleanups.forEach((f) => f());

    // Intro: the cat assembles from the center outward.
    animate(dots, {
      scale: { from: 0, to: 1 },
      duration: 1000,
      ease: "outElastic(1, .55)",
      delay: stagger(14, { grid: [N, N], from: "center" }),
    });

    // Blinks: the eyelid drops row by row, at irregular gaps, with the odd double blink.
    const blink = (then?: () => void) => {
      const eyes = [...grid.querySelectorAll<HTMLElement>(".c.eye i")];
      const body = grid.querySelector<HTMLElement>(".c.body i");
      if (!eyes.length || !body) return;
      const lid = getComputedStyle(body).backgroundColor,
        open = getComputedStyle(eyes[0]).backgroundColor;
      const rowOf = (el: HTMLElement) => Number(el.parentElement?.dataset.r ?? 0);
      const top = Math.min(...eyes.map(rowOf));
      animate(eyes, {
        backgroundColor: [
          { to: lid, duration: 60 },
          { to: open, duration: 110, delay: 70 },
        ],
        delay: (el: unknown) => (rowOf(el as HTMLElement) - top) * 16,
        ease: "linear",
        onComplete: () => {
          eyes.forEach((e) => (e.style.backgroundColor = ""));
          then?.();
        },
      });
    };
    const scheduleBlink = () => {
      timers.push(
        window.setTimeout(
          () => {
            blink(
              Math.random() < 0.2
                ? () => timers.push(window.setTimeout(() => blink(), 120))
                : undefined,
            );
            scheduleBlink();
          },
          2400 + Math.random() * 4200,
        ),
      );
    };
    scheduleBlink();

    // Now and then, a pixel heart floats up after a meal.
    const popHeart = () => {
      const w = stage.clientWidth;
      const heart = document.createElement("div");
      heart.className = "heart";
      heart.setAttribute("aria-hidden", "true");
      heart.innerHTML = HEART.join("")
        .split("")
        .map((ch) => `<i class="${ch === "#" ? "on" : ""}"></i>`)
        .join("");
      stage.append(heart);
      utils.set(heart, { x: w * (0.66 + Math.random() * 0.12), y: w * 0.12 });
      animate(heart.querySelectorAll("i.on"), {
        scale: [
          { from: 0, to: 1.3, duration: 220, ease: "out(3)" },
          { to: 1, duration: 420, ease: "outElastic(1, .5)" },
        ],
        delay: stagger(18, { grid: [7, 6], from: "center" }),
      });
      animate(heart, {
        y: w * 0.12 - w * 0.14,
        rotate: -8 + Math.random() * 16,
        opacity: [
          { to: 1, duration: 900 },
          { to: 0, duration: 500 },
        ],
        duration: 1400,
        ease: "out(2)",
        onComplete: () => heart.remove(),
      });
    };

    // Files fly in and the cat swallows them.
    let flyIndex = 0;
    const launch = () => {
      if (document.hidden) return;
      const r0 = stage.getBoundingClientRect();
      if (r0.bottom < 0 || r0.top > innerHeight) return;
      const kind = FLY_KINDS[flyIndex++ % FLY_KINDS.length];
      const tile = document.createElement("div");
      tile.className = `fly ic ${kind}`;
      tile.innerHTML = glyphMarkup(kind);
      stage.append(tile);
      const w = stage.clientWidth;
      const a = (-170 + Math.random() * 160) * (Math.PI / 180);
      const sx = w / 2 + Math.cos(a) * w * 0.56,
        sy = w * 0.5 + Math.sin(a) * w * 0.52;
      const tx = w * 0.53,
        ty = w * 0.74;
      flying = true;
      lookAt(r0.left + sx, r0.top + sy);
      utils.set(tile, { x: sx, y: sy, scale: 0, rotate: -30 + Math.random() * 60 });
      createTimeline()
        .add(tile, { scale: 1, duration: 420, ease: "outBack(2)" })
        .add(
          tile,
          {
            x: tx,
            y: ty,
            rotate: 0,
            duration: 950,
            ease: "inOut(3)",
            onUpdate: () => {
              const b = tile.getBoundingClientRect();
              lookAt(b.left + b.width / 2, b.top + b.height / 2);
            },
          },
          "+=250",
        )
        .add(tile, {
          scale: 0,
          duration: 180,
          ease: "in(3)",
          onComplete: () => {
            tile.remove();
            flying = false;
            look(0, 0);
            ripple(Math.round((ty / w) * N) * N + Math.round((tx / w) * N), 1.35);
            if (Math.random() < 0.4) popHeart();
          },
        });
    };
    timers.push(
      window.setTimeout(() => {
        launch();
        timers.push(window.setInterval(launch, 3000));
      }, 1600),
    );

    // Headline lines slide up from behind a clip; the clip comes off once they land so no
    // descender or overhang stays cut.
    const lines = [...document.querySelectorAll<HTMLElement>(".hero .ln")];
    lines.forEach((el) => el.classList.remove("done"));
    animate(".hero .ln > span", {
      y: { from: "110%", to: "0%" },
      duration: 1000,
      ease: "out(4)",
      delay: stagger(110, { start: 100 }),
      onComplete: () => lines.forEach((el) => el.classList.add("done")),
    });
    animate(".hero .fade", {
      opacity: { from: 0, to: 1 },
      y: { from: 18, to: 0 },
      duration: 800,
      ease: "out(3)",
      delay: stagger(90, { start: 400 }),
    });

    return () => {
      timers.forEach((t) => {
        clearTimeout(t);
        clearInterval(t);
      });
      cleanups.forEach((f) => f());
      stage.querySelectorAll(".fly, .heart").forEach((el) => el.remove());
    };
  }, [cat]);

  return (
    <section className="hero">
      <div className="wrap">
        <div className="hero-copy">
          <h1>
            <span className="ln done">
              <span>Feed it anything.</span>
            </span>
            <span className="ln done">
              <span>
                <em>Learn everything.</em>
              </span>
            </span>
          </h1>
          <p className="lede fade">
            Memora is a local-first learning workspace. Drop in lectures, papers and screen
            recordings. It process and indexes them on your browser locally.
          </p>
          <div className="actions fade">
            <a className="btn btn-primary" href={APP_URL}>
              Try it yourself
            </a>
            <GithubButton />
          </div>
        </div>
        <div className="cat-col">
          <div className="cat-stage" ref={stageRef}>
            <div
              className="dotcat"
              ref={gridRef}
              role="img"
              aria-label="The Memora cat, drawn in dots, catching files that fly in. Click it to make it ripple."
            >
              {cat.cells.map((k, i) => (
                <span key={i} className={`c ${k}`} data-r={Math.floor(i / N)}>
                  <i />
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
