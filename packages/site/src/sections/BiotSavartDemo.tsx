import { useEffect, useRef, useState, type CSSProperties, type ReactElement } from "react";

import { clamp, prefersReducedMotion, sleep } from "../lib/dots";

// A generated study widget: the Biot–Savart law for a straight wire. The field is drawn as a
// dot matrix (● out of the page, × into it, size by strength on a log scale). The explanation
// streams in first; then the probe, current, and wire length become interactive.

const COLS = 44;
const ROWS = 24;
const CM = 0.01; // one grid cell is 1 cm
const WIRE_ROW = 12;
const WIRE_Y = WIRE_ROW + 0.5; // the wire runs through the middle of its row
const MU0_OVER_4PI = 1e-7;

const EXPLANATION =
  "Every short piece of current, I·dl, adds a small field dB. Its strength falls off as 1/r², and its direction is dl × r̂, so the field wraps around the wire. Adding up every piece of a straight wire gives the closed form below.";

type Phase = "streaming" | "ready";
interface Point {
  x: number;
  y: number;
}

// Field of a straight segment from x1 to x2 (grid units) at point p, in tesla. Positive means
// out of the page for current flowing in +x.
function fieldAt(
  p: Point,
  x1: number,
  x2: number,
  current: number,
): { b: number; d: number; t1: number; t2: number } {
  const d = (WIRE_Y - p.y) * CM; // signed: above the wire is positive
  const ad = Math.max(Math.abs(d), 0.2 * CM);
  const s1 = ((x1 - p.x) * CM) / Math.hypot((x1 - p.x) * CM, ad);
  const s2 = ((x2 - p.x) * CM) / Math.hypot((x2 - p.x) * CM, ad);
  const b = ((MU0_OVER_4PI * current) / ad) * (s2 - s1) * Math.sign(d || 1);
  return { b, d: ad, t1: Math.asin(s1), t2: Math.asin(s2) };
}

