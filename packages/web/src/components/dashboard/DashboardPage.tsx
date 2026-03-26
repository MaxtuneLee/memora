import { useStore } from "@livestore/react";
import {
  CaretDownIcon,
  CaretLeftIcon,
  CaretRightIcon,
  ChatCircleDotsIcon,
  CheckIcon,
  FileTextIcon,
  ImageIcon,
  MicrophoneIcon,
  SlidersHorizontalIcon,
  UploadSimpleIcon,
  VideoCameraIcon,
} from "@phosphor-icons/react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import type { ComponentType, ReactElement } from "react";
import { Link, useNavigate } from "react-router";

import {
  CALENDAR_MOTION_EASE,
  getCalendarGridMotion,
  getCalendarHeaderMotion,
  type CalendarMotionDirection,
} from "@/components/dashboard/calendarMotion";
import {
  getPrimaryWidgetOrder,
  PRIMARY_WIDGET_GRID_CLASS,
} from "@/components/dashboard/dashboardLayout";
import { cn } from "@/lib/cn";
import { AppMenu, AppMenuContent, AppMenuItem, AppMenuTrigger } from "@/components/menu/AppMenu";
import { desktopFilesQuery$ } from "@/lib/desktop/queries";
import { formatBytes, formatDuration } from "@/lib/format";
import { listChatSessions, type ChatSessionSummary } from "@/lib/chat/chatSessionStorage";
import { mapLiveStoreFileToMeta } from "@/lib/library/fileMappers";
import type { SearchNavigationState } from "@/types/search";
import type { FileMeta } from "@/types/library";

import { TodoPanel } from "./TodoPanel";
import { DEFAULT_WELCOME_COPY, getWelcomeCopy } from "./welcomeCopy";

type IconWeight = "regular" | "fill" | "duotone" | "bold";
type WidgetKey = "calendar" | "todo" | "recent";

interface WidgetVisibility {
  calendar: boolean;
  todo: boolean;
  recent: boolean;
}

interface RecentItem {
  id: string;
  title: string;
  subtitle: string;
  href: string;
  updatedAt: number;
  icon: ComponentType<{ className?: string; weight?: IconWeight }>;
  iconWeight?: IconWeight;
  shellClassName: string;
  iconClassName: string;
}

interface CalendarDay {
  key: string;
  label: string;
  muted: boolean;
  active: boolean;
  hasActivity: boolean;
}

const DASHBOARD_FONT_FAMILY = '"Inter", ui-sans-serif, sans-serif';
const WIDGETS_STORAGE_KEY = "memora:dashboard:widgets";
const WELCOME_TYPE_START_DELAY_MS = 140;
const WELCOME_TYPE_INTERVAL_MS = 34;
const DEFAULT_WIDGET_VISIBILITY: WidgetVisibility = {
  calendar: true,
  todo: true,
  recent: true,
};
const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

const readWidgetVisibility = (): WidgetVisibility => {
  if (typeof window === "undefined") {
    return DEFAULT_WIDGET_VISIBILITY;
  }

  try {
    const raw = window.localStorage.getItem(WIDGETS_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_WIDGET_VISIBILITY;
    }

    const parsed = JSON.parse(raw) as Partial<WidgetVisibility>;

    return {
      calendar: parsed.calendar ?? true,
      todo: parsed.todo ?? true,
      recent: parsed.recent ?? true,
    };
  } catch {
    return DEFAULT_WIDGET_VISIBILITY;
  }
};

const formatRelativeTimestamp = (timestamp: number): string => {
  if (!Number.isFinite(timestamp)) {
    return "Just now";
  }

  const deltaMs = Date.now() - timestamp;
  const minutes = Math.max(0, Math.floor(deltaMs / 60000));

  if (minutes < 1) {
    return "Just now";
  }

  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }

  const days = Math.floor(hours / 24);

  if (days < 7) {
    return `${days} day${days === 1 ? "" : "s"} ago`;
  }

  return new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
};

