import { animate, stagger } from "animejs";
import { useEffect, useRef, useState, type ReactElement } from "react";

import { TranscriptionPanel } from "@web/components/transcript/TranscriptionPanel";
import type { ChatMessageData } from "@web/components/chat/chatMessage/types";
import type { AgentStatus, ThinkingStep } from "@web/hooks/chat/useAgent";

import { FileChip, type FileKind } from "../lib/FileIcon";
import { ChatMessage } from "../lib/LazyChatMessage";
import { Matrix } from "../lib/Matrix";
import { clamp, prefersReducedMotion, sleep } from "../lib/dots";
import { AGENT_ANSWER, AGENT_QUESTION, LIVE_SEGMENTS } from "../mock/data";
import { BiotSavartDemo } from "./BiotSavartDemo";

const PANELS = 5;

export function Features(): ReactElement {
  const sectionRef = useRef<HTMLElement>(null);
  const pinRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(-1);

  // Vertical scroll moves the row of panels sideways.
  useEffect(() => {
    let queued = false;
    const render = () => {
      const section = sectionRef.current,
        pin = pinRef.current,
        track = trackRef.current;
      if (!section || !pin || !track) return;
      const r = section.getBoundingClientRect();
      const travel = section.offsetHeight - pin.clientHeight;
      // Each panel rests in place for most of its share of the scroll and only slides during
      // the middle of the hand-off, so it always settles fully in view.
      const t = clamp(-r.top / travel) * (PANELS - 1);
      const i = Math.min(Math.floor(t), PANELS - 2);
      const f = clamp((t - i - 0.3) / 0.4);
      const slide = i + f * f * (3 - 2 * f);
      track.style.transform = `translateX(${(-slide * pin.clientWidth).toFixed(1)}px)`;
      setActive(r.top < innerHeight && r.bottom > 0 ? Math.round(slide) : -1);
    };
    const onScroll = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        render();
      });
    };
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", render);
    render();
    return () => {
      removeEventListener("scroll", onScroll);
      removeEventListener("resize", render);
    };
  }, []);

  return (
    <section className="feat" id="features" ref={sectionRef} aria-label="What Memora can do">
      <div className="feat-pin" ref={pinRef}>
        <div className="wrap feat-top">
          <p>What Memora can do</p>
          <div className="feat-dots" aria-hidden="true">
            {Array.from({ length: PANELS }, (_, i) => (
              <i key={i} className={i === active ? "on" : ""} />
            ))}
          </div>
        </div>
        <div className="feat-track" ref={trackRef}>
          <Panel
            title={
              <>
                Transcribe your lecture <em>in realtime.</em>
              </>
            }
            text="Memora can do realtime word-level transcription right in your browser."
          >
            <LiveDemo running={active === 0} />
          </Panel>
          <Panel
            title={
              <>
                Read your lecture notes <em>with you.</em>
              </>
            }
            text=""
            tag="Available in Chat"
          >
            <ReadDemo running={active === 1} />
          </Panel>
          <Panel
            title={
              <>
                Find the key points <em>from your files.</em>
              </>
            }
            text="Ask the agent what mattered. It works through the whole recording and your notes, then answers with the moments to revisit."
            tag="Available in Chat"
          >
            <AgentDemo running={active === 2} />
          </Panel>
          <Panel
            title={
              <>
                Explain it <em>with a diagram you can play with.</em>
              </>
            }
            text="Stuck on how a current makes a magnetic field? Memora writes the explanation and builds a widget for it. Move the probe and watch every term change."
            tag="Available in Chat"
          >
            <BiotSavartDemo running={active === 3} />
          </Panel>
          <Panel
            title={
              <>
                And <em>more.</em>
              </>
            }
            text="Memora will fit your way"
          >
            <MoreDemo running={active === 4} />
          </Panel>
        </div>
      </div>
    </section>
  );
}

function Panel({
  title,
  text,
  tag,
  children,
}: {
  title: ReactElement;
  text: string;
  tag?: string;
  children: ReactElement;
}): ReactElement {
  return (
    <div className="panel">
      <div className="wrap">
        <div>
          <h2>{title}</h2>
          <p className="lede">{text}</p>
          {tag && <span className="tag">{tag}</span>}
        </div>
        {children}
      </div>
    </div>
  );
}

/* Real-time transcription: a live dot waveform above the app's real transcription panel. */
const WAVE_COLS = 40,
  WAVE_ROWS = 9;

