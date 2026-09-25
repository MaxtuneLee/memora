import { motion } from "motion/react";
import * as stylex from "@stylexjs/stylex";
import { ChatMessage } from "@/components/chat/ChatMessage";
import type {
  AgentStatus,
  ChatMessage as AgentChatMessage,
  ThinkingStep,
} from "@/hooks/chat/useAgent";
import { tokens } from "../../../styles/stylex.stylex";
import { ChatPageEmptyState } from "./ChatPageEmptyState";

const styles = stylex.create({
  root: { display: "flex", flexDirection: "column", gap: 16, width: "100%" },
  sessionsError: {
    color: tokens.dangerText,
    display: "none",
    fontSize: 12,
    "@media (min-width: 48rem)": { display: "block" },
  },
  iterationPrompt: {
    backgroundColor: `color-mix(in srgb, ${tokens.warningSurface} 80%, transparent)`,
    border: `1px solid ${tokens.warningBorder}`,
    borderRadius: 12,
    color: tokens.warningText,
    fontSize: 14,
    paddingBlock: 12,
    paddingInline: 16,
  },
  actions: { alignItems: "center", display: "flex", gap: 8, marginTop: 12 },
  continueButton: {
    backgroundColor: tokens.warningText,
    border: `1px solid ${tokens.warningText}`,
    borderRadius: 8,
    color: tokens.textInverse,
    fontSize: 12,
    fontWeight: 600,
    paddingBlock: 6,
    paddingInline: 12,
    transition: "background-color 150ms",
    ":hover": {
      backgroundColor: `color-mix(in srgb, ${tokens.warningText} 85%, ${tokens.surface})`,
    },
    ":disabled": { cursor: "not-allowed", opacity: 0.6 },
  },
  stopButton: {
    backgroundColor: tokens.card,
    border: `1px solid ${tokens.warningBorder}`,
    borderRadius: 8,
    color: tokens.warningText,
    fontSize: 12,
    fontWeight: 500,
    paddingBlock: 6,
    paddingInline: 12,
    transition: "background-color 150ms",
    ":hover": { backgroundColor: tokens.warningSurface },
    ":disabled": { cursor: "not-allowed", opacity: 0.6 },
  },
  error: {
    backgroundColor: tokens.dangerSurface,
    borderRadius: 12,
    color: tokens.dangerText,
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
  greetingTitle: string;
  isConfigured: boolean;
  mascotLayoutId: string;
  onSaveImageToLibrary: (messageId: string, attachmentId: string) => Promise<void>;
  onSendWidgetPrompt: (text: string) => Promise<void>;
  onEditMessage: (messageId: string, nextText: string) => Promise<void>;
  onRetryMessage: (assistantMessageId: string) => Promise<void>;
  onToggleThinking: () => void;
  onContinueAfterIterationLimit: () => Promise<void>;
  onDismissIterationLimitPrompt: () => void;
  onOpenSettings: () => void;
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
  greetingTitle,
  isConfigured,
  mascotLayoutId,
  onSaveImageToLibrary,
  onSendWidgetPrompt,
  onEditMessage,
  onRetryMessage,
  onToggleThinking,
  onContinueAfterIterationLimit,
  onDismissIterationLimitPrompt,
  onOpenSettings,
}: ChatPageMessagesPanelProps) => {
  if (!hasMessages) {
    return (
      <ChatPageEmptyState
        greetingTitle={greetingTitle}
        isConfigured={isConfigured}
        mascotLayoutId={mascotLayoutId}
        sessionsError={sessionsError}
        onOpenSettings={onOpenSettings}
      />
    );
  }

  const firstAssistantId = messages.find((message) => message.role === "assistant")?.id;

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
            mascotLayoutId={message.id === firstAssistantId ? mascotLayoutId : undefined}
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
    </div>
  );
};
