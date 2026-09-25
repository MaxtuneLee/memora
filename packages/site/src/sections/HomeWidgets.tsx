import { animate, stagger } from "animejs";
import { useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from "react";

import { Matrix } from "../lib/Matrix";
import { prefersReducedMotion, sampleCat, sleep } from "../lib/dots";

// Widgets for the personalized Home wall. Each one is small, self-contained, and actually works.

export function Tile({
  title,
  children,
  className = "",
}: {
  title: string;
  children: ReactNode;
  className?: string;
}): ReactElement {
  return (
    <div className={`tile w ${className}`}>
      <div className="w-head">
        <h4>{title}</h4>
      </div>
      {children}
    </div>
  );
}

/* Focus timer: a 25-minute pomodoro with a dot ring that fills as time passes. */
const FOCUS = 25 * 60;
const RING = 48;

export function Pomodoro(): ReactElement {
  const [left, setLeft] = useState(FOCUS - 7 * 60 - 36);
  const [running, setRunning] = useState(false);
  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(() => setLeft((l) => Math.max(0, l - 1)), 1000);
    return () => clearInterval(t);
  }, [running]);
  useEffect(() => {
    if (left === 0) setRunning(false);
  }, [left]);
  const done = Math.round(((FOCUS - left) / FOCUS) * RING);
  const mm = String(Math.floor(left / 60)).padStart(2, "0"),
    ss = String(left % 60).padStart(2, "0");
  return (
    <Tile title="Focus timer">
      <div className="pomo">
        <svg viewBox="0 0 120 120" aria-hidden="true">
          {Array.from({ length: RING }, (_, i) => {
            const a = (i / RING) * Math.PI * 2 - Math.PI / 2;
            return (
              <rect
                key={i}
                x={60 + Math.cos(a) * 52 - 2.6}
                y={60 + Math.sin(a) * 52 - 2.6}
                width="5.2"
                height="5.2"
                rx="1.6"
                className={i < done ? "on" : ""}
              />
            );
          })}
        </svg>
        <div className="pomo-time">
          <b className="mono">
            {mm}:{ss}
          </b>
          <span>{running ? "Focusing" : left === 0 ? "Break time" : "Paused"}</span>
        </div>
      </div>
      <div className="w-actions">
        <button
          type="button"
          className="w-btn primary"
          onClick={() => setRunning(!running)}
          disabled={left === 0}
        >
          {running ? "Pause" : "Start"}
        </button>
        <button
          type="button"
          className="w-btn"
          onClick={() => {
            setRunning(false);
            setLeft(FOCUS);
          }}
        >
          Reset
        </button>
      </div>
    </Tile>
  );
}

/* Desk plant: water it and it grows, leaf by leaf, until it flowers. */
const PLANT_W = 11,
  PLANT_H = 14;

function plantCell(c: number, r: number, stage: number): string {
  const mid = 5;
  if (r >= 11) return c >= 2 && c <= 8 && !(r === 13 && (c === 2 || c === 8)) ? "pot" : "";
  if (r === 10) return c >= 1 && c <= 9 ? "pot" : "";
  const top = 9 - stage * 2; // the stem grows two rows per stage
  if (c === mid && r >= top && r <= 9) return "stem";
  for (let s = 1; s <= stage; s++) {
    const y = 9 - s * 2 + 1,
      side = s % 2 ? -1 : 1;
    if (r === y && (c === mid + side || c === mid + side * 2)) return "leaf";
    if (r === y - 1 && c === mid + side * 2) return "leaf";
  }
  if (
    stage >= 4 &&
    r >= top - 2 &&
    r < top &&
    Math.abs(c - mid) <= 1 &&
    !(r === top - 2 && c !== mid)
  )
    return "flower";
  return "";
}

export function DeskPlant(): ReactElement {
  const [stage, setStage] = useState(2);
  const [streak, setStreak] = useState(6);
  const dropsRef = useRef<HTMLDivElement>(null);
  const water = () => {
    const drops = dropsRef.current?.children;
    if (drops && !prefersReducedMotion()) {
      animate(drops, {
        y: [{ from: -8, to: 36 }],
        opacity: [{ from: 1, to: 0 }],
        duration: 520,
        delay: stagger(90),
        ease: "in(2)",
      });
    }
    window.setTimeout(() => {
      setStage((s) => (s >= 4 ? 1 : s + 1));
      setStreak((n) => n + 1);
    }, 420);
  };
  return (
    <Tile title="Desk plant">
      <div className="plant">
        <div className="drops" ref={dropsRef} aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <Matrix
          cols={PLANT_W}
          rows={PLANT_H}
          cell={(c, r) => plantCell(c, r, stage)}
          className="plant-mx"
        />
      </div>
      <p className="w-meta">
        {stage >= 4 ? "In bloom." : "Growing."} Watered {streak} days in a row.
      </p>
      <div className="w-actions">
        <button type="button" className="w-btn primary" onClick={water}>
          Water it
        </button>
      </div>
    </Tile>
  );
}

