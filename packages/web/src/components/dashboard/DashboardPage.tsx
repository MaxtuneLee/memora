import { useAppStore } from "@/livestore/store";
import {
  CaretDownIcon,
  CaretLeftIcon,
  CaretRightIcon,
  ChatCircleDotsIcon,
  CheckIcon,
  FileTextIcon,
  MicrophoneIcon,
  SlidersHorizontalIcon,
  UploadSimpleIcon,
  VideoCameraIcon,
} from "@phosphor-icons/react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import * as stylex from "@stylexjs/stylex";
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
  dashboardLayoutStyles,
} from "@/components/dashboard/dashboardLayout";
import { DashboardWelcomeHeading } from "@/components/dashboard/DashboardWelcomeHeading";
import { AppMenu, AppMenuContent, AppMenuItem, AppMenuTrigger } from "@/components/menu/AppMenu";
import { desktopFilesQuery$, desktopFoldersQuery$ } from "@/lib/desktop/queries";
import { getDocumentEditorHref, isEditableTextDocument } from "@/lib/editor/editableTextDocument";
import { getFileIcon } from "@/lib/library/fileIcon";
import { createNewMarkdownNote } from "@/lib/editor/noteCreation";
import { formatBytes, formatDuration } from "@/lib/format";
import { listChatSessions, type ChatSessionSummary } from "@/lib/chat/chatSessionStorage";
import { mapLiveStoreFileToMeta } from "@/lib/library/fileMappers";
import { settingsDocumentQuery$ } from "@/lib/settings/queries";
import { fileEvents } from "@/livestore/file";
import { normalizeSettingsValue, settingsTable, type setting } from "@/livestore/setting";
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
  tone: "recording" | "file" | "chat";
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
const DEFAULT_WIDGET_VISIBILITY: WidgetVisibility = {
  calendar: true,
  todo: true,
  recent: true,
};
const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

