export type WelcomeState = "empty" | "returning" | "active";
export type DayPeriod = "morning" | "afternoon" | "evening" | "lateNight";

interface WelcomeCopyLibraryEntry {
  titles: readonly string[];
  descriptions: Record<DayPeriod, readonly string[]>;
}

export interface WelcomeCopy {
  title: string;
  description: string;
  state: WelcomeState;
  period: DayPeriod;
}

interface WelcomeCopyOptions {
  fileCount: number;
  chatCount: number;
  recentCount: number;
  now?: Date;
}

export const DEFAULT_WELCOME_COPY = {
  title: "Welcome back.",
  description: "Open a recent thread, add a note, or start a fresh capture.",
} as const;

export const WELCOME_COPY_LIBRARY: Record<WelcomeState, WelcomeCopyLibraryEntry> = {
  empty: {
    titles: ["Start with one idea.", "The desk is ready.", "A calm place to begin."],
    descriptions: {
      morning: [
        "The morning is clear. Add a note, a recording, or the first chat to set the pace.",
        "Start small this morning. One file or one question is enough to begin.",
        "A fresh morning is a good place for the first capture.",
      ],
      afternoon: [
        "Give the afternoon one anchor: a file to save, a thought to record, or a thread to open.",
        "If something is taking shape, bring it in now and let the rest follow.",
        "Use the middle of the day to drop in the piece you do not want to lose.",
      ],
      evening: [
        "Wrap the day into one clear note, recording, or question before it drifts away.",
        "An evening capture now gives tomorrow something real to resume.",
        "Leave a short trace of today here, then pick it up again when you return.",
      ],
      lateNight: [
        "Leave one thought here before the day goes quiet.",
        "Even a late note can keep the thread from slipping away.",
        "Put down the idea now. You can sort it out when the day resets.",
      ],
    },
  },
  returning: {
    titles: ["Pick up the thread.", "Your notes are waiting.", "There is more to follow."],
    descriptions: {
      morning: [
        "There is already a trail here. Use the quiet of the morning to push it a little further.",
        "You already left yourself context. This morning is a good time to reopen it.",
        "Pick up the last file or thread while the day is still calm.",
      ],
      afternoon: [
        "Jump back into the thread that already has shape and keep the day moving.",
        "The work has already started. The afternoon is for giving it another pass.",
        "Reopen the last thing you touched and keep its momentum alive.",
      ],
      evening: [
        "Return to the last thread and pull the day into something more finished.",
        "The evening is better for continuation than restart. Pick up what is already waiting.",
        "There is enough context here to close one loop before the day ends.",
      ],
      lateNight: [
        "You already have a trail. Leave it a little clearer for tomorrow.",
        "Late is fine for a small continuation. Reopen one thread and sharpen it.",
        "Revisit the last piece, then leave your future self a cleaner handoff.",
      ],
    },
  },
  active: {
    titles: ["Everything is in motion.", "Your work has momentum.", "The pieces are on the table."],
    descriptions: {
      morning: [
        "You have enough material on the table to make real progress this morning.",
        "The day is already stocked with threads. Choose one and drive it forward.",
        "There is real momentum here. Use the morning to connect a few pieces.",
      ],
      afternoon: [
        "The afternoon is for stitching the active threads together into something useful.",
        "Your workspace already has energy. Use this part of the day to consolidate it.",
        "You have enough in motion to turn scattered inputs into one clear line of thinking.",
      ],
      evening: [
        "There is plenty here to review, connect, and close out before the day ends.",
        "Use the evening to gather what moved today into something you can return to tomorrow.",
        "The threads are already alive. Tonight is a good time to weave a few together.",
      ],
      lateNight: [
        "A short late-night pass can make tomorrow much easier to pick up.",
        "You already have momentum. Use a quiet minute to leave the work in better order.",
        "Before logging off, tie together one active thread and leave the rest ready.",
      ],
    },
  },
};

export const getDayPeriod = (now: Date): DayPeriod => {
  const hour = now.getHours();

  if (hour >= 5 && hour < 12) {
    return "morning";
  }

  if (hour >= 12 && hour < 18) {
    return "afternoon";
  }

  if (hour >= 18 && hour < 23) {
    return "evening";
  }

  return "lateNight";
};

export const getWelcomeState = ({
  fileCount,
  chatCount,
  recentCount,
}: Omit<WelcomeCopyOptions, "now">): WelcomeState => {
  if (fileCount === 0 && chatCount === 0) {
    return "empty";
  }

  if ((fileCount > 0 && chatCount > 0) || recentCount >= 4 || fileCount + chatCount >= 5) {
    return "active";
  }

  return "returning";
};

const getDayOfYear = (now: Date): number => {
  const startOfYear = new Date(now.getFullYear(), 0, 0);
  const diff = now.getTime() - startOfYear.getTime();

  return Math.floor(diff / 86_400_000);
};

const getVariantIndex = (seed: number, length: number, offset = 0): number => {
  return Math.abs(seed + offset) % length;
};

export const getWelcomeCopy = ({
  fileCount,
  chatCount,
  recentCount,
  now = new Date(),
}: WelcomeCopyOptions): WelcomeCopy => {
  const state = getWelcomeState({
    fileCount,
    chatCount,
    recentCount,
  });
  const period = getDayPeriod(now);
  const entry = WELCOME_COPY_LIBRARY[state];
  const dailySeed = getDayOfYear(now) + fileCount * 7 + chatCount * 11 + recentCount * 13;
  const title = entry.titles[getVariantIndex(dailySeed, entry.titles.length)];
  const descriptions = entry.descriptions[period];
  const description = descriptions[getVariantIndex(dailySeed, descriptions.length, 1)];

  return {
    title,
    description,
    state,
    period,
  };
};
