import { AnimatePresence, motion } from "motion/react";
import { ChatHistoryPanel } from "@/components/chat/ChatHistoryPanel";
import type { ChatSessionSummary } from "@/lib/chat/chatSessionStorage";

interface ChatPageHistoryDrawerProps {
  isOpen: boolean;
  sessions: ChatSessionSummary[];
  activeSessionId: string;
  isHistoryPanelBusy: boolean;
  deletingSessionId: string | null;
  sessionsReady: boolean;
  onCreateSession: () => void;
  onSelectSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onClose: () => void;
}

export const ChatPageHistoryDrawer = ({
  isOpen,
  sessions,
  activeSessionId,
  isHistoryPanelBusy,
  deletingSessionId,
  sessionsReady,
  onCreateSession,
  onSelectSession,
  onDeleteSession,
  onClose,
}: ChatPageHistoryDrawerProps) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 md:hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <button
            type="button"
            onClick={onClose}
            className="absolute inset-0 bg-zinc-950/30"
            aria-label="Close history panel"
          />
          <motion.div
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "tween", duration: 0.22 }}
            className="absolute inset-y-0 left-0 h-full w-[86vw] max-w-[320px] border-r border-zinc-200/70 shadow-xl"
          >
            <ChatHistoryPanel
              sessions={sessions}
              activeSessionId={activeSessionId}
              isStreaming={isHistoryPanelBusy}
              deletingSessionId={deletingSessionId}
              onCreateSession={onCreateSession}
              onSelectSession={onSelectSession}
              onDeleteSession={onDeleteSession}
              onCloseMobileDrawer={onClose}
              isReady={sessionsReady}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
