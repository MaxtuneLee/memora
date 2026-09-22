import { AnimatePresence, motion } from "motion/react";
import * as stylex from "@stylexjs/stylex";
import { ChatHistoryPanel } from "@/components/chat/ChatHistoryPanel";
import type { ChatSessionSummary } from "@/lib/chat/chatSessionStorage";
import { tokens } from "../../../styles/stylex.stylex";

const styles = stylex.create({
  root: {
    display: "none",
    inset: 0,
    position: "fixed",
    zIndex: 50,
    "@media (max-width: 47.999rem)": { display: "block" },
  },
  backdrop: { backgroundColor: tokens.overlay, inset: 0, position: "absolute" },
  drawer: {
    borderRight: `1px solid ${tokens.borderSoft}`,
    boxShadow: tokens.shadowLarge,
    height: "100%",
    left: 0,
    maxWidth: 320,
    position: "absolute",
    insetBlock: 0,
    width: "86vw",
  },
});

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
          {...stylex.props(styles.root)}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <button
            type="button"
            onClick={onClose}
            {...stylex.props(styles.backdrop)}
            aria-label="Close history panel"
          />
          <motion.div
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "tween", duration: 0.22 }}
            {...stylex.props(styles.drawer)}
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