/* Picker: can't decide what to study next? Let it choose. */
const CHOICES = [
  "Chapter 3 review",
  "Lecture 04 flashcards",
  "Past paper, Q5–8",
  "Re-read the whiteboard notes",
];

export function Picker(): ReactElement {
  const [active, setActive] = useState(1);
  const [picked, setPicked] = useState<number | null>(null);
  const [spinning, setSpinning] = useState(false);
  const pick = async () => {
    if (spinning) return;
    setSpinning(true);
    setPicked(null);
    const target = Math.floor(Math.random() * CHOICES.length);
    const steps = 14 + ((target - active + CHOICES.length) % CHOICES.length);
    let i = active;
    for (let s = 0; s < steps; s++) {
      i = (i + 1) % CHOICES.length;
      setActive(i);
      await sleep(prefersReducedMotion() ? 0 : 50 + s * s * 1.6);
    }
    setPicked(i);
    setSpinning(false);
  };
  return (
    <Tile title="What to study next">
      <ul className="pick">
        {CHOICES.map((c, i) => (
          <li key={c} className={`${i === active ? "on" : ""} ${i === picked ? "picked" : ""}`}>
            {c}
          </li>
        ))}
      </ul>
      <div className="w-actions">
        <button
          type="button"
          className="w-btn primary"
          onClick={() => void pick()}
          disabled={spinning}
        >
          {spinning ? "Picking…" : "Pick one"}
        </button>
      </div>
    </Tile>
  );
}

/* Desk buddy: a tiny dot cat that watches the cursor and loves a pat. */
const BUDDY = 18;

export function DeskBuddy(): ReactElement {
  const cat = useMemo(() => sampleCat(BUDDY), []);
  const ref = useRef<HTMLDivElement>(null);
  const [gaze, setGaze] = useState({ x: 0, y: 0 });
  const [pats, setPats] = useState(0);
  const heartsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let queued = false;
    const onMove = (e: PointerEvent) => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        const r = ref.current?.getBoundingClientRect();
        if (!r) return;
        const dx = e.clientX - (r.left + r.width / 2),
          dy = e.clientY - (r.top + r.height * 0.6);
        const x = dx < -r.width * 0.3 ? -1 : dx > r.width * 0.3 ? 1 : 0;
        const y = dy < -r.height * 0.4 ? -1 : dy > r.height * 0.4 ? 1 : 0;
        setGaze((g) => (g.x === x && g.y === y ? g : { x, y }));
      });
    };
    addEventListener("pointermove", onMove, { passive: true });
    return () => removeEventListener("pointermove", onMove);
  }, []);

  const eyes = useMemo(() => {
    const set = new Set<number>();
    cat.eyes.forEach((i) => {
      const j = (Math.floor(i / BUDDY) + gaze.y) * BUDDY + (i % BUDDY) + gaze.x;
      if (cat.cells[j] === "body") set.add(j);
    });
    return set;
  }, [cat, gaze]);

  const pat = () => {
    setPats((n) => n + 1);
    const box = heartsRef.current;
    if (!box || prefersReducedMotion()) return;
    const h = document.createElement("span");
    h.className = "buddy-heart";
    h.textContent = "♥";
    h.style.left = `${35 + Math.random() * 30}%`;
    box.append(h);
    animate(h, {
      y: [{ from: 0, to: -46 }],
      opacity: [{ from: 1, to: 0 }],
      scale: [{ from: 0.6, to: 1.2 }],
      duration: 900,
      ease: "out(2)",
      onComplete: () => h.remove(),
    });
    if (ref.current)
      animate(ref.current, {
        scaleY: [
          { to: 0.9, duration: 90 },
          { to: 1, duration: 500, ease: "outElastic(1, .4)" },
        ],
      });
  };

  return (
    <Tile title="Desk buddy">
      <button type="button" className="buddy" onClick={pat} aria-label="Pat the cat">
        <div className="buddy-hearts" ref={heartsRef} aria-hidden="true" />
        <div className="buddy-cat" ref={ref}>
          {cat.cells.map((k, i) => (
            <span key={i} className={`c ${k}${eyes.has(i) ? " eye" : ""}`}>
              <i />
            </span>
          ))}
        </div>
      </button>
      <p className="w-meta">
        {pats === 0
          ? "Click to pat. It watches your cursor."
          : `Patted ${pats} ${pats === 1 ? "time" : "times"} today.`}
      </p>
    </Tile>
  );
}

