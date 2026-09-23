import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react";
import { motion, useReducedMotion } from "motion/react";
import { useMemo, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import type { ReactElement } from "react";

import { tokens } from "../../styles/stylex.stylex";

import {
  CALENDAR_MOTION_EASE,
  getCalendarGridMotion,
  getCalendarHeaderMotion,
  type CalendarMotionDirection,
} from "./calendarMotion";

interface CalendarDay {
  key: string;
  label: string;
  muted: boolean;
  active: boolean;
  hasActivity: boolean;
}

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

const styles = stylex.create({
  icon: { height: 16, width: 16 },
  calendar: {
    backgroundColor: tokens.card,
    border: `1px solid ${tokens.border}`,
    borderRadius: "inherit",
    // Fills the Home Grid tile and scrolls itself, so the scrollbar stays inside this border
    // instead of on the tile wrapper outside it.
    height: "100%",
    overflowY: "auto",
    padding: 20,
    "@media (min-width: 48rem)": { padding: 24 },
  },
  calendarHeader: {
    alignItems: "center",
    display: "grid",
    gap: 8,
    gridTemplateColumns: "2rem 1fr 2rem",
    marginBottom: 16,
  },
  calendarButton: {
    alignItems: "center",
    borderRadius: 9999,
    color: tokens.oliveSoft,
    display: "flex",
    height: 32,
    justifyContent: "center",
    outline: "none",
    transition: "color 150ms, background-color 150ms",
    width: 32,
    ":hover": { backgroundColor: tokens.hover, color: tokens.oliveText },
    // Inner ring matches the widget's own surface; the outer ring carries the olive accent so it
    // stays visible against the page in both themes. Matches Button.tsx's FOCUS_RING convention.
    ":focus-visible": { boxShadow: `0 0 0 2px ${tokens.surface}, 0 0 0 4px ${tokens.oliveSoft}` },
  },
  calendarLabelFrame: { height: 24, overflow: "hidden", position: "relative" },
  calendarLabel: {
    color: tokens.oliveText,
    fontSize: 15,
    fontWeight: 700,
    inset: 0,
    position: "absolute",
    textAlign: "center",
  },
  calendarGrid: {
    display: "grid",
    columnGap: 4,
    gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
    rowGap: 8,
  },
  weekday: {
    color: tokens.oliveSoft,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.12em",
    textAlign: "center",
    textTransform: "uppercase",
  },
  calendarGridDays: {
    columnGap: 4,
    display: "grid",
    gridColumn: "span 7 / span 7",
    gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
    rowGap: 8,
  },
  calendarDay: {
    alignItems: "center",
    aspectRatio: 1,
    borderRadius: 9999,
    color: tokens.textMuted,
    display: "flex",
    fontSize: 14,
    justifyContent: "center",
    position: "relative",
    transition: "transform 150ms",
  },
  calendarDayMuted: { color: tokens.borderStrong },
  calendarDayActive: { backgroundColor: tokens.olive, color: tokens.textInverse, fontWeight: 700 },
  dayRing: {
    border: `1px solid color-mix(in srgb, ${tokens.oliveSoft} 55%, transparent)`,
    borderRadius: 9999,
    inset: 0,
    position: "absolute",
  },
  dayLabel: { position: "relative", zIndex: 10 },
  activityDot: {
    backgroundColor: tokens.oliveText,
    borderRadius: 9999,
    bottom: 6,
    height: 6,
    position: "absolute",
    width: 6,
  },
  activityDotActive: { backgroundColor: tokens.textInverse },
});

const createCalendarDays = (monthDate: Date, activityTimestamps: number[]): CalendarDay[] => {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = (firstDay.getDay() + 6) % 7;
  const previousMonthDays = new Date(year, month, 0).getDate();
  const totalCells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;
  const today = new Date();
  const activitySet = new Set(
    activityTimestamps
      .filter((timestamp) => {
        const value = new Date(timestamp);
        return value.getFullYear() === year && value.getMonth() === month;
      })
      .map((timestamp) => new Date(timestamp).getDate()),
  );

  return Array.from({ length: totalCells }, (_, index) => {
    const dayNumber = index - firstWeekday + 1;
    const isCurrentMonth = dayNumber >= 1 && dayNumber <= daysInMonth;

    if (isCurrentMonth) {
      const isToday =
        today.getFullYear() === year && today.getMonth() === month && today.getDate() === dayNumber;

      return {
        key: `${year}-${month + 1}-${dayNumber}`,
        label: String(dayNumber),
        muted: false,
        active: isToday,
        hasActivity: activitySet.has(dayNumber),
      };
    }

    if (dayNumber < 1) {
      return {
        key: `prev-${index}`,
        label: String(previousMonthDays + dayNumber),
        muted: true,
        active: false,
        hasActivity: false,
      };
    }

    return {
      key: `next-${index}`,
      label: String(dayNumber - daysInMonth),
      muted: true,
      active: false,
      hasActivity: false,
    };
  });
};

const getMonthLabel = (monthDate: Date): string => {
  return monthDate.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
};

export function CalendarWidget({
  activityTimestamps,
}: {
  activityTimestamps: number[];
}): ReactElement {
  const reducedMotion = useReducedMotion() ?? false;
  const [calendarOffset, setCalendarOffset] = useState(0);
  const [calendarDirection, setCalendarDirection] = useState<CalendarMotionDirection>(0);

  const visibleMonth = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + calendarOffset, 1);
  }, [calendarOffset]);

  const calendarDays = useMemo(() => {
    return createCalendarDays(
      visibleMonth,
      activityTimestamps.filter((timestamp) => timestamp > 0),
    );
  }, [activityTimestamps, visibleMonth]);

  const handleCalendarNavigation = (direction: Exclude<CalendarMotionDirection, 0>) => {
    setCalendarDirection(direction);
    setCalendarOffset((current) => current + direction);
  };

  const calendarMonthKey = `${visibleMonth.getFullYear()}-${visibleMonth.getMonth()}`;
  const calendarHeaderMotion = getCalendarHeaderMotion(calendarDirection, reducedMotion);
  const calendarGridMotion = getCalendarGridMotion(calendarDirection, reducedMotion);

  return (
    <div {...stylex.props(styles.calendar)}>
      <div {...stylex.props(styles.calendarHeader)}>
        <motion.button
          type="button"
          onClick={() => handleCalendarNavigation(-1)}
          whileHover={reducedMotion ? undefined : { y: -1, scale: 1.03 }}
          whileTap={reducedMotion ? undefined : { scale: 0.97 }}
          transition={{
            duration: 0.16,
            ease: CALENDAR_MOTION_EASE,
          }}
          {...stylex.props(styles.calendarButton)}
          aria-label="Previous month"
        >
          <CaretLeftIcon className={stylex.props(styles.icon).className} weight="bold" />
        </motion.button>
        <div {...stylex.props(styles.calendarLabelFrame)}>
          <motion.h2
            key={`calendar-label-${calendarMonthKey}`}
            initial={calendarHeaderMotion.initial}
            animate={calendarHeaderMotion.animate}
            transition={calendarHeaderMotion.transition}
            {...stylex.props(styles.calendarLabel)}
          >
            {getMonthLabel(visibleMonth)}
          </motion.h2>
        </div>
        <motion.button
          type="button"
          onClick={() => handleCalendarNavigation(1)}
          whileHover={reducedMotion ? undefined : { y: -1, scale: 1.03 }}
          whileTap={reducedMotion ? undefined : { scale: 0.97 }}
          transition={{
            duration: 0.16,
            ease: CALENDAR_MOTION_EASE,
          }}
          {...stylex.props(styles.calendarButton)}
          aria-label="Next month"
        >
          <CaretRightIcon className={stylex.props(styles.icon).className} weight="bold" />
        </motion.button>
      </div>

      <div {...stylex.props(styles.calendarGrid)}>
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} {...stylex.props(styles.weekday)}>
            {label}
          </div>
        ))}

        <motion.div
          key={`calendar-grid-${calendarMonthKey}`}
          initial={calendarGridMotion.initial}
          animate={calendarGridMotion.animate}
          transition={calendarGridMotion.transition}
          {...stylex.props(styles.calendarGridDays)}
        >
          {calendarDays.map((day) => (
            <motion.div
              key={day.key}
              whileHover={reducedMotion || day.muted ? undefined : { y: -1, scale: 1.02 }}
              {...stylex.props(
                styles.calendarDay,
                day.muted ? styles.calendarDayMuted : day.active ? styles.calendarDayActive : null,
              )}
            >
              {day.active && !reducedMotion ? (
                <motion.span
                  initial={{ opacity: 0, scale: 0.82 }}
                  animate={{ opacity: 1, scale: 1.1 }}
                  transition={{
                    delay: 0.08,
                    duration: 0.34,
                    ease: CALENDAR_MOTION_EASE,
                  }}
                  {...stylex.props(styles.dayRing)}
                />
              ) : null}
              <span {...stylex.props(styles.dayLabel)}>{day.label}</span>
              {day.hasActivity && (
                <motion.span
                  initial={
                    reducedMotion ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.4, y: 2 }
                  }
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={{
                    delay: reducedMotion ? 0 : 0.1,
                    duration: reducedMotion ? 0.12 : 0.22,
                    ease: CALENDAR_MOTION_EASE,
                  }}
                  {...stylex.props(styles.activityDot, day.active && styles.activityDotActive)}
                />
              )}
            </motion.div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}
