import { PlusIcon, TrashIcon, XIcon } from "@phosphor-icons/react";
import { useMemo } from "react";
import { cn } from "@/lib/cn";
import type { ChatSessionSummary } from "@/lib/chatSessionStorage";

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

const formatSessionUpdatedAt = (timestamp: number): string => {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
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

export const ChatHistoryPanel = ({
  sessions,
  activeSessionId,
  isStreaming,
  deletingSessionId = null,
  onCreateSession,
  onSelectSession,
  onDeleteSession,
  onCloseMobileDrawer,
  isReady = true,
}: ChatHistoryPanelProps) => {
  const groups = useMemo(() => groupSessionsByDate(sessions), [sessions]);
  const activeTitle =
    sessions.find((session) => session.id === activeSessionId)?.title ?? "History";

  return (
    <div className="flex h-full flex-col bg-[#f7f2e9]/85">
      <div className="shrink-0 border-b border-zinc-200/60 px-3 py-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-zinc-900">
              Chat History
            </h2>
            <p className="truncate text-xs text-zinc-500">{activeTitle}</p>
          </div>
          {onCloseMobileDrawer && (
            <button
              type="button"
              onClick={onCloseMobileDrawer}
              className="inline-flex size-7 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-zinc-200/70 hover:text-zinc-800"
              aria-label="Close history panel"
            >
              <XIcon className="size-4" />
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
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <PlusIcon className="size-3.5" weight="bold" />
          New session
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
        {groups.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-200/70 bg-white/60 px-3 py-4 text-center text-xs text-zinc-500">
            No saved sessions yet.
          </div>
        ) : (
          <div className="space-y-3">
            {groups.map((group) => (
              <section key={group.id} className="space-y-1">
                <div className="sticky top-0 z-10 bg-[#f7f2e9]/95 px-2 py-1 text-[10px] font-semibold tracking-[0.14em] text-zinc-500 uppercase backdrop-blur-sm">
                  {group.label}
                </div>
                <div className="space-y-1">
                  {group.sessions.map((session) => {
                    const isActive = session.id === activeSessionId;
                    const selectDisabled = isStreaming && !isActive;
                    const deleteDisabled = isStreaming || deletingSessionId === session.id;
                    return (
                      <div
                        key={session.id}
                        className={cn(
                          "flex items-start gap-1 rounded-xl border px-2 py-2",
                          isActive
                            ? "border-zinc-900 bg-zinc-900 text-white"
                            : "border-zinc-200 bg-white/80 text-zinc-700",
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            onSelectSession(session.id);
                            onCloseMobileDrawer?.();
                          }}
                          disabled={selectDisabled}
                          className={cn(
                            "min-w-0 flex-1 rounded-lg px-1 py-0.5 text-left transition",
                            !isActive && "hover:bg-white",
                            selectDisabled &&
                              "cursor-not-allowed opacity-60",
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-sm font-medium">
                              {session.title}
                            </p>
                            <span
                              className={cn(
                                "shrink-0 text-[10px]",
                                isActive ? "text-zinc-300" : "text-zinc-400",
                              )}
                            >
                              {formatSessionUpdatedAt(session.updatedAt)}
                            </span>
                          </div>
                          <p
                            className={cn(
                              "mt-1 truncate text-xs",
                              isActive ? "text-zinc-300" : "text-zinc-500",
                            )}
                          >
                            {session.preview || "No messages yet"}
                          </p>
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteSession(session.id)}
                          disabled={deleteDisabled}
                          aria-label={`Delete session ${session.title}`}
                          className={cn(
                            "mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-lg transition",
                            isActive
                              ? "text-zinc-300 hover:bg-zinc-800 hover:text-red-300"
                              : "text-zinc-400 hover:bg-zinc-100 hover:text-red-600",
                            deleteDisabled &&
                              "cursor-not-allowed opacity-40",
                          )}
                        >
                          <TrashIcon className="size-3.5" />
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
};