/* Study streak: twelve weeks of study days. */
export function Streak(): ReactElement {
  const days = useMemo(
    () => Array.from({ length: 84 }, (_, i) => (i > 76 ? i !== 80 : (i * 37) % 11 > 3)),
    [],
  );
  return (
    <Tile title="Study streak">
      <Matrix
        cols={12}
        rows={7}
        cell={(c, r) => (days[c * 7 + r] ? "on" : "")}
        className="streak-mx"
      />
      <p className="w-meta">6 days in a row · 58 study days this term</p>
    </Tile>
  );
}

/* Flashcard: made from your notes; flip to check yourself. */
export function Flashcard(): ReactElement {
  const [flipped, setFlipped] = useState(false);
  return (
    <Tile title="Flashcard">
      <button
        type="button"
        className={`card3d${flipped ? " flipped" : ""}`}
        onClick={() => setFlipped(!flipped)}
        aria-label={flipped ? "Show question" : "Show answer"}
      >
        <span className="card-face front">What does recall@k measure?</span>
        <span className="card-face back">
          How often the right passage appears in the top k results.
        </span>
      </button>
      <p className="w-meta">From Lecture 04 · tap to flip</p>
    </Tile>
  );
}

/* Chapters this week. */
export function Chapters(): ReactElement {
  return (
    <Tile title="Chapters this week">
      <Matrix cols={8} rows={1} cell={(c) => (c < 5 ? "on" : "")} className="chapters-mx" />
      <p className="tile-num">5 of 8</p>
    </Tile>
  );
}

/* Clock: the time, big and quiet. */
export function Clock(): ReactElement {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <Tile title="Clock">
      <p className="clock-big mono">
        {String(now.getHours()).padStart(2, "0")}:{String(now.getMinutes()).padStart(2, "0")}
        <small>:{String(now.getSeconds()).padStart(2, "0")}</small>
      </p>
      <p className="w-meta">
        {now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
      </p>
    </Tile>
  );
}

/* Word of the day: one term from your own notes. */
export function DailyWord(): ReactElement {
  return (
    <Tile title="Word of the day">
      <p className="word">Chunking</p>
      <p className="w-meta">
        Splitting a source into passages small enough to retrieve and cite. From Chapter 3.
      </p>
    </Tile>
  );
}

const art = (rows: string[]) => (c: number, r: number) => (rows[r]?.[c] === "#" ? "on" : "");

/* Weather: a pixel sun and the day ahead. */
const SUN = [
  ".#..#..#.",
  "..#...#..",
  "...###...",
  "#.#####.#",
  "..#####..",
  "#.#####.#",
  "...###...",
  "..#...#..",
  ".#..#..#.",
];
export function Weather(): ReactElement {
  return (
    <Tile title="Weather">
      <div className="weather">
        <Matrix cols={9} rows={9} cell={art(SUN)} className="sun-mx" />
        <div>
          <p className="big-num">24°</p>
          <p className="w-meta">Clear until 6 pm. A good day to study outside.</p>
        </div>
      </div>
    </Tile>
  );
}

/* Focus sounds: a dot equalizer that dances while it plays. */
export function FocusSounds(): ReactElement {
  const [playing, setPlaying] = useState(false);
  const [levels, setLevels] = useState([3, 5, 4, 6, 2, 5, 3, 4, 6, 3]);
  useEffect(() => {
    if (!playing || prefersReducedMotion()) return;
    const t = window.setInterval(
      () => setLevels((l) => l.map(() => 1 + Math.floor(Math.random() * 6))),
      180,
    );
    return () => clearInterval(t);
  }, [playing]);
  return (
    <Tile title="Focus sounds">
      <Matrix
        cols={10}
        rows={6}
        cell={(c, r) => (6 - r <= levels[c] ? "on" : "")}
        className="eq-mx"
      />
      <div className="w-row">
        <div>
          <p className="w-strong">Rain on the library window</p>
          <p className="w-meta">{playing ? "Playing" : "Paused"} · 42 min left</p>
        </div>
        <button type="button" className="w-btn primary" onClick={() => setPlaying(!playing)}>
          {playing ? "Pause" : "Play"}
        </button>
      </div>
    </Tile>
  );
}

