import type { CSSProperties, ReactElement } from "react";

import { CalendarWidget } from "@web/components/dashboard/CalendarWidget";
import { RecentWidget } from "@web/components/dashboard/RecentWidget";

import { ACTIVITY, RECENT_ITEMS } from "../mock/data";
import {
  Breathe,
  Chapters,
  Clock,
  CoinFlip,
  DailyWord,
  DeskBuddy,
  DeskPlant,
  Dice,
  ExamCountdown,
  FishTank,
  Flashcard,
  FocusSounds,
  Mood,
  MoonPhase,
  Picker,
  PixelPiano,
  Pomodoro,
  Quote,
  ReadingProgress,
  SketchPad,
  StickyNote,
  Streak,
  TicTacToe,
  TodayChecklist,
  Water,
  Weather,
  WorldClock,
} from "./HomeWidgets";

const Calendar = (): ReactElement => (
  <div className="tile w">
    <CalendarWidget activityTimestamps={ACTIVITY} />
  </div>
);
const Recent = (): ReactElement => (
  <div className="tile w">
    <RecentWidget items={RECENT_ITEMS} />
  </div>
);

// Columns of widgets drift past behind the heading, each at its own pace and some in reverse,
// so Home reads as endless. Hovering a column pauses it; every widget still works.
// Every widget appears once, and neighbours differ in kind, so no stretch of the wall repeats.
const COLUMNS: Array<{ widgets: Array<() => ReactElement>; seconds: number; down?: boolean }> = [
  { widgets: [Calendar, Picker, Weather, SketchPad, Streak, WorldClock, DailyWord], seconds: 120 },
  {
    widgets: [Pomodoro, Quote, TicTacToe, Recent, Water, MoonPhase, Flashcard],
    seconds: 108,
    down: true,
  },
  {
    widgets: [DeskPlant, ReadingProgress, Dice, FocusSounds, Chapters, CoinFlip, Clock],
    seconds: 126,
  },
  {
    widgets: [
      Breathe,
      TodayChecklist,
      DeskBuddy,
      PixelPiano,
      Mood,
      FishTank,
      ExamCountdown,
      StickyNote,
    ],
    seconds: 114,
    down: true,
  },
];

export function Widgets(): ReactElement {
  return (
    <section className="homewall" id="widgets" aria-label="Customize your own Memora">
      <div className="hw-cols">
        {COLUMNS.map(({ widgets, seconds, down }, ci) => (
          <div
            key={ci}
            className={`hw-col${down ? " down" : ""}`}
            style={{ ["--dur" as string]: `${seconds}s` } as CSSProperties}
          >
            <div className="hw-track">
              <div className="hw-copy">
                {widgets.map((W, i) => (
                  <W key={i} />
                ))}
              </div>
              {/* A second, inert copy makes the loop seamless. */}
              <div className="hw-copy" inert aria-hidden="true">
                {widgets.map((W, i) => (
                  <W key={i} />
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="hw-center">
        <div className="hw-copytext">
          <h2>
            Customize your own <em>Memora.</em>
          </h2>
          <p className="lede">Describe what you want, and AI builds it into your desktop.</p>
        </div>
      </div>
    </section>
  );
}
