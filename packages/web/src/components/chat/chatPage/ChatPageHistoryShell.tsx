import { useCallback, useState } from "react";
import { ClockCounterClockwiseIcon } from "@phosphor-icons/react";
import * as stylex from "@stylexjs/stylex";
import { ChatHistoryPanel } from "@/components/chat/ChatHistoryPanel";
import type { ChatSessionSummary } from "@/lib/chat/chatSessionStorage";
import { tokens } from "../../../styles/stylex.stylex";

const styles = stylex.create({
  desktopHistory: {
    borderRight: `1px solid ${tokens.borderSoft}`,
    display: "none",
    flexShrink: 0,
    height: "100%",
    overflow: "hidden",
    // Width only: the panel inside keeps its size, so its left edge stays put while the right folds in.
    transition: "width 150ms ease-out",
    width: 280,
    "@media (min-width: 48rem)": { display: "block" },
    "@media (prefers-reduced-motion: reduce)": { transition: "none" },
  },
  desktopHistoryCollapsed: { width: 48 },
  panel: { height: "100%", width: 280 },
  mobileHeader: {
    borderBottom: `1px solid ${tokens.borderSoft}`,
    flexShrink: 0,
    paddingBlock: 10,
    paddingInline: 16,
    "@media (min-width: 48rem)": { display: "none" },
  },
  mobileHeaderRow: {
    alignItems: "center",
    display: "flex",
    gap: 12,
    justifyContent: "space-between",
    marginInline: "auto",
    maxWidth: 672,
  },
  historyButton: {
    alignItems: "center",
    backgroundColor: tokens.card,
    border: `1px solid ${tokens.border}`,
    borderRadius: 8,
    color: tokens.textStrong,
    display: "inline-flex",
    fontSize: 12,
    fontWeight: 500,
    gap: 6,
    paddingBlock: 6,
    paddingInline: 12,
    transition: "background-color 150ms",
    ":hover": { backgroundColor: tokens.hover },
  },
  icon: { height: 14, width: 14 },
  title: {
    color: tokens.textMuted,
    fontSize: 12,
    fontWeight: 500,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  error: {
    color: tokens.dangerText,
    fontSize: 12,
    marginInline: "auto",
    marginTop: 8,
    maxWidth: 672,
  },
});

const COLLAPSED_STORAGE_KEY = "memora:chat-history-collapsed";

const readCollapsed = (): boolean => {
  try {
    return localStorage.getItem(COLLAPSED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
};

interface ChatPageHistoryShellProps {
  sessions: ChatSessionSummary[];
  activeSessionId: string;
  activeSessionTitle: string;
  isHistoryPanelBusy: boolean;
  deletingSessionId: string | null;
  sessionsReady: boolean;
  sessionsError: string | null;
  onCreateSession: () => void;
  onSelectSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onOpenHistoryDrawer: () => void;
}

export const ChatPageHistoryShell = ({
  sessions,
  activeSessionId,
  activeSessionTitle,
  isHistoryPanelBusy,
  deletingSessionId,
  sessionsReady,
  sessionsError,
  onCreateSession,
  onSelectSession,
  onDeleteSession,
  onOpenHistoryDrawer,
}: ChatPageHistoryShellProps) => {
  const [isCollapsed, setIsCollapsed] = useState(readCollapsed);
  const setCollapsed = useCallback((next: boolean) => {
    setIsCollapsed(next);
    try {
      localStorage.setItem(COLLAPSED_STORAGE_KEY, next ? "1" : "0");
    } catch {
      // Storage can be unavailable (private mode); the toggle still works for this visit.
    }
  }, []);
  const toggleCollapsed = useCallback(
    () => setCollapsed(!isCollapsed),
    [isCollapsed, setCollapsed],
  );

  return (
    <>
      <aside
        {...stylex.props(styles.desktopHistory, isCollapsed && styles.desktopHistoryCollapsed)}
      >
        <div {...stylex.props(styles.panel)}>
          <ChatHistoryPanel
            sessions={sessions}
            activeSessionId={activeSessionId}
            isStreaming={isHistoryPanelBusy}
            deletingSessionId={deletingSessionId}
            onCreateSession={onCreateSession}
            onSelectSession={onSelectSession}
            onDeleteSession={onDeleteSession}
            collapsed={isCollapsed}
            onToggleCollapsed={toggleCollapsed}
            isReady={sessionsReady}
          />
        </div>
      </aside>

      <div {...stylex.props(styles.mobileHeader)}>
        <div {...stylex.props(styles.mobileHeaderRow)}>
          <button
            type="button"
            onClick={onOpenHistoryDrawer}
            {...stylex.props(styles.historyButton)}
          >
            <ClockCounterClockwiseIcon
              className={stylex.props(styles.icon).className}
              weight="bold"
            />
            History
          </button>
          <p {...stylex.props(styles.title)}>{activeSessionTitle}</p>
        </div>
        {sessionsError && <p {...stylex.props(styles.error)}>{sessionsError}</p>}
      </div>
    </>
  );
};
