import { motion } from "motion/react";
import { ChatMessage } from "@/components/chat/ChatMessage";
import type {
  AgentStatus,
  ChatMessage as AgentChatMessage,
  ThinkingStep,
} from "@/hooks/chat/useAgent";
import { ChatPageEmptyState } from "./ChatPageEmptyState";
import type { SuggestionCard } from "./types";

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
    <div className="w-full space-y-4">
      {sessionsError && (
        <p className="hidden text-xs text-red-600 md:block">{sessionsError}</p>
      )}
      {messages.map((message) => {
        const isCurrentAssistant =
          message.role === "assistant" && message.id === lastAssistantId;
        return (
          <ChatMessage
            key={message.id}
            message={message}
            isStreaming={isStreaming && isCurrentAssistant}
            thinkingSteps={isCurrentAssistant ? thinkingSteps : undefined}
            status={isCurrentAssistant ? status : undefined}
            thinkingCollapsed={
              isCurrentAssistant ? panelCollapsed : undefined
            }
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
          className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-800"
        >
          <p>
            The model has been running for a while (
            {iterationLimitPrompt.iterations} iterations). Continue running?
          </p>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => void onContinueAfterIterationLimit()}
              disabled={isStreaming}
              className="rounded-lg border border-amber-700 bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Continue
            </button>
            <button
              type="button"
              onClick={onDismissIterationLimitPrompt}
              disabled={isStreaming}
              className="rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-xs font-medium text-amber-700 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
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
          className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600"
        >
          {error.message}
        </motion.div>
      )}
      <div ref={messagesEndRef} />
    </div>
  );
};