const formatChatTimestamp = (timestamp: number): string => {
  if (!Number.isFinite(timestamp)) {
    return "No messages yet";
  }

  return new Date(timestamp).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const getFileHref = (file: FileMeta): string => {
  if (file.type === "audio" || file.type === "video") {
    return `/transcript/file/${file.id}`;
  }

  return "/files";
};

const createUploadNavigationState = (): SearchNavigationState => {
  return {
    searchDesktopIntent: {
      requestId: crypto.randomUUID(),
      intent: {
        type: "uploadFile",
        parentId: null,
      },
    },
  };
};

const buildFileRecentItem = (file: FileMeta): RecentItem => {
  if (file.type === "audio" || file.type === "video") {
    return {
      id: `file:${file.id}`,
      title: file.name,
      subtitle: [
        "Recording",
        file.transcriptPath
          ? "Transcript ready"
          : `Updated ${formatRelativeTimestamp(file.updatedAt)}`,
        file.durationSec ? `${formatDuration(file.durationSec)} long` : null,
      ]
        .filter(Boolean)
        .join(" • "),
      href: getFileHref(file),
      updatedAt: file.updatedAt,
      icon: file.type === "video" ? VideoCameraIcon : MicrophoneIcon,
      iconWeight: file.type === "video" ? "fill" : "regular",
      shellClassName: "bg-[#f5f0e8]",
      iconClassName: "text-[#8a7e6c]",
    };
  }

  return {
    id: `file:${file.id}`,
    title: file.name,
    subtitle: `File • ${formatBytes(file.sizeBytes)} • Updated ${formatRelativeTimestamp(file.updatedAt)}`,
    href: getFileHref(file),
    updatedAt: file.updatedAt,
    icon: file.type === "image" ? ImageIcon : FileTextIcon,
    iconWeight: "fill",
    shellClassName: "bg-[#f4f1ea]",
    iconClassName: "text-[#6b655d]",
  };
};

const buildChatRecentItem = (session: ChatSessionSummary): RecentItem => {
  return {
    id: `chat:${session.id}`,
    title: session.title,
    subtitle: `Chat • Last message ${formatChatTimestamp(session.updatedAt)}`,
    href: `/chat?session=${encodeURIComponent(session.id)}`,
    updatedAt: session.updatedAt,
    icon: ChatCircleDotsIcon,
    iconWeight: "fill",
    shellClassName: "bg-[#f2efe6]",
    iconClassName: "text-[#65704e]",
  };
};

const buildRecentItems = (files: FileMeta[], chatSessions: ChatSessionSummary[]): RecentItem[] => {
  const fileItems = files.map(buildFileRecentItem);
  const chatItems = chatSessions.map(buildChatRecentItem);
  const merged = [...fileItems, ...chatItems]
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, 5);

  if (merged.length > 0) {
    return merged;
  }

  return [
    {
      id: "empty:recording",
      title: "Start your first recording",
      subtitle: "Capture an idea and it will show up here.",
      href: "/transcript/live",
      updatedAt: 0,
      icon: MicrophoneIcon,
      iconWeight: "regular",
      shellClassName: "bg-[#f5f0e8]",
      iconClassName: "text-[#8a7e6c]",
    },
    {
      id: "empty:upload",
      title: "Upload reference material",
      subtitle: "Bring in notes, slides, or PDFs for later.",
      href: "/desktop",
      updatedAt: 0,
      icon: UploadSimpleIcon,
      iconWeight: "regular",
      shellClassName: "bg-[#f4f1ea]",
      iconClassName: "text-[#6b655d]",
    },
    {
      id: "empty:chat",
      title: "Open a fresh chat",
      subtitle: "Use Chat when you want to reason across your material.",
      href: "/chat",
      updatedAt: 0,
      icon: ChatCircleDotsIcon,
      iconWeight: "fill",
      shellClassName: "bg-[#f2efe6]",
      iconClassName: "text-[#65704e]",
    },
  ];
};

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

function MenuActionItem({
  title,
  note,
  icon: Icon,
  iconWeight = "regular",
  onSelect,
}: {
  title: string;
  note: string;
  icon: ComponentType<{ className?: string; weight?: IconWeight }>;
  iconWeight?: IconWeight;
  onSelect: () => void;
}): ReactElement {
  return (
    <AppMenuItem
      onClick={onSelect}
      className="grid w-full cursor-pointer grid-cols-[2rem_minmax(0,1fr)] items-center gap-3 rounded-2xl px-3 py-2.5 text-left outline-none transition data-[highlighted]:bg-[#faf7f0]"
    >
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#f6f3ec] text-[#7c7265]">
        <Icon className="size-[18px]" weight={iconWeight} />
      </div>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-memora-text">{title}</div>
        <div className="mt-0.5 text-[11px] leading-4 text-[#7a7369]">{note}</div>
      </div>
    </AppMenuItem>
  );
}