const styles = stylex.create({
  icon: { height: 16, width: 16 },
  menuAction: {
    alignItems: "center",
    borderRadius: 16,
    cursor: "pointer",
    display: "grid",
    gap: 12,
    gridTemplateColumns: "2rem minmax(0, 1fr)",
    outline: "none",
    paddingBlock: 10,
    paddingInline: 12,
    textAlign: "left",
    transition: "background-color 150ms",
    width: "100%",
    "[data-highlighted]": { backgroundColor: "#faf7f0" },
  },
  menuIconShell: {
    alignItems: "center",
    backgroundColor: "#f6f3ec",
    borderRadius: 9999,
    color: "#7c7265",
    display: "flex",
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  menuIcon: { height: 18, width: 18 },
  menuCopy: { minWidth: 0 },
  menuTitle: { color: "#1d1c1a", fontSize: 14, fontWeight: 600 },
  menuNote: { color: "#7a7369", fontSize: 11, lineHeight: "16px", marginTop: 2 },
  toggleItem: {
    alignItems: "flex-start",
    borderRadius: 16,
    cursor: "pointer",
    display: "flex",
    gap: 12,
    justifyContent: "space-between",
    outline: "none",
    paddingBlock: 10,
    paddingInline: 12,
    textAlign: "left",
    transition: "background-color 150ms",
    width: "100%",
    "[data-highlighted]": { backgroundColor: "#faf7f0" },
  },
  toggle: {
    alignItems: "center",
    backgroundColor: "white",
    border: "1px solid #d8d1c5",
    borderRadius: 6,
    color: "transparent",
    display: "flex",
    height: 20,
    justifyContent: "center",
    marginTop: 2,
    transition: "all 150ms",
    width: 20,
  },
  toggleChecked: { backgroundColor: "#7b875a", borderColor: "#7b875a", color: "#fffdfa" },
  checkIcon: { height: 14, width: 14 },
  recentRow: {
    alignItems: "center",
    borderTop: "1px solid #ece5d9",
    display: "grid",
    gap: 12,
    gridTemplateColumns: "2.625rem minmax(0, 1fr) auto",
    paddingBlock: 14,
    paddingInline: 20,
    textDecoration: "none",
    transition: "background-color 150ms",
    ":hover": { backgroundColor: "#fcfaf5" },
    ":first-child": { borderTopWidth: 0 },
  },
  recentIconShell: {
    alignItems: "center",
    borderRadius: 14,
    display: "flex",
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  recordingShell: { backgroundColor: "#f5f0e8" },
  fileShell: { backgroundColor: "#f4f1ea" },
  chatShell: { backgroundColor: "#f2efe6" },
  recentIcon: { height: 20, width: 20 },
  recordingIcon: { color: "#8a7e6c" },
  fileIcon: { color: "#6b655d" },
  chatIcon: { color: "#65704e" },
  recentCopy: { minWidth: 0 },
  recentTitle: {
    color: "#1d1c1a",
    fontSize: 15,
    fontWeight: 600,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  recentSubtitle: {
    color: "#716c64",
    fontSize: 12,
    marginTop: 4,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  recentArrow: { color: "#9a948a", height: 16, transition: "transform 150ms", width: 16 },
  emptyWidgets: {
    backgroundColor: "#fffdf8",
    border: "1px solid #e9e5dc",
    borderRadius: 28,
    paddingBlock: 32,
    paddingInline: 24,
    textAlign: "center",
  },
  emptyTitle: { color: "#1d1c1a", fontSize: 14, fontWeight: 600 },
  emptyDescription: { color: "#716c64", fontSize: 14, marginTop: 4 },
  resetButton: {
    alignItems: "center",
    backgroundColor: "#fffdfa",
    border: "1px solid #e7e1d7",
    borderRadius: 9999,
    color: "#1d1c1a",
    display: "inline-flex",
    fontSize: 14,
    fontWeight: 600,
    marginTop: 16,
    minHeight: 44,
    paddingInline: 16,
    transition: "background-color 150ms",
    ":hover": { backgroundColor: "#fffcf6" },
  },
  calendar: {
    backgroundColor: "white",
    border: "1px solid #e9e5dc",
    borderRadius: 27,
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
    color: "#9aa28d",
    display: "flex",
    height: 32,
    justifyContent: "center",
    outline: "none",
    transition: "color 150ms, background-color 150ms",
    width: 32,
    ":hover": { backgroundColor: "#f5f1e8", color: "#6c7654" },
    ":focus-visible": { boxShadow: "0 0 0 2px #a7af8f, 0 0 0 4px white" },
  },
  calendarLabelFrame: { height: 24, overflow: "hidden", position: "relative" },
  calendarLabel: {
    color: "#4f5742",
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
    color: "#9aa28d",
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
    color: "#565b4f",
    display: "flex",
    fontSize: 14,
    justifyContent: "center",
    position: "relative",
    transition: "transform 150ms",
  },
  calendarDayMuted: { color: "#c9c4bb" },
  calendarDayActive: { backgroundColor: "#7b875a", color: "#fffdfa", fontWeight: 700 },
  dayRing: {
    border: "1px solid rgb(170 180 138 / 0.55)",
    borderRadius: 9999,
    inset: 0,
    position: "absolute",
  },
  dayLabel: { position: "relative", zIndex: 10 },
  activityDot: {
    backgroundColor: "#74824d",
    borderRadius: 9999,
    bottom: 6,
    height: 6,
    position: "absolute",
    width: 6,
  },
  activityDotActive: { backgroundColor: "#fffdfa" },
  page: { backgroundColor: "#fcfaf6", color: "#1d1c1a", minHeight: "100%" },
  pageContent: {
    marginInline: "auto",
    maxWidth: 1080,
    paddingBlock: 32,
    paddingInline: 24,
    width: "100%",
    "@media (min-width: 48rem)": { paddingBlock: 40, paddingInline: 40 },
  },
  hero: { paddingBottom: 28, "@media (min-width: 48rem)": { paddingBottom: 32 } },
  welcomeHeader: { borderBottom: "1px solid #e9e5dc", paddingBottom: 16 },
  widgetsArea: { marginTop: 24 },
  menuRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "flex-end",
    marginBottom: 24,
  },
  triggerIconShell: {
    alignItems: "center",
    backgroundColor: "#f6f3ec",
    borderRadius: 9999,
    color: "#7c7265",
    display: "flex",
    height: 28,
    justifyContent: "center",
    width: 28,
  },
  triggerCaret: { color: "#9a948a", height: 14, width: 14 },
  menuContentNarrow: { width: 224 },
  menuContentWide: { width: 240 },
  widgetStack: { display: "flex", flexDirection: "column", gap: 24 },
  recentWidget: {
    backgroundColor: "white",
    border: "1px solid #ebe4d8",
    borderRadius: 23,
    overflow: "hidden",
  },
  recentWidgetHeader: { paddingBlock: 16, paddingInline: 20 },
  recentWidgetTitle: { color: "#1d1c1a", fontSize: 17, fontWeight: 700 },
});

const getRecentShellStyle = (tone: RecentItem["tone"]) => {
  if (tone === "recording") {
    return styles.recordingShell;
  }

  if (tone === "file") {
    return styles.fileShell;
  }

  return styles.chatShell;
};

const getRecentIconStyle = (tone: RecentItem["tone"]) => {
  if (tone === "recording") {
    return styles.recordingIcon;
  }

  if (tone === "file") {
    return styles.fileIcon;
  }

  return styles.chatIcon;
};

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

export const getFileHref = (file: Pick<FileMeta, "id" | "mimeType" | "name" | "type">): string => {
  if (file.type === "audio" || file.type === "video") {
    return `/transcript/file/${file.id}`;
  }

  if (isEditableTextDocument(file)) {
    return getDocumentEditorHref(file.id);
  }

  return "/desktop";
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
      tone: "recording",
    };
  }

  return {
    id: `file:${file.id}`,
    title: file.name,
    subtitle: `File • ${formatBytes(file.sizeBytes)} • Updated ${formatRelativeTimestamp(file.updatedAt)}`,
    href: getFileHref(file),
    updatedAt: file.updatedAt,
    icon: getFileIcon(file),
    iconWeight: "fill",
    tone: "file",
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
    tone: "chat",
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
      tone: "recording",
    },
    {
      id: "empty:upload",
      title: "Upload reference material",
      subtitle: "Bring in notes, slides, or PDFs for later.",
      href: "/desktop",
      updatedAt: 0,
      icon: UploadSimpleIcon,
      iconWeight: "regular",
      tone: "file",
    },
    {
      id: "empty:chat",
      title: "Open a fresh chat",
      subtitle: "Use Chat when you want to reason across your material.",
      href: "/chat",
      updatedAt: 0,
      icon: ChatCircleDotsIcon,
      iconWeight: "fill",
      tone: "chat",
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
    <AppMenuItem onClick={onSelect} className={stylex.props(styles.menuAction).className}>
      <div {...stylex.props(styles.menuIconShell)}>
        <Icon className={stylex.props(styles.menuIcon).className} weight={iconWeight} />
      </div>
      <div {...stylex.props(styles.menuCopy)}>
        <div {...stylex.props(styles.menuTitle)}>{title}</div>
        <div {...stylex.props(styles.menuNote)}>{note}</div>
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
    <AppMenuItem onClick={onSelect} className={stylex.props(styles.toggleItem).className}>
      <div {...stylex.props(styles.menuCopy)}>
        <div {...stylex.props(styles.menuTitle)}>{label}</div>
        <div {...stylex.props(styles.menuNote)}>{note}</div>
      </div>
      <div {...stylex.props(styles.toggle, checked && styles.toggleChecked)}>
        <CheckIcon className={stylex.props(styles.checkIcon).className} weight="bold" />
      </div>
    </AppMenuItem>
  );
}

function RecentRow({ item }: { item: RecentItem }): ReactElement {
  const Icon = item.icon;

  return (
    <Link to={item.href} {...stylex.props(styles.recentRow)}>
      <div {...stylex.props(styles.recentIconShell, getRecentShellStyle(item.tone))}>
        <Icon
          className={stylex.props(styles.recentIcon, getRecentIconStyle(item.tone)).className}
          weight={item.iconWeight ?? "regular"}
        />
      </div>
      <div {...stylex.props(styles.recentCopy)}>
        <p {...stylex.props(styles.recentTitle)}>{item.title}</p>
        <p {...stylex.props(styles.recentSubtitle)}>{item.subtitle}</p>
      </div>
      <CaretRightIcon className={stylex.props(styles.recentArrow).className} />
    </Link>
  );
}

function EmptyWidgetsState({ onReset }: { onReset: () => void }): ReactElement {
  return (
    <div {...stylex.props(styles.emptyWidgets)}>
      <p {...stylex.props(styles.emptyTitle)}>All widgets are hidden.</p>
      <p {...stylex.props(styles.emptyDescription)}>
        Turn a few back on to rebuild your workspace view.
      </p>
      <button type="button" onClick={onReset} {...stylex.props(styles.resetButton)}>
        Reset widgets
      </button>
    </div>
  );
}

export const Component = (): ReactElement => {
  const store = useAppStore();
  const navigate = useNavigate();
  const reducedMotion = useReducedMotion() ?? false;
  const fileRows = store.useQuery(desktopFilesQuery$);
  const folderRows = store.useQuery(desktopFoldersQuery$);
  const documentEditorSettings = normalizeSettingsValue(
    (store.useQuery(settingsDocumentQuery$) as Partial<setting> | undefined) ??
      settingsTable.default.value,
  );
  const [chatSessions, setChatSessions] = useState<ChatSessionSummary[]>([]);
  const [chatSessionsLoaded, setChatSessionsLoaded] = useState(false);
  const [calendarOffset, setCalendarOffset] = useState(0);
  const [calendarDirection, setCalendarDirection] = useState<CalendarMotionDirection>(0);
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

  const handleCreateNote = async () => {
    try {
      const result = await createNewMarkdownNote({
        settings: {
          defaultNoteLocationMode: documentEditorSettings.defaultNoteLocationMode,
          defaultNoteFolderId: documentEditorSettings.defaultNoteFolderId,
        },
        files,
        folders: folderRows.map((folder) => ({
          id: folder.id,
          name: folder.name,
          parentId: folder.parentId ?? null,
        })),
      });

      store.commit(fileEvents.fileCreated(result.createdEvent));
      void navigate(getDocumentEditorHref(result.meta.id));
    } catch (error) {
      console.error("Failed to create dashboard note:", error);
    }
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
    <div key="calendar" {...stylex.props(styles.calendar)}>
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

  return (
    <div {...stylex.props(styles.page)} style={{ fontFamily: DASHBOARD_FONT_FAMILY }}>
      <motion.div {...heroAnimations} {...stylex.props(styles.pageContent)}>
        <div {...stylex.props(styles.hero)}>
          <header {...stylex.props(styles.welcomeHeader)}>
            <DashboardWelcomeHeading
              title={welcomeCopy.title}
              description={welcomeCopy.description}
              isReady={chatSessionsLoaded}
              reducedMotion={reducedMotion}
            />
          </header>

          <div {...stylex.props(styles.widgetsArea)}>
            <div {...stylex.props(styles.menuRow)}>
              <AppMenu>
                <AppMenuTrigger>
                  <span {...stylex.props(styles.triggerIconShell)}>
                    <UploadSimpleIcon
                      className={stylex.props(styles.menuIcon).className}
                      weight="regular"
                    />
                  </span>
                  <span>New file</span>
                  <CaretDownIcon
                    data-dashboard-menu-caret=""
                    className={stylex.props(styles.triggerCaret).className}
                    weight="bold"
                  />
                </AppMenuTrigger>
                <AppMenuContent className={stylex.props(styles.menuContentNarrow).className}>
                  <MenuActionItem
                    title="New note"
                    note="Start a blank markdown note"
                    icon={FileTextIcon}
                    onSelect={() => {
                      void handleCreateNote();
                    }}
                  />
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
                  <span {...stylex.props(styles.triggerIconShell)}>
                    <SlidersHorizontalIcon className={stylex.props(styles.menuIcon).className} />
                  </span>
                  <span>Edit widgets</span>
                </AppMenuTrigger>
                <AppMenuContent className={stylex.props(styles.menuContentWide).className}>
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
              <div {...stylex.props(styles.widgetStack)}>
                {(widgetVisibility.calendar || widgetVisibility.todo) && (
                  <motion.section
                    {...getSectionMotion(0.08)}
                    {...stylex.props(dashboardLayoutStyles.primaryWidgetGrid)}
                  >
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
                    {...stylex.props(styles.recentWidget)}
                  >
                    <div {...stylex.props(styles.recentWidgetHeader)}>
                      <h2 {...stylex.props(styles.recentWidgetTitle)}>Recent</h2>
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