/* Water: tap a glass to log it. */
export function Water(): ReactElement {
  const [cups, setCups] = useState(5);
  return (
    <Tile title="Water">
      <div className="cups">
        {Array.from({ length: 8 }, (_, i) => (
          <button
            key={i}
            type="button"
            className={`cup${i < cups ? " full" : ""}`}
            aria-label={`${i + 1} glasses`}
            onClick={() => setCups(i + 1 === cups ? i : i + 1)}
          />
        ))}
      </div>
      <p className="w-meta">{cups} of 8 glasses today</p>
    </Tile>
  );
}

/* Exam countdown. */
export function ExamCountdown(): ReactElement {
  const days = Math.max(0, Math.ceil((Date.UTC(2026, 9, 16) - Date.now()) / 86_400_000));
  const total = 42;
  return (
    <Tile title="Midterm countdown">
      <p className="big-num">
        {days} <small>days</small>
      </p>
      <Matrix
        cols={21}
        rows={2}
        cell={(c, r) => (r * 21 + c < total - days ? "on" : "")}
        className="count-mx"
      />
      <p className="w-meta">Signals and Systems · Oct 16</p>
    </Tile>
  );
}

/* Sticky note: just type. */
export function StickyNote(): ReactElement {
  const [text, setText] = useState(
    "Ask about overlap in office hours.\nBring the Chapter 3 questions.",
  );
  return (
    <Tile title="Sticky note" className="sticky">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        aria-label="Sticky note"
      />
    </Tile>
  );
}

/* Mood check-in. */
const MOODS = ["Great", "Good", "Okay", "Tired", "Stressed"];
export function Mood(): ReactElement {
  const [mood, setMood] = useState(1);
  return (
    <Tile title="How's today?">
      <div className="moods">
        {MOODS.map((m, i) => (
          <button
            key={m}
            type="button"
            className={`mood m${i}${i === mood ? " on" : ""}`}
            onClick={() => setMood(i)}
          >
            <i />
            {m}
          </button>
        ))}
      </div>
      <p className="w-meta">Logged “{MOODS[mood].toLowerCase()}” · 9 days tracked</p>
    </Tile>
  );
}

/* Dice: a pixel die for settling small decisions. */
const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};
export function Dice(): ReactElement {
  const [face, setFace] = useState(5);
  const [rolling, setRolling] = useState(false);
  const roll = async () => {
    if (rolling) return;
    setRolling(true);
    for (let i = 0; i < 9; i++) {
      setFace(1 + Math.floor(Math.random() * 6));
      await sleep(prefersReducedMotion() ? 0 : 50 + i * 18);
    }
    setRolling(false);
  };
  return (
    <Tile title="Dice">
      <button
        type="button"
        className={`die${rolling ? " rolling" : ""}`}
        onClick={() => void roll()}
        aria-label={`Roll the die, showing ${face}`}
      >
        {Array.from({ length: 9 }, (_, i) => (
          <i key={i} className={PIPS[face].includes(i) ? "on" : ""} />
        ))}
      </button>
      <p className="w-meta">Tap to roll. Odd: flashcards. Even: past paper.</p>
    </Tile>
  );
}

/* Breathe: a dot ring that grows and shrinks with your breath. */
export function Breathe(): ReactElement {
  const [phase, setPhase] = useState("Breathe in");
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const t = window.setInterval(
      () => setPhase((p) => (p === "Breathe in" ? "Breathe out" : "Breathe in")),
      4000,
    );
    return () => clearInterval(t);
  }, []);
  return (
    <Tile title="One-minute break">
      <div className="breathe" aria-hidden="true">
        {Array.from({ length: 16 }, (_, i) => (
          <i key={i} style={{ ["--a" as string]: `${(i / 16) * 360}deg` }} />
        ))}
      </div>
      <p className="w-meta breathe-label">{phase}</p>
    </Tile>
  );
}

/* A line worth keeping. */
export function Quote(): ReactElement {
  return (
    <Tile title="Pinned">
      <p className="quote">“The palest ink is better than the best memory.”</p>
      <p className="w-meta">Chinese proverb</p>
    </Tile>
  );
}

