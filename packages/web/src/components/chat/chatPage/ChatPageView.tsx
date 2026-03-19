import { ConfirmDialog } from "@/components/desktop";
import { ToolWriteApprovalDialog } from "@/components/chat/ToolWriteApprovalDialog";
import { ChatPageComposerPanel } from "./ChatPageComposerPanel";
import { ChatPageHistoryDrawer } from "./ChatPageHistoryDrawer";
import { ChatPageHistoryShell } from "./ChatPageHistoryShell";
import { ChatPageMessagesPanel } from "./ChatPageMessagesPanel";

export const ChatPageView = (props: {
  sessions: Parameters<typeof ChatPageHistoryShell>[0]["sessions"];
  activeSessionId: string;
  activeSessionTitle: string;
  isHistoryPanelBusy: boolean;
  deletingSessionId: string | null;
  sessionsReady: boolean;
  sessionsError: string | null;
  composerScrollInset: number;
  isStreaming: boolean;
  status: Parameters<typeof ChatPageMessagesPanel>[0]["status"];
  thinkingSteps: Parameters<typeof ChatPageMessagesPanel>[0]["thinkingSteps"];
  panelCollapsed: boolean;
  hasMessages: boolean;
  lastAssistantId: string | undefined;
  retryableAssistantIds: Set<string>;
  isPreparingTurn: boolean;
  savingAttachmentIds: Set<string>;
  iterationLimitPrompt: Parameters<typeof ChatPageMessagesPanel>[0]["iterationLimitPrompt"];
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
  onOpenSettings: (section?: string) => void;
  onSuggestionClick: Parameters<typeof ChatPageMessagesPanel>[0]["onSuggestionClick"];
  composerPanelProps: Parameters<typeof ChatPageComposerPanel>[0];
  isHistoryDrawerOpen: boolean;
  pendingWriteApproval: Parameters<typeof ToolWriteApprovalDialog>[0]["request"];
  onAllowWriteOnce: () => void;
  onAllowWriteForSession: () => void;
  onDenyWrite: () => void;
  pendingDeleteSessionId: string | null;
  onCreateSession: () => void;
  onSelectSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onCancelDeleteSession: () => void;
  onConfirmDeleteSession: (sessionId: string) => void;
  onOpenHistoryDrawer: () => void;
  onCloseHistoryDrawer: () => void;
}) => {
  const {
    sessions,
    activeSessionId,
    activeSessionTitle,
    isHistoryPanelBusy,
    deletingSessionId,
    sessionsReady,
    sessionsError,
    composerScrollInset,
    isStreaming,
    status,
    thinkingSteps,
    panelCollapsed,
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
    composerPanelProps,
    isHistoryDrawerOpen,
    pendingWriteApproval,
    onAllowWriteOnce,
    onAllowWriteForSession,
    onDenyWrite,
    pendingDeleteSessionId,
    onCreateSession,
    onSelectSession,
    onDeleteSession,
    onCancelDeleteSession,
    onConfirmDeleteSession,
    onOpenHistoryDrawer,
    onCloseHistoryDrawer,
  } = props;

  return (
    <>
      <div className="flex h-full min-h-0">
        <ChatPageHistoryShell
          sessions={sessions}
          activeSessionId={activeSessionId}
          activeSessionTitle={activeSessionTitle}
          isHistoryPanelBusy={isHistoryPanelBusy}
          deletingSessionId={deletingSessionId}
          sessionsReady={sessionsReady}
          sessionsError={sessionsError}
          onCreateSession={onCreateSession}
          onSelectSession={onSelectSession}
          onDeleteSession={onDeleteSession}
          onOpenHistoryDrawer={onOpenHistoryDrawer}
        />

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="relative flex min-h-0 flex-1">
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div
                className="mx-auto flex min-h-full w-full max-w-5xl flex-col px-4 pt-6"
                style={{ paddingBottom: composerScrollInset }}
              >
                <ChatPageMessagesPanel
                  messages={composerPanelProps.messages}
                  isStreaming={isStreaming}
                  status={status}
                  thinkingSteps={thinkingSteps}
                  panelCollapsed={panelCollapsed}
                  sessionsError={sessionsError}
                  hasMessages={hasMessages}
                  lastAssistantId={lastAssistantId}
                  retryableAssistantIds={retryableAssistantIds}
                  isPreparingTurn={isPreparingTurn}
                  savingAttachmentIds={savingAttachmentIds}
                  iterationLimitPrompt={iterationLimitPrompt}
                  error={error}
                  messagesEndRef={messagesEndRef}
                  greetingTitle={greetingTitle}
                  isConfigured={isConfigured}
                  onSaveImageToLibrary={onSaveImageToLibrary}
                  onSendWidgetPrompt={onSendWidgetPrompt}
                  onEditMessage={onEditMessage}
                  onRetryMessage={onRetryMessage}
                  onToggleThinking={onToggleThinking}
                  onContinueAfterIterationLimit={onContinueAfterIterationLimit}
                  onDismissIterationLimitPrompt={onDismissIterationLimitPrompt}
                  onOpenSettings={() => onOpenSettings("ai-provider")}
                  onSuggestionClick={onSuggestionClick}
                />
              </div>
            </div>

            <ChatPageComposerPanel {...composerPanelProps} />
          </div>
        </div>
      </div>

      <ChatPageHistoryDrawer
        isOpen={isHistoryDrawerOpen}
        sessions={sessions}
        activeSessionId={activeSessionId}
        isHistoryPanelBusy={isHistoryPanelBusy}
        deletingSessionId={deletingSessionId}
        sessionsReady={sessionsReady}
        onCreateSession={onCreateSession}
        onSelectSession={onSelectSession}
        onDeleteSession={onDeleteSession}
        onClose={onCloseHistoryDrawer}
      />

      <ToolWriteApprovalDialog
        request={pendingWriteApproval}
        onAllowOnce={onAllowWriteOnce}
        onAllowSession={onAllowWriteForSession}
        onDeny={onDenyWrite}
      />

      <ConfirmDialog
        isOpen={pendingDeleteSessionId !== null}
        title="Delete session?"
        description="This action cannot be undone. The selected conversation will be permanently removed."
        confirmLabel={deletingSessionId ? "Deleting..." : "Delete"}
        cancelLabel="Cancel"
        tone="danger"
        onCancel={onCancelDeleteSession}
        onConfirm={() => {
          if (!pendingDeleteSessionId || deletingSessionId) {
            return;
          }
          onConfirmDeleteSession(pendingDeleteSessionId);
        }}
      />
    </>
  );
};