function WidgetToggleItem({
  checked,
  label,
  note,
  onSelect,
}: {
  checked: boolean;
  label: string;
  note: string;
  onSelect: () => void;
}): ReactElement {
  return (
    <AppMenuItem
      onClick={onSelect}
      className="flex w-full cursor-pointer items-start justify-between gap-3 rounded-2xl px-3 py-2.5 text-left outline-none transition data-[highlighted]:bg-[#faf7f0]"
    >
      <div className="min-w-0">
        <div className="text-sm font-semibold text-memora-text">{label}</div>
        <div className="mt-0.5 text-[11px] leading-4 text-[#7a7369]">{note}</div>
      </div>
      <div
        className={cn(
          "mt-0.5 flex h-5 w-5 items-center justify-center rounded-md border transition",
          checked
            ? "border-[#7b875a] bg-[#7b875a] text-[#fffdfa]"
            : "border-[#d8d1c5] bg-white text-transparent",
        )}
      >
        <CheckIcon className="size-3.5" weight="bold" />
      </div>
    </AppMenuItem>
  );
}

function RecentRow({ item }: { item: RecentItem }): ReactElement {
  const Icon = item.icon;

  return (
    <Link
      to={item.href}
      className="group grid grid-cols-[2.625rem_minmax(0,1fr)_auto] items-center gap-3 border-t border-[#ece5d9] px-5 py-3.5 transition-colors first:border-t-0 hover:bg-[#fcfaf5]"
    >
      <div
        className={cn(
          "flex h-[42px] w-[42px] items-center justify-center rounded-[14px]",
          item.shellClassName,
        )}
      >
        <Icon className={cn("size-5", item.iconClassName)} weight={item.iconWeight ?? "regular"} />
      </div>
      <div className="min-w-0">
        <p className="truncate text-[15px] font-semibold text-memora-text">{item.title}</p>
        <p className="mt-1 truncate text-xs text-[#716c64]">{item.subtitle}</p>
      </div>
      <CaretRightIcon className="size-4 text-[#9a948a] transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

function EmptyWidgetsState({ onReset }: { onReset: () => void }): ReactElement {
  return (
    <div className="rounded-[1.75rem] border border-[#e9e5dc] bg-[#fffdf8] px-6 py-8 text-center">
      <p className="text-sm font-semibold text-memora-text">All widgets are hidden.</p>
      <p className="mt-1 text-sm text-[#716c64]">
        Turn a few back on to rebuild your workspace view.
      </p>
      <button
        type="button"
        onClick={onReset}
        className="mt-4 inline-flex min-h-11 items-center rounded-full border border-[#e7e1d7] bg-[#fffdfa] px-4 text-sm font-semibold text-memora-text transition hover:bg-[#fffcf6]"
      >
        Reset widgets
      </button>
    </div>
  );
}

export const Component = (): ReactElement => {
  const { store } = useStore();
  const navigate = useNavigate();
  const reducedMotion = useReducedMotion() ?? false;
  const fileRows = store.useQuery(desktopFilesQuery$);
  const [chatSessions, setChatSessions] = useState<ChatSessionSummary[]>([]);
  const [chatSessionsLoaded, setChatSessionsLoaded] = useState(false);
  const [calendarOffset, setCalendarOffset] = useState(0);
  const [calendarDirection, setCalendarDirection] = useState<CalendarMotionDirection>(0);
  const [typedWelcomeTitle, setTypedWelcomeTitle] = useState<string>(DEFAULT_WELCOME_COPY.title);
  const [hasTypedWelcomeTitle, setHasTypedWelcomeTitle] = useState(false);
  const [widgetVisibility, setWidgetVisibility] = useState<WidgetVisibility>(() =>
    readWidgetVisibility(),
  );

  useEffect(() => {
    let cancelled = false;

    const loadSessions = async () => {
      try {
        const nextSessions = await listChatSessions();
        if (!cancelled) {
          setChatSessions(nextSessions);
          setChatSessionsLoaded(true);
        }
      } catch {
        if (!cancelled) {
          setChatSessions([]);
          setChatSessionsLoaded(true);
        }
      }
    };

    void loadSessions();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(WIDGETS_STORAGE_KEY, JSON.stringify(widgetVisibility));
  }, [widgetVisibility]);

  const files = useMemo(() => {
    return fileRows.map(mapLiveStoreFileToMeta);
  }, [fileRows]);

  const recentItems = useMemo(() => {
    return buildRecentItems(files, chatSessions);
  }, [chatSessions, files]);

  const recentActivityCount = useMemo(() => {
    return recentItems.filter((item) => item.updatedAt > 0).length;
  }, [recentItems]);

  const welcomeCopy = useMemo(() => {
    if (!chatSessionsLoaded) {
      return DEFAULT_WELCOME_COPY;
    }

    return getWelcomeCopy({
      fileCount: files.length,
      chatCount: chatSessions.length,
      recentCount: recentActivityCount,
      now: new Date(),
    });
  }, [chatSessions.length, chatSessionsLoaded, files.length, recentActivityCount]);

  useEffect(() => {
    if (!chatSessionsLoaded) {
      setTypedWelcomeTitle(DEFAULT_WELCOME_COPY.title);
      return;
    }

    if (reducedMotion) {
      setTypedWelcomeTitle(welcomeCopy.title);
      setHasTypedWelcomeTitle(true);
      return;
    }

    if (hasTypedWelcomeTitle) {
      setTypedWelcomeTitle(welcomeCopy.title);
      return;
    }

    setTypedWelcomeTitle("");

    let intervalId: number | undefined;
    let characterIndex = 0;
    const timeoutId = window.setTimeout(() => {
      intervalId = window.setInterval(() => {
        characterIndex += 1;
        setTypedWelcomeTitle(welcomeCopy.title.slice(0, characterIndex));

        if (characterIndex >= welcomeCopy.title.length) {
          if (intervalId !== undefined) {
            window.clearInterval(intervalId);
          }
          setHasTypedWelcomeTitle(true);
        }
      }, WELCOME_TYPE_INTERVAL_MS);
    }, WELCOME_TYPE_START_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
      if (intervalId !== undefined) {
        window.clearInterval(intervalId);
      }
    };
  }, [chatSessionsLoaded, hasTypedWelcomeTitle, reducedMotion, welcomeCopy.title]);

  const visibleMonth = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + calendarOffset, 1);
  }, [calendarOffset]);

  const calendarDays = useMemo(() => {
    return createCalendarDays(
      visibleMonth,
      recentItems.map((item) => item.updatedAt).filter((timestamp) => timestamp > 0),
    );
  }, [recentItems, visibleMonth]);

  const hasVisibleWidgets =
    widgetVisibility.calendar || widgetVisibility.todo || widgetVisibility.recent;
  const showTypingCursor =
    chatSessionsLoaded &&
    !reducedMotion &&
    !hasTypedWelcomeTitle &&
    typedWelcomeTitle.length < welcomeCopy.title.length;

  const heroAnimations = reducedMotion
    ? {}
    : {
        initial: { opacity: 0, y: 18 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.42, ease: CALENDAR_MOTION_EASE },
      };

  const getSectionMotion = (delay: number) => {
    if (reducedMotion) {
      return {};
    }

    return {
      initial: { opacity: 0, y: 18 },
      animate: { opacity: 1, y: 0 },
      transition: { delay, duration: 0.42, ease: CALENDAR_MOTION_EASE },
    };
  };

  const handleUpload = () => {
    void navigate("/desktop", { state: createUploadNavigationState() });
  };

  const handleCalendarNavigation = (direction: Exclude<CalendarMotionDirection, 0>) => {
    setCalendarDirection(direction);
    setCalendarOffset((current) => current + direction);
  };

  const toggleWidget = (widget: WidgetKey) => {
    setWidgetVisibility((current) => ({
      ...current,
      [widget]: !current[widget],
    }));
  };

  const resetWidgets = () => {
    setWidgetVisibility(DEFAULT_WIDGET_VISIBILITY);
  };

  const calendarMonthKey = `${visibleMonth.getFullYear()}-${visibleMonth.getMonth()}`;
  const calendarHeaderMotion = getCalendarHeaderMotion(calendarDirection, reducedMotion);
  const calendarGridMotion = getCalendarGridMotion(calendarDirection, reducedMotion);
  const primaryWidgetOrder = getPrimaryWidgetOrder({
    calendar: widgetVisibility.calendar,
    todo: widgetVisibility.todo,
  });
  const calendarWidget = (
    <div key="calendar" className="rounded-[1.7rem] border border-[#e9e5dc] bg-white p-5 md:p-6">
      <div className="mb-4 grid grid-cols-[2rem_1fr_2rem] items-center gap-2">
        <motion.button
          type="button"
          onClick={() => handleCalendarNavigation(-1)}
          whileHover={reducedMotion ? undefined : { y: -1, scale: 1.03 }}
          whileTap={reducedMotion ? undefined : { scale: 0.97 }}
          transition={{
            duration: 0.16,
            ease: CALENDAR_MOTION_EASE,
          }}
          className="flex h-8 w-8 items-center justify-center rounded-full text-[#9aa28d] transition hover:bg-[#f5f1e8] hover:text-[#6c7654] focus-visible:ring-2 focus-visible:ring-[#a7af8f] focus-visible:ring-offset-2 focus-visible:ring-offset-white outline-none"
          aria-label="Previous month"
        >
          <CaretLeftIcon className="size-4" weight="bold" />
        </motion.button>
        <div className="relative h-6 overflow-hidden">
          <motion.h2
            key={`calendar-label-${calendarMonthKey}`}
            initial={calendarHeaderMotion.initial}
            animate={calendarHeaderMotion.animate}
            transition={calendarHeaderMotion.transition}
            className="absolute inset-0 text-center text-[15px] font-bold text-[#4f5742]"
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
          className="flex h-8 w-8 items-center justify-center rounded-full text-[#9aa28d] transition hover:bg-[#f5f1e8] hover:text-[#6c7654] focus-visible:ring-2 focus-visible:ring-[#a7af8f] focus-visible:ring-offset-2 focus-visible:ring-offset-white outline-none"
          aria-label="Next month"
        >
          <CaretRightIcon className="size-4" weight="bold" />
        </motion.button>
      </div>

      <div className="grid grid-cols-7 gap-x-1 gap-y-2">
        {WEEKDAY_LABELS.map((label) => (
          <div
            key={label}
            className="text-center text-[10px] font-bold tracking-[0.12em] text-[#9aa28d] uppercase"
          >
            {label}
          </div>
        ))}

        <motion.div
          key={`calendar-grid-${calendarMonthKey}`}
          initial={calendarGridMotion.initial}
          animate={calendarGridMotion.animate}
          transition={calendarGridMotion.transition}
          className="col-span-7 grid grid-cols-7 gap-x-1 gap-y-2"
        >
          {calendarDays.map((day) => (
            <motion.div
              key={day.key}
              whileHover={reducedMotion || day.muted ? undefined : { y: -1, scale: 1.02 }}
              className={cn(
                "relative flex aspect-square items-center justify-center rounded-full text-sm transition-transform",
                day.muted
                  ? "text-[#c9c4bb]"
                  : day.active
                    ? "bg-[#7b875a] font-bold text-[#fffdfa]"
                    : "text-[#565b4f]",
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
                  className="absolute inset-0 rounded-full border border-[#aab48a]/55"
                />
              ) : null}
              <span className="relative z-10">{day.label}</span>
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
                  className={cn(
                    "absolute bottom-1.5 h-1.5 w-1.5 rounded-full",
                    day.active ? "bg-[#fffdfa]" : "bg-[#74824d]",
                  )}
                />
              )}
            </motion.div>
          ))}
        </motion.div>
      </div>
    </div>
  );

  return (
    <div
      className="min-h-full bg-memora-bg text-memora-text"
      style={{ fontFamily: DASHBOARD_FONT_FAMILY }}
    >
      <motion.div
        {...heroAnimations}
        className="mx-auto w-full max-w-[1080px] px-6 py-8 md:px-10 md:py-10"
      >
        <div className="px-6 py-7 md:px-8 md:py-8">
          <header className="border-b border-[#e9e5dc] pb-4">
            <div className="flex flex-col gap-3">
              <h1
                className="text-[clamp(1.85rem,4.2vw,2.9rem)] leading-[1] font-semibold tracking-[-0.045em] text-[#22211d] sm:whitespace-nowrap"
                aria-label={welcomeCopy.title}
                style={{ fontFamily: "var(--font-serif)" }}
              >
                <span>{typedWelcomeTitle}</span>
                {showTypingCursor ? (
                  <span
                    aria-hidden="true"
                    className="ml-[0.08em] inline-block w-[0.65ch] animate-pulse text-[#8d907a]"
                  >
                    |
                  </span>
                ) : null}
              </h1>
              <p className="max-w-[34rem] text-sm leading-6 text-[#716c64] md:text-[15px]">
                {welcomeCopy.description}
              </p>
            </div>
          </header>

          <div className="mx-auto mt-6 max-w-[920px]">
            <div className="mb-6 flex flex-wrap justify-end gap-2.5">
              <AppMenu>
                <AppMenuTrigger>
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#f6f3ec] text-[#7c7265]">
                    <UploadSimpleIcon className="size-[18px]" weight="regular" />
                  </span>
                  <span>New file</span>
                  <CaretDownIcon className="size-3.5 text-[#9a948a]" weight="bold" />
                </AppMenuTrigger>
                <AppMenuContent className="w-[224px]">
                  <MenuActionItem
                    title="Start recording"
                    note="Capture a thought quickly"
                    icon={MicrophoneIcon}
                    onSelect={() => navigate("/transcript/live")}
                  />
                  <MenuActionItem
                    title="Upload file"
                    note="Bring in notes or PDFs"
                    icon={UploadSimpleIcon}
                    onSelect={handleUpload}
                  />
                  <MenuActionItem
                    title="New chat"
                    note="Open a fresh thread"
                    icon={ChatCircleDotsIcon}
                    iconWeight="fill"
                    onSelect={() => navigate("/chat")}
                  />
                </AppMenuContent>
              </AppMenu>

              <AppMenu>
                <AppMenuTrigger>
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#f6f3ec] text-[#7c7265]">
                    <SlidersHorizontalIcon className="size-[18px]" />
                  </span>
                  <span>Edit widgets</span>
                </AppMenuTrigger>
                <AppMenuContent className="w-[240px]">
                  <WidgetToggleItem
                    checked={widgetVisibility.calendar}
                    label="Calendar"
                    note="Keep your month in view"
                    onSelect={() => toggleWidget("calendar")}
                  />
                  <WidgetToggleItem
                    checked={widgetVisibility.todo}
                    label="Todo"
                    note="Keep your markdown task note in reach"
                    onSelect={() => toggleWidget("todo")}
                  />
                  <WidgetToggleItem
                    checked={widgetVisibility.recent}
                    label="Recent"
                    note="Return to recordings, chats, and files"
                    onSelect={() => toggleWidget("recent")}
                  />
                </AppMenuContent>
              </AppMenu>
            </div>

            {!hasVisibleWidgets ? (
              <EmptyWidgetsState onReset={resetWidgets} />
            ) : (
              <div className="space-y-6">
                {(widgetVisibility.calendar || widgetVisibility.todo) && (
                  <motion.section {...getSectionMotion(0.08)} className={PRIMARY_WIDGET_GRID_CLASS}>
                    {primaryWidgetOrder.map((widget) => {
                      if (widget === "todo") {
                        return <TodoPanel key="todo" files={files} store={store} />;
                      }

                      return calendarWidget;
                    })}
                  </motion.section>
                )}

                {widgetVisibility.recent && (
                  <motion.section
                    {...getSectionMotion(0.16)}
                    className="overflow-hidden rounded-[1.45rem] border border-[#ebe4d8] bg-white"
                  >
                    <div className="px-5 py-4">
                      <h2 className="text-[17px] font-bold text-memora-text">Recent</h2>
                    </div>
                    <div>
                      {recentItems.map((item) => (
                        <RecentRow key={item.id} item={item} />
                      ))}
                    </div>
                  </motion.section>
                )}
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
};
