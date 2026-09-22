import { memo, useMemo } from "react";
import { PlusIcon, TrashIcon, XIcon } from "@phosphor-icons/react";
import * as stylex from "@stylexjs/stylex";
import type { ChatSessionSummary } from "@/lib/chat/chatSessionStorage";
import { tokens } from "../../styles/stylex.stylex";

const styles = stylex.create({
  root: {
    backgroundColor: `color-mix(in srgb, ${tokens.rail} 85%, transparent)`,
    display: "flex",
    flexDirection: "column",
    height: "100%",
  },
  header: { borderBottom: `1px solid ${tokens.borderSoft}`, flexShrink: 0, padding: 12 },
  headingRow: {
    alignItems: "center",
    display: "flex",
    gap: 8,
    justifyContent: "space-between",
    marginBottom: 8,
  },
  headingCopy: { minWidth: 0 },
  heading: {
    color: tokens.textStrong,
    fontSize: 14,
    fontWeight: 600,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  activeTitle: {
    color: tokens.textMuted,
    fontSize: 12,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  iconButton: {
    alignItems: "center",
    borderRadius: 8,
    color: tokens.textMuted,
    display: "inline-flex",
    height: 28,
    justifyContent: "center",
    transition: "color 150ms, background-color 150ms",
    width: 28,
    ":hover": { backgroundColor: tokens.hover, color: tokens.text },
  },
  icon: { height: 14, width: 14 },
  newSession: {
    alignItems: "center",
    backgroundColor: tokens.card,
    border: `1px solid ${tokens.border}`,
    borderRadius: 8,
    color: tokens.textStrong,
    display: "inline-flex",
    fontSize: 12,
    fontWeight: 500,
    gap: 6,
    justifyContent: "center",
    paddingBlock: 8,
    paddingInline: 12,
    transition: "background-color 150ms",
    width: "100%",
    ":hover": { backgroundColor: tokens.hover },
    ":disabled": { cursor: "not-allowed", opacity: 0.5 },
  },
  scrollArea: { flex: 1, minHeight: 0, overflowY: "auto", paddingBlock: 12, paddingInline: 8 },
  empty: {
    backgroundColor: `color-mix(in srgb, ${tokens.card} 60%, transparent)`,
    border: `1px dashed ${tokens.borderSoft}`,
    borderRadius: 12,
    color: tokens.textMuted,
    fontSize: 12,
    paddingBlock: 16,
    paddingInline: 12,
    textAlign: "center",
  },
  groups: { display: "flex", flexDirection: "column", gap: 12 },
  groupHeading: {
    backdropFilter: "blur(8px)",
    backgroundColor: `color-mix(in srgb, ${tokens.rail} 95%, transparent)`,
    color: tokens.textMuted,
    fontSize: 12,
    fontWeight: 600,
    paddingBlock: 6,
    paddingInline: 8,
    position: "sticky",
    top: 0,
    zIndex: 10,
  },
  sessions: { display: "flex", flexDirection: "column", gap: 4 },
  session: {
    alignItems: "flex-start",
    backgroundColor: `color-mix(in srgb, ${tokens.card} 80%, transparent)`,
    border: `1px solid ${tokens.border}`,
    borderRadius: 12,
    color: tokens.textStrong,
    display: "flex",
    gap: 4,
    padding: 8,
    transition: "background-color 150ms, border-color 150ms",
  },
  sessionActive: {
    backgroundColor: tokens.primaryBackground,
    borderColor: tokens.primaryBackground,
    color: tokens.primaryText,
  },
  disabled: { cursor: "not-allowed", opacity: 0.6 },
  select: {
    backgroundColor: "transparent",
    borderRadius: 8,
    flex: 1,
    minWidth: 0,
    paddingBlock: 2,
    paddingInline: 4,
    textAlign: "left",
  },
  sessionTitle: {
    fontSize: 14,
    fontWeight: 500,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  preview: {
    color: tokens.textMuted,
    fontSize: 12,
    marginTop: 4,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  previewActive: { color: `color-mix(in srgb, ${tokens.primaryText} 80%, transparent)` },
  delete: {
    alignItems: "center",
    borderRadius: 8,
    color: tokens.textSoft,
    display: "inline-flex",
    flexShrink: 0,
    height: 28,
    justifyContent: "center",
    marginTop: 2,
    transition: "all 150ms",
    width: 28,
    ":hover": { backgroundColor: tokens.hover, color: tokens.dangerText },
  },
  deleteActive: {
    color: `color-mix(in srgb, ${tokens.primaryText} 80%, transparent)`,
    ":hover": {
      backgroundColor: `color-mix(in srgb, ${tokens.primaryText} 15%, transparent)`,
      color: tokens.primaryText,
    },
  },
  deleting: { cursor: "not-allowed", opacity: 0.4 },
});

const DAY_MS = 24 * 60 * 60 * 1000;

type SessionGroup = {
  id: "today" | "last-7-days" | "earlier";
  label: string;
  sessions: ChatSessionSummary[];
};

const getDayStart = (timestamp: number): number => {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};

const groupSessionsByDate = (sessions: ChatSessionSummary[]): SessionGroup[] => {
  const todayStart = getDayStart(Date.now());
  const last7Start = todayStart - 6 * DAY_MS;

  const groups: SessionGroup[] = [
    { id: "today", label: "Today", sessions: [] },
    { id: "last-7-days", label: "Last 7 days", sessions: [] },
    { id: "earlier", label: "Earlier", sessions: [] },
  ];

  for (const session of sessions) {
    if (session.updatedAt >= todayStart) {
      groups[0].sessions.push(session);
      continue;
    }
    if (session.updatedAt >= last7Start) {
      groups[1].sessions.push(session);
      continue;
    }
    groups[2].sessions.push(session);
  }

  return groups.filter((group) => group.sessions.length > 0);
};

export interface ChatHistoryPanelProps {
  sessions: ChatSessionSummary[];
  activeSessionId: string;
  isStreaming: boolean;
  deletingSessionId?: string | null;
  onCreateSession: () => void;
  onSelectSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onCloseMobileDrawer?: () => void;
  isReady?: boolean;
}

function ChatHistoryPanelComponent({
  sessions,
  activeSessionId,
  isStreaming,
  deletingSessionId = null,
  onCreateSession,
  onSelectSession,
  onDeleteSession,
  onCloseMobileDrawer,
  isReady = true,
}: ChatHistoryPanelProps) {
  const groups = useMemo(() => groupSessionsByDate(sessions), [sessions]);
  const activeTitle =
    sessions.find((session) => session.id === activeSessionId)?.title ?? "History";

  return (
    <div {...stylex.props(styles.root)}>
      <div {...stylex.props(styles.header)}>
        <div {...stylex.props(styles.headingRow)}>
          <div {...stylex.props(styles.headingCopy)}>
            <h2 {...stylex.props(styles.heading)}>Chat History</h2>
            <p {...stylex.props(styles.activeTitle)}>{activeTitle}</p>
          </div>
          {onCloseMobileDrawer && (
            <button
              type="button"
              onClick={onCloseMobileDrawer}
              {...stylex.props(styles.iconButton)}
              aria-label="Close history panel"
            >
              <XIcon className={stylex.props(styles.icon).className} />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            onCreateSession();
            onCloseMobileDrawer?.();
          }}
          disabled={!isReady}
          {...stylex.props(styles.newSession)}
        >
          <PlusIcon className={stylex.props(styles.icon).className} weight="bold" />
          New session
        </button>
      </div>

      <div {...stylex.props(styles.scrollArea)}>
        {groups.length === 0 ? (
          <div {...stylex.props(styles.empty)}>No saved sessions yet.</div>
        ) : (
          <div {...stylex.props(styles.groups)}>
            {groups.map((group) => (
              <section key={group.id}>
                <div {...stylex.props(styles.groupHeading)}>{group.label}</div>
                <div {...stylex.props(styles.sessions)}>
                  {group.sessions.map((session) => {
                    const isActive = session.id === activeSessionId;
                    const selectDisabled = isStreaming && !isActive;
                    const deleteDisabled = isStreaming || deletingSessionId === session.id;
                    return (
                      <div
                        key={session.id}
                        {...stylex.props(
                          styles.session,
                          isActive && styles.sessionActive,
                          selectDisabled && styles.disabled,
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            onSelectSession(session.id);
                            onCloseMobileDrawer?.();
                          }}
                          disabled={selectDisabled}
                          {...stylex.props(styles.select)}
                        >
                          <div {...stylex.props(styles.headingCopy)}>
                            <p {...stylex.props(styles.sessionTitle)}>{session.title}</p>
                          </div>
                          <p {...stylex.props(styles.preview, isActive && styles.previewActive)}>
                            {session.preview || "No messages yet"}
                          </p>
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteSession(session.id)}
                          disabled={deleteDisabled}
                          aria-label={`Delete session ${session.title}`}
                          {...stylex.props(
                            styles.delete,
                            isActive && styles.deleteActive,
                            deleteDisabled && styles.deleting,
                          )}
                        >
                          <TrashIcon className={stylex.props(styles.icon).className} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const areChatHistoryPanelPropsEqual = (
  previousProps: ChatHistoryPanelProps,
  nextProps: ChatHistoryPanelProps,
): boolean => {
  return (
    previousProps.sessions === nextProps.sessions &&
    previousProps.activeSessionId === nextProps.activeSessionId &&
    previousProps.isStreaming === nextProps.isStreaming &&
    previousProps.deletingSessionId === nextProps.deletingSessionId &&
    previousProps.onCreateSession === nextProps.onCreateSession &&
    previousProps.onSelectSession === nextProps.onSelectSession &&
    previousProps.onDeleteSession === nextProps.onDeleteSession &&
    previousProps.onCloseMobileDrawer === nextProps.onCloseMobileDrawer &&
    previousProps.isReady === nextProps.isReady
  );
};

export const ChatHistoryPanel = memo(ChatHistoryPanelComponent, areChatHistoryPanelPropsEqual);