function LiveDemo({ running }: { running: boolean }): ReactElement {
  const waveRef = useRef<HTMLDivElement>(null);
  const [clock, setClock] = useState("12:46");
  const [text, setText] = useState({
    accumulated: LIVE_SEGMENTS.slice(0, 2).join(" "),
    prefix: "",
    segment: "",
  });

  useEffect(() => {
    const dots = [...(waveRef.current?.querySelectorAll("i") ?? [])];
    const levels = Array.from(
      { length: WAVE_COLS },
      (_, c) => 0.15 + Math.abs(Math.sin(c * 0.5) * Math.cos(c * 0.21)) * 0.8,
    );
    const draw = () => {
      for (let c = 0; c < WAVE_COLS; c++) {
        const h = Math.round(levels[c] * 4);
        for (let r = 0; r < WAVE_ROWS; r++)
          dots[r * WAVE_COLS + c].className = Math.abs(r - 4) <= h ? "on" : "";
      }
    };
    draw();
    if (!running || prefersReducedMotion()) return;

    let t = 0,
      alive = true;
    const timer = window.setInterval(() => {
      t++;
      levels.shift();
      levels.push(
        clamp(
          0.15 + Math.abs(Math.sin(t * 0.35) * Math.sin(t * 0.09)) * 0.8 + Math.random() * 0.15,
        ),
      );
      draw();
    }, 80);

    // Feed the real panel the same shape of updates the recorder produces: a growing current
    // segment on top of the text already finalized.
    void (async () => {
      const times = ["12:46", "12:52", "13:01"];
      while (alive) {
        let done = "";
        for (let s = 0; s < LIVE_SEGMENTS.length && alive; s++) {
          setClock(times[s]);
          const words = LIVE_SEGMENTS[s].split(" ");
          for (let w = 1; w <= words.length && alive; w++) {
            setText({ accumulated: done, prefix: done, segment: words.slice(0, w).join(" ") });
            await sleep(140 + Math.random() * 120);
          }
          done = done ? `${done} ${LIVE_SEGMENTS[s]}` : LIVE_SEGMENTS[s];
          setText({ accumulated: done, prefix: done, segment: "" });
          await sleep(700);
        }
        await sleep(2400);
      }
    })();
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [running]);

  return (
    <div className="demo">
      <div className="demo-label">
        <span>Lecture 04 · recording</span>
        <span className="mono">{clock}</span>
      </div>
      <div className="d-wave" ref={waveRef}>
        <Matrix cols={WAVE_COLS} rows={WAVE_ROWS} />
      </div>
      <div className="d-live" data-demo-frame>
        <TranscriptionPanel
          accumulatedText={text.accumulated}
          currentSegmentPrefix={text.prefix}
          currentSegment={text.segment}
          tps={null}
        />
      </div>
    </div>
  );
}

/* Reading notes: the real chat message thinks out loud, then writes a structured study sheet. */
const READ_QUESTION: ChatMessageData = {
  id: "rq",
  role: "user",
  content: "Turn my Week 6 reading notes into a study sheet.",
};

type Step = Omit<ThinkingStep, "status">;
const READ_STEPS: Step[] = [
  { id: "s1", type: "tool-call", text: "Read Reading notes.md · 18 lines" },
  {
    id: "s2",
    type: "reasoning",
    text: "The notes circle three ideas: how to split sources, why every chunk needs a timestamp, and how to test retrieval honestly.",
  },
  { id: "s3", type: "tool-call", text: "Search Lecture 04 transcript for “overlap”" },
  {
    id: "s4",
    type: "reasoning",
    text: "Lead with the core idea, back it with the lecture moments, and end with questions to self-test.",
  },
];

const STUDY_SHEET = [
  "### Study sheet · Week 6",
  "**Core idea:** split sources by heading, not by fixed size. *(notes, line 4)*",
  "**Why it works**",
  "- A timestamp on every chunk lets an answer point back to the moment. *(line 9)*",
  "- Overlap helps short questions but grows the index. *(Lecture 04, 23:10)*",
  "**Test yourself**",
  "1. Why split by heading? *(notes, line 4)*\n2. What does recall@k measure? *(Lecture 04, 41:02)*",
].join("\n\n");

function ReadDemo({ running }: { running: boolean }): ReactElement {
  const [steps, setSteps] = useState<ThinkingStep[]>(
    READ_STEPS.map((s) => ({ ...s, status: "done" })),
  );
  const [status, setStatus] = useState<AgentStatus>({ type: "idle" });
  const [collapsed, setCollapsed] = useState(true);
  const [answer, setAnswer] = useState(STUDY_SHEET);
  const [streaming, setStreaming] = useState(false);

  useEffect(() => {
    if (!running || prefersReducedMotion()) return;
    let alive = true;
    void (async () => {
      while (alive) {
        // Think: steps appear one at a time, reasoning text streams in.
        setAnswer("");
        setCollapsed(false);
        setStatus({ type: "thinking" });
        setStreaming(true);
        const shown: ThinkingStep[] = [];
        for (const step of READ_STEPS) {
          if (!alive) return;
          if (step.type === "tool-call") {
            shown.push({ ...step, status: "in_progress" });
            setSteps([...shown]);
            await sleep(420);
          } else {
            shown.push({ ...step, text: "", status: "in_progress" });
            for (let i = 0; i <= step.text.length && alive; i += 4) {
              shown[shown.length - 1] = {
                ...step,
                text: step.text.slice(0, i),
                status: "in_progress",
              };
              setSteps([...shown]);
              await sleep(16);
            }
          }
          shown[shown.length - 1] = { ...step, status: "done" };
          setSteps([...shown]);
        }
        if (!alive) return;
        await sleep(300);
        // Then write: fold the thinking away and stream the structured result.
        setCollapsed(true);
        setStatus({ type: "generating" });
        for (let i = 0; i <= STUDY_SHEET.length && alive; i += 8) {
          setAnswer(STUDY_SHEET.slice(0, i));
          await sleep(16);
        }
        setAnswer(STUDY_SHEET);
        setStreaming(false);
        setStatus({ type: "idle" });
        await sleep(6000);
      }
    })();
    return () => {
      alive = false;
      setSteps(READ_STEPS.map((s) => ({ ...s, status: "done" })));
      setStatus({ type: "idle" });
      setCollapsed(true);
      setAnswer(STUDY_SHEET);
      setStreaming(false);
    };
  }, [running]);

  return (
    <div className="demo d-chat">
      <ChatMessage message={READ_QUESTION} isStreaming={false} />
      <ChatMessage
        message={{ id: "ra", role: "assistant", content: answer }}
        isStreaming={streaming}
        status={status}
        thinkingSteps={steps}
        thinkingCollapsed={collapsed}
        onToggleThinking={() => setCollapsed((c) => !c)}
      />
    </div>
  );
}

/* The agent: the app's real chat messages, with the answer streaming in. */
function AgentDemo({ running }: { running: boolean }): ReactElement {
  const [answer, setAnswer] = useState(AGENT_ANSWER);
  const [status, setStatus] = useState<AgentStatus>({ type: "idle" });
  const [streaming, setStreaming] = useState(false);

  useEffect(() => {
    if (!running || prefersReducedMotion()) return;
    let alive = true;
    void (async () => {
      while (alive) {
        setAnswer("");
        setStatus({ type: "tool-running", toolName: "read_transcript" });
        await sleep(500);
        if (!alive) return;
        setStatus({ type: "generating" });
        setStreaming(true);
        for (let i = 0; i <= AGENT_ANSWER.length && alive; i += 12) {
          setAnswer(AGENT_ANSWER.slice(0, i));
          await sleep(18);
        }
        setAnswer(AGENT_ANSWER);
        setStreaming(false);
        setStatus({ type: "idle" });
        await sleep(5000);
      }
    })();
    return () => {
      alive = false;
      setStreaming(false);
      setStatus({ type: "idle" });
      setAnswer(AGENT_ANSWER);
    };
  }, [running]);

  return (
    <div className="demo d-chat">
      <ChatMessage message={AGENT_QUESTION} isStreaming={false} />
      <ChatMessage
        message={{ id: "a1", role: "assistant", content: answer }}
        isStreaming={streaming}
        status={status}
      />
    </div>
  );
}

// Use cases, not features: what people actually do with it.
const MORE: Array<[FileKind, string]> = [
  ["audio", "Record a voice memo"],
  ["doc", "Write notes in markdown"],
  ["image", "Turn images into notes"],
  ["note", "Preview docs and pdf"],
  ["slides", "Customize your dashboard"],
  ["video", "Generate subtitle for a video"],
];

function MoreDemo({ running }: { running: boolean }): ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!running || prefersReducedMotion() || !ref.current) return;
    animate(ref.current.children, {
      opacity: { from: 0, to: 1 },
      y: { from: 16, to: 0 },
      duration: 450,
      ease: "out(3)",
      delay: stagger(70),
    });
  }, [running]);
  return (
    <div className="more" ref={ref}>
      {MORE.map(([k, t]) => (
        <div key={t}>
          <FileChip kind={k} />
          <span>{t}</span>
        </div>
      ))}
    </div>
  );
}