export function BiotSavartDemo({ running }: { running: boolean }): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<Phase>("ready");
  const [text, setText] = useState(EXPLANATION);
  const [current, setCurrent] = useState(5);
  const [length, setLength] = useState(20);
  const [probe, setProbe] = useState<Point>({ x: 27, y: 7 });
  const revealRef = useRef(ROWS);
  // The draw loop reads the latest inputs without restarting.
  const live = useRef({ current, length, probe, ready: true });
  live.current = { current, length, probe, ready: phase === "ready" };

  // Stream the explanation in each time the panel becomes active.
  useEffect(() => {
    if (!running || prefersReducedMotion()) return;
    let alive = true;
    void (async () => {
      setPhase("streaming");
      revealRef.current = 0;
      for (let i = 0; i <= EXPLANATION.length && alive; i += 3) {
        setText(EXPLANATION.slice(0, i));
        revealRef.current = Math.floor((i / EXPLANATION.length) * ROWS);
        await sleep(16);
      }
      if (!alive) return;
      setText(EXPLANATION);
      revealRef.current = ROWS;
      await sleep(200);
      if (alive) setPhase("ready");
    })();
    return () => {
      alive = false;
      revealRef.current = ROWS;
      setText(EXPLANATION);
      setPhase("ready");
    };
  }, [running]);

  // Draw loop while the panel is active (the current keeps flowing); a still frame otherwise.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    let raf = 0;
    const draw = (t: number) => {
      const { current: I, length: L, probe: p, ready } = live.current;
      const dpr = devicePixelRatio || 1;
      const w = canvas.clientWidth,
        h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      const css = getComputedStyle(canvas);
      const out = css.getPropertyValue("--sage").trim() || "#7b875a";
      const into = css.getPropertyValue("--image").trim() || "#bd7253";
      const ink = css.getPropertyValue("--ink").trim() || "#1d1c1a";
      const muted = css.getPropertyValue("--stone").trim() || "#67625a";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const cell = w / COLS;
      const x1 = COLS / 2 - L / 2,
        x2 = COLS / 2 + L / 2;
      // Map field strength onto dot size with a log scale so the 1/d fall-off stays visible.
      const bMax = ((MU0_OVER_4PI * 10) / (0.6 * CM)) * 2;
      const bMin = bMax / 400;
      for (let r = 0; r < revealRef.current; r++) {
        if (r === WIRE_ROW) continue;
        for (let c = 0; c < COLS; c++) {
          const { b } = fieldAt({ x: c + 0.5, y: r + 0.5 }, x1, x2, I);
          const v = clamp(Math.log(Math.abs(b) / bMin) / Math.log(bMax / bMin));
          const cx = (c + 0.5) * cell,
            cy = (r + 0.5) * cell;
          const s = cell * (0.12 + 0.6 * v);
          ctx.globalAlpha = 0.3 + 0.7 * v;
          if (b > 0) {
            ctx.fillStyle = out;
            ctx.beginPath();
            ctx.roundRect(cx - s / 2, cy - s / 2, s, s, s * 0.3);
            ctx.fill();
          } else {
            ctx.strokeStyle = into;
            ctx.lineWidth = Math.max(1, cell * 0.12);
            ctx.beginPath();
            ctx.moveTo(cx - s / 2, cy - s / 2);
            ctx.lineTo(cx + s / 2, cy + s / 2);
            ctx.moveTo(cx + s / 2, cy - s / 2);
            ctx.lineTo(cx - s / 2, cy + s / 2);
            ctx.stroke();
          }
        }
      }
      ctx.globalAlpha = 1;
      // The wire, with current dots flowing in +x.
      const wy = WIRE_Y * cell;
      ctx.fillStyle = ink;
      ctx.fillRect(x1 * cell, wy - cell * 0.18, (x2 - x1) * cell, cell * 0.36);
      ctx.fillStyle = css.getPropertyValue("--paper").trim() || "#fcfaf6";
      const gap = 2.5;
      const shift = (((t * I * 0.6) % gap) + gap) % gap;
      for (let x = x1 + shift; x < x2; x += gap)
        ctx.fillRect(x * cell - cell * 0.1, wy - cell * 0.1, cell * 0.2, cell * 0.2);
      ctx.fillStyle = ink;
      ctx.font = `600 ${Math.round(cell * 0.9)}px ${css.getPropertyValue("--sans")}`;
      ctx.fillText(`I →`, x2 * cell + cell * 0.4, wy + cell * 0.3);
      if (!ready || revealRef.current < ROWS) return;
      // Probe geometry: lines to both ends, the perpendicular d, and the probe ring.
      const px = p.x * cell,
        py = p.y * cell;
      ctx.strokeStyle = muted;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(x1 * cell, wy);
      ctx.moveTo(px, py);
      ctx.lineTo(x2 * cell, wy);
      ctx.stroke();
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px, wy);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = muted;
      ctx.font = `500 ${Math.round(cell * 0.8)}px ${css.getPropertyValue("--serif")}`;
      ctx.fillText("d", px + cell * 0.3, (py + wy) / 2);
      ctx.fillText("θ₁", x1 * cell - cell * 0.4, wy + (py < wy ? -cell * 0.6 : cell * 1.2));
      ctx.fillText("θ₂", x2 * cell - cell * 0.4, wy + (py < wy ? -cell * 0.6 : cell * 1.2));
      ctx.strokeStyle = ink;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, cell * 0.8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = ink;
      ctx.beginPath();
      ctx.arc(px, py, cell * 0.22, 0, Math.PI * 2);
      ctx.fill();
    };
    if (!running || prefersReducedMotion()) {
      draw(0);
      const redraw = () => draw(0);
      canvas.addEventListener("memora:redraw", redraw);
      return () => canvas.removeEventListener("memora:redraw", redraw);
    }
    const start = performance.now();
    const loop = (now: number) => {
      draw((now - start) / 1000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [running]);

  useEffect(() => {
    canvasRef.current?.dispatchEvent(new Event("memora:redraw"));
  }, [current, length, probe, phase]);

  // Click or drag anywhere on the field to move the probe.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || phase !== "ready") return;
    let dragging = false;
    const place = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      const x = clamp(((e.clientX - r.left) / r.width) * COLS, 1, COLS - 1);
      let y = clamp(((e.clientY - r.top) / r.height) * ROWS, 1, ROWS - 1);
      if (Math.abs(y - WIRE_Y) < 1) y = y < WIRE_Y ? WIRE_Y - 1 : WIRE_Y + 1;
      setProbe({ x, y });
    };
    const down = (e: PointerEvent) => {
      dragging = true;
      canvas.setPointerCapture(e.pointerId);
      place(e);
    };
    const move = (e: PointerEvent) => {
      if (dragging) place(e);
    };
    const up = () => {
      dragging = false;
    };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    return () => {
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
    };
  }, [phase]);

  const streaming = phase === "streaming";
  const x1 = COLS / 2 - length / 2,
    x2 = COLS / 2 + length / 2;
  const f = fieldAt(probe, x1, x2, current);
  const micro = Math.abs(f.b) * 1e6;
  const deg = (a: number) => `${Math.round((a * 180) / Math.PI)}°`;

  return (
    <div className="demo d-bs">
      <div className="demo-label">
        <span>Biot–Savart law · straight wire</span>
        <span className="mono">{streaming ? "Generating…" : "Ready · drag the probe"}</span>
      </div>
      <p className="bs-text">
        {text}
        {streaming && <i className="caret" />}
      </p>
      <div className={`bs-eq${streaming ? " off" : ""}`}>
        <span>
          d<b>B</b> = <Frac top="μ₀" bottom="4π" /> ·{" "}
          <Frac
            top={
              <>
                I d<b>l</b> × r̂
              </>
            }
            bottom="r²"
          />
        </span>
        <span className="bs-arrow">⟶</span>
        <span>
          <b>B</b> = <Frac top="μ₀I" bottom="4πd" /> (sin θ₂ − sin θ₁)
        </span>
      </div>
      <canvas
        ref={canvasRef}
        className={`d-field${streaming ? "" : " ready"}`}
        role="img"
        aria-label="Magnetic field around a straight current-carrying wire, with a movable probe point"
      />
      <p className={`bs-read mono${streaming ? " off" : ""}`}>
        d = {(f.d / CM).toFixed(1)} cm · θ₁ = {deg(f.t1)} · θ₂ = {deg(f.t2)} · B ={" "}
        {micro.toFixed(micro < 10 ? 2 : 1)} μT, {f.b >= 0 ? "out of the page ●" : "into the page ×"}
      </p>
      <div className={`bs-controls${streaming ? " off" : ""}`}>
        <label className="slider" htmlFor="bs-current">
          <span>Current I</span>
          <input
            id="bs-current"
            type="range"
            min={1}
            max={10}
            step={0.5}
            value={current}
            style={fill(current, 1, 10)}
            disabled={streaming}
            onChange={(e) => setCurrent(Number(e.target.value))}
          />
          <span className="mono">{current.toFixed(1)} A</span>
        </label>
        <label className="slider" htmlFor="bs-length">
          <span>Wire length</span>
          <input
            id="bs-length"
            type="range"
            min={4}
            max={40}
            step={1}
            value={length}
            style={fill(length, 4, 40)}
            disabled={streaming}
            onChange={(e) => setLength(Number(e.target.value))}
          />
          <span className="mono">{length} cm</span>
        </label>
      </div>
    </div>
  );
}

// How far the slider's olive fill reaches, for the custom track in site.css.
function fill(value: number, min: number, max: number): CSSProperties {
  return { ["--fill" as string]: `${((value - min) / (max - min)) * 100}%` };
}

function Frac({ top, bottom }: { top: ReactElement | string; bottom: string }): ReactElement {
  return (
    <span className="frac">
      <span>{top}</span>
      <span>{bottom}</span>
    </span>
  );
}
