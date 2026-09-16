import { motion } from "motion/react";
import * as stylex from "@stylexjs/stylex";
import { ChatMessage } from "@/components/chat/ChatMessage";
import type {
  AgentStatus,
  ChatMessage as AgentChatMessage,
  ThinkingStep,
} from "@/hooks/chat/useAgent";
import { ChatPageEmptyState } from "./ChatPageEmptyState";
import type { SuggestionCard } from "./types";

const styles = stylex.create({
  root: { display: "flex", flexDirection: "column", gap: 16, width: "100%" },
  sessionsError: {
    color: "#dc2626",
    display: "none",
    fontSize: 12,
    "@media (min-width: 48rem)": { display: "block" },
  },
  iterationPrompt: {
    backgroundColor: "rgb(255 251 235 / 0.8)",
    border: "1px solid #fde68a",
    borderRadius: 12,
    color: "#92400e",
    fontSize: 14,
    paddingBlock: 12,
    paddingInline: 16,
  },
  actions: { alignItems: "center", display: "flex", gap: 8, marginTop: 12 },
  continueButton: {
    backgroundColor: "#b45309",
    border: "1px solid #b45309",
    borderRadius: 8,
    color: "white",
    fontSize: 12,
    fontWeight: 600,
    paddingBlock: 6,
    paddingInline: 12,
    transition: "background-color 150ms",
    ":hover": { backgroundColor: "#d97706" },
    ":disabled": { cursor: "not-allowed", opacity: 0.6 },
  },
  stopButton: {
    backgroundColor: "white",
    border: "1px solid #fde68a",
    borderRadius: 8,
    color: "#b45309",
    fontSize: 12,
    fontWeight: 500,
    paddingBlock: 6,
    paddingInline: 12,
    transition: "background-color 150ms",
    ":hover": { backgroundColor: "#fef3c7" },
    ":disabled": { cursor: "not-allowed", opacity: 0.6 },
  },
  error: {
    backgroundColor: "#fef2f2",
    borderRadius: 12,
    color: "#dc2626",
    fontSize: 14,
    paddingBlock: 12,
    paddingInline: 16,
  },
});

interface ChatPageMessagesPanelProps {
  messages: AgentChatMessage[];
  isStreaming: boolean;
  status: AgentStatus;
  thinkingSteps: ThinkingStep[];
  panelCollapsed: boolean;
  sessionsError: string | null;
  hasMessages: boolean;
  lastAssistantId: string | undefined;
  retryableAssistantIds: Set<string>;
  isPreparingTurn: boolean;
  savingAttachmentIds: Set<string>;
  iterationLimitPrompt: { iterations: number } | null;
  error: Error | null;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  greetingTitle: string;
  isConfigured: boolean;
  onSaveImageToLibrary: (messageId: string, attachmentId: string) => Promise<void>;
  onSendWidgetPrompt: (text: string) => Promise<void>;
  onEditMessage: (messageId: string, nextText: string) => Promise<void>;
  onRetryMessage: (assistantMessageId: string) => Promise<void>;
  onToggleThinking: () => void;
  onContinueAfterIterationLimit: () => Promise<void>;
  onDismissIterationLimitPrompt: () => void;
  onOpenSettings: () => void;
  onSuggestionClick: (suggestion: SuggestionCard) => void;
}

export const ChatPageMessagesPanel = ({
  messages,
  isStreaming,
  status,
  thinkingSteps,
  panelCollapsed,
  sessionsError,
  hasMessages,
  lastAssistantId,
  retryableAssistantIds,
  isPreparingTurn,
  savingAttachmentIds,
  iterationLimitPrompt,
  error,
  messagesEndRef,
  greetingTitle,
  isConfigured,
  onSaveImageToLibrary,
  onSendWidgetPrompt,
  onEditMessage,
  onRetryMessage,
  onToggleThinking,
  onContinueAfterIterationLimit,
  onDismissIterationLimitPrompt,
  onOpenSettings,
  onSuggestionClick,
}: ChatPageMessagesPanelProps) => {
  if (!hasMessages) {
    return (
      <ChatPageEmptyState
        greetingTitle={greetingTitle}
        isConfigured={isConfigured}
        sessionsError={sessionsError}
        onOpenSettings={onOpenSettings}
        onSuggestionClick={onSuggestionClick}
      />
    );
  }

  return (
    <div {...stylex.props(styles.root)}>
      {sessionsError && <p {...stylex.props(styles.sessionsError)}>{sessionsError}</p>}
      {messages.map((message) => {
        const isCurrentAssistant = message.role === "assistant" && message.id === lastAssistantId;
        return (
          <ChatMessage
            key={message.id}
            message={message}
            isStreaming={isStreaming && isCurrentAssistant}
            thinkingSteps={isCurrentAssistant ? thinkingSteps : undefined}
            status={isCurrentAssistant ? status : undefined}
            thinkingCollapsed={isCurrentAssistant ? panelCollapsed : undefined}
            savingAttachmentIds={savingAttachmentIds}
            onSaveImageToLibrary={onSaveImageToLibrary}
            onSendWidgetPrompt={onSendWidgetPrompt}
            onEditMessage={message.role === "user" ? onEditMessage : undefined}
            onRetryMessage={
              message.role === "assistant" && retryableAssistantIds.has(message.id)
                ? onRetryMessage
                : undefined
            }
            actionsDisabled={isStreaming || isPreparingTurn}
            onToggleThinking={isCurrentAssistant ? onToggleThinking : undefined}
          />
        );
      })}
      {iterationLimitPrompt && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          {...stylex.props(styles.iterationPrompt)}
        >
          <p>
            The model has been running for a while ({iterationLimitPrompt.iterations} iterations).
            Continue running?
          </p>
          <div {...stylex.props(styles.actions)}>
            <button
              type="button"
              onClick={() => void onContinueAfterIterationLimit()}
              disabled={isStreaming}
              {...stylex.props(styles.continueButton)}
            >
              Continue
            </button>
            <button
              type="button"
              onClick={onDismissIterationLimitPrompt}
              disabled={isStreaming}
              {...stylex.props(styles.stopButton)}
            >
              Stop
            </button>
          </div>
        </motion.div>
      )}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          {...stylex.props(styles.error)}
        >
          {error.message}
        </motion.div>
      )}
      <div ref={messagesEndRef} />
    </div>
  );
};
