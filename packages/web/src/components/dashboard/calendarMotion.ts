export type CalendarMotionDirection = -1 | 0 | 1;

export const CALENDAR_MOTION_EASE = [0.22, 1, 0.36, 1] as const;

const REDUCED_MOTION_TRANSITION = {
  duration: 0.12,
} as const;

export const getCalendarHeaderMotion = (
  direction: CalendarMotionDirection,
  reducedMotion: boolean,
) => {
  if (reducedMotion) {
    return {
      initial: { opacity: 1, y: 0 },
      animate: { opacity: 1, y: 0 },
      transition: REDUCED_MOTION_TRANSITION,
    };
  }

  return {
    initial: {
      opacity: 0,
      y: direction === 0 ? 0 : direction * 10,
    },
    animate: { opacity: 1, y: 0 },
    transition: {
      duration: 0.26,
      ease: CALENDAR_MOTION_EASE,
    },
  };
};

export const getCalendarGridMotion = (
  direction: CalendarMotionDirection,
  reducedMotion: boolean,
) => {
  if (reducedMotion) {
    return {
      initial: { opacity: 1, x: 0, y: 0 },
      animate: { opacity: 1, x: 0, y: 0 },
      transition: REDUCED_MOTION_TRANSITION,
    };
  }

  return {
    initial: {
      opacity: 0,
      x: direction === 0 ? 0 : direction * 24,
      y: 0,
    },
    animate: {
      opacity: 1,
      x: 0,
      y: 0,
    },
    transition: {
      duration: 0.32,
      ease: CALENDAR_MOTION_EASE,
    },
  };
};