/* Moon phase, worked out from today's date. */
const PHASES = [
  "New moon",
  "Waxing crescent",
  "First quarter",
  "Waxing gibbous",
  "Full moon",
  "Waning gibbous",
  "Last quarter",
  "Waning crescent",
];
export function MoonPhase(): ReactElement {
  const age =
    ((((Date.now() - Date.UTC(2000, 0, 6, 18, 14)) / 86_400_000) % 29.530588) + 29.530588) %
    29.530588;
  const phase = age / 29.530588; // 0 new, 0.5 full
  const R = 5;
  const k = Math.cos(phase * 2 * Math.PI); // terminator position
  const lit = (c: number, r: number) => {
    const x = c - R,
      y = r - R;
    if (x * x + y * y > R * R + 1) return "";
    const edge = k * Math.sqrt(Math.max(0, R * R - y * y));
    const on = phase < 0.5 ? x > edge : x < -edge;
    return on ? "on" : "dim";
  };
  return (
    <Tile title="Tonight's moon">
      <div className="weather">
        <Matrix cols={11} rows={11} cell={lit} className="moon-mx" />
        <div>
          <p className="w-strong">{PHASES[Math.round(phase * 8) % 8]}</p>
          <p className="w-meta">Day {Math.floor(age)} of the cycle</p>
        </div>
      </div>
    </Tile>
  );
}

/* Reading progress. */
export function ReadingProgress(): ReactElement {
  return (
    <Tile title="Reading">
      <p className="w-strong">Deep Learning</p>
      <p className="w-meta">Goodfellow, Bengio, Courville · chapter 7 of 11</p>
      <Matrix cols={20} rows={1} cell={(c) => (c < 13 ? "on" : "")} className="count-mx" />
      <p className="w-meta">64% · about 2 hours left</p>
    </Tile>
  );
}

/* Today's checklist. */
const TODO = ["Review Lecture 04 notes", "30 minutes of reading", "Email the lab TA", "Stretch"];
export function TodayChecklist(): ReactElement {
  const [done, setDone] = useState<Set<number>>(() => new Set([0, 3]));
  const toggle = (i: number) =>
    setDone((d) => {
      const n = new Set(d);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });
  return (
    <Tile title="Today">
      <div className="checks">
        {TODO.map((t, i) => (
          <button
            key={t}
            type="button"
            className={`check${done.has(i) ? " on" : ""}`}
            onClick={() => toggle(i)}
          >
            <i />
            {t}
          </button>
        ))}
      </div>
      <p className="w-meta">
        {done.size} of {TODO.length} done
      </p>
    </Tile>
  );
}

/* Pixel sketch pad: drag to draw on the dot grid. */
const SK_W = 22,
  SK_H = 12;
export function SketchPad(): ReactElement {
  const [cells, setCells] = useState<Set<number>>(() => {
    const heart = [".##.##.", "#######", "#######", ".#####.", "..###..", "...#..."];
    const set = new Set<number>();
    heart.forEach((row, r) => {
      for (let c = 0; c < row.length; c++) if (row[c] === "#") set.add((r + 3) * SK_W + c + 8);
    });
    return set;
  });
  const drawing = useRef(false);
  const paint = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const c = Math.floor(((e.clientX - r.left) / r.width) * SK_W),
      row = Math.floor(((e.clientY - r.top) / r.height) * SK_H);
    if (c < 0 || row < 0 || c >= SK_W || row >= SK_H) return;
    const i = row * SK_W + c;
    setCells((s) => (s.has(i) ? s : new Set(s).add(i)));
  };
  return (
    <Tile title="Sketch pad">
      <div
        className="sketch"
        onPointerDown={(e) => {
          drawing.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          paint(e);
        }}
        onPointerMove={(e) => drawing.current && paint(e)}
        onPointerUp={() => (drawing.current = false)}
      >
        <Matrix
          cols={SK_W}
          rows={SK_H}
          cell={(c, r) => (cells.has(r * SK_W + c) ? "on" : "")}
          className="sketch-mx"
        />
      </div>
      <div className="w-row">
        <p className="w-meta">Drag to draw.</p>
        <button type="button" className="w-btn" onClick={() => setCells(new Set())}>
          Clear
        </button>
      </div>
    </Tile>
  );
}

/* Fish tank: a few pixel fish drifting about. */
const FISH = ["..##.", "#####", "..##."];
export function FishTank(): ReactElement {
  return (
    <Tile title="Fish tank">
      <div className="tank" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className={`fish f${i}`}>
            <Matrix cols={5} rows={3} cell={art(FISH)} className="fish-mx" />
          </div>
        ))}
        {[0, 1, 2, 3].map((i) => (
          <i key={i} className={`bubble b${i}`} />
        ))}
      </div>
      <p className="w-meta">Three fish, fed this morning.</p>
    </Tile>
  );
}

