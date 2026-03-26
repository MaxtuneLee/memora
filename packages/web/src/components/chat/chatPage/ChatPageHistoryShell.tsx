import { ClockCounterClockwiseIcon } from "@phosphor-icons/react";
import { ChatHistoryPanel } from "@/components/chat/ChatHistoryPanel";
import type { ChatSessionSummary } from "@/lib/chat/chatSessionStorage";

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
  return (
    <>
      <aside className="hidden h-full w-[280px] shrink-0 border-r border-zinc-200/60 md:block">
        <ChatHistoryPanel
          sessions={sessions}
          activeSessionId={activeSessionId}
          isStreaming={isHistoryPanelBusy}
          deletingSessionId={deletingSessionId}
          onCreateSession={onCreateSession}
          onSelectSession={onSelectSession}
          onDeleteSession={onDeleteSession}
          isReady={sessionsReady}
        />
      </aside>

      <div className="shrink-0 border-b border-zinc-200/60 px-4 py-2.5 md:hidden">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <button
            type="button"
            onClick={onOpenHistoryDrawer}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50"
          >
            <ClockCounterClockwiseIcon className="size-3.5" weight="bold" />
            History
          </button>
          <p className="min-w-0 truncate text-xs font-medium text-zinc-500">{activeSessionTitle}</p>
        </div>
        {sessionsError && (
          <p className="mx-auto mt-2 max-w-2xl text-xs text-red-600">{sessionsError}</p>
        )}
      </div>
    </>
  );
};