/* Tic-tac-toe against a very relaxed opponent. */
const LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];
const winner = (b: string[]) => LINES.find(([a, c, d]) => b[a] && b[a] === b[c] && b[a] === b[d]);
export function TicTacToe(): ReactElement {
  const [board, setBoard] = useState<string[]>(() => Array(9).fill(""));
  const win = winner(board);
  const full = board.every(Boolean);
  const play = (i: number) => {
    if (board[i] || win) return;
    const next = [...board];
    next[i] = "x";
    if (!winner(next)) {
      const free = next.map((v, j) => (v ? -1 : j)).filter((j) => j >= 0);
      if (free.length) next[free[Math.floor(Math.random() * free.length)]] = "o";
    }
    setBoard(next);
  };
  const status = win
    ? board[win[0]] === "x"
      ? "You win."
      : "The cat wins."
    : full
      ? "A draw."
      : "Your move.";
  return (
    <Tile title="Tic-tac-toe">
      <div className="ttt">
        {board.map((v, i) => (
          <button
            key={i}
            type="button"
            className={`${v}${win?.includes(i) ? " win" : ""}`}
            onClick={() => play(i)}
            aria-label={v || `Square ${i + 1}`}
          >
            <i />
          </button>
        ))}
      </div>
      <div className="w-row">
        <p className="w-meta">{status}</p>
        <button type="button" className="w-btn" onClick={() => setBoard(Array(9).fill(""))}>
          New game
        </button>
      </div>
    </Tile>
  );
}

/* Coin flip. */
export function CoinFlip(): ReactElement {
  const [side, setSide] = useState<"Heads" | "Tails">("Heads");
  const [turns, setTurns] = useState(0);
  const flip = () => {
    const next = Math.random() < 0.5 ? "Heads" : "Tails";
    setTurns((t) => t + 4 + (next === side ? 0 : 1));
    setSide(next);
  };
  return (
    <Tile title="Coin flip">
      <button
        type="button"
        className="coin"
        style={{ transform: `rotateY(${turns * 180}deg)` }}
        onClick={flip}
        aria-label={`Flip the coin, showing ${side}`}
      >
        <span className="coin-face">H</span>
        <span className="coin-face back">T</span>
      </button>
      <p className="w-meta">{side}. Tap to flip.</p>
    </Tile>
  );
}

/* World clock. */
const ZONES: Array<[string, string]> = [
  ["Local", Intl.DateTimeFormat().resolvedOptions().timeZone],
  ["London", "Europe/London"],
  ["Tokyo", "Asia/Tokyo"],
];
export function WorldClock(): ReactElement {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  return (
    <Tile title="World clock">
      <div className="zones">
        {ZONES.map(([name, tz]) => (
          <div key={name}>
            <span>{name}</span>
            <b className="mono">
              {now.toLocaleTimeString("en-GB", {
                hour: "2-digit",
                minute: "2-digit",
                timeZone: tz,
              })}
            </b>
          </div>
        ))}
      </div>
    </Tile>
  );
}

/* Pixel piano: seven keys that really play. */
const NOTES: Array<[string, number]> = [
  ["C", 261.63],
  ["D", 293.66],
  ["E", 329.63],
  ["F", 349.23],
  ["G", 392],
  ["A", 440],
  ["B", 493.88],
];
let audio: AudioContext | null = null;
export function PixelPiano(): ReactElement {
  const [pressed, setPressed] = useState(-1);
  const play = (i: number) => {
    audio ??= new AudioContext();
    const osc = audio.createOscillator(),
      gain = audio.createGain(),
      t = audio.currentTime;
    osc.type = "triangle";
    osc.frequency.value = NOTES[i][1];
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.15, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
    osc.connect(gain).connect(audio.destination);
    osc.start(t);
    osc.stop(t + 0.85);
    setPressed(i);
    window.setTimeout(() => setPressed((p) => (p === i ? -1 : p)), 180);
  };
  return (
    <Tile title="Piano">
      <div className="keys">
        {NOTES.map(([n], i) => (
          <button
            key={n}
            type="button"
            className={i === pressed ? "down" : ""}
            onPointerDown={() => play(i)}
            aria-label={`Play ${n}`}
          >
            {n}
          </button>
        ))}
      </div>
      <p className="w-meta">Tap a key. Sound on.</p>
    </Tile>
  );
}
