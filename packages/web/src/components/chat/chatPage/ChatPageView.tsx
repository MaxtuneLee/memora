import { ConfirmDialog } from "@/components/desktop";
import { Toast } from "@base-ui/react/toast";
import * as stylex from "@stylexjs/stylex";
import { ToolWriteApprovalDialog } from "@/components/chat/ToolWriteApprovalDialog";
import ToastStack from "@/components/ToastStack";
import { ChatPageComposerPanel } from "./ChatPageComposerPanel";
import { ChatPageHistoryDrawer } from "./ChatPageHistoryDrawer";
import { ChatPageHistoryShell } from "./ChatPageHistoryShell";
import { ChatPageMessagesPanel } from "./ChatPageMessagesPanel";

const styles = stylex.create({
  root: { display: "flex", height: "100%", minHeight: 0 },
  main: { display: "flex", flex: 1, flexDirection: "column", minHeight: 0, minWidth: 0 },
  content: { display: "flex", flex: 1, minHeight: 0, position: "relative" },
  scrollArea: { flex: 1, minHeight: 0, overflowY: "auto" },
  messages: {
    display: "flex",
    flexDirection: "column",
    marginInline: "auto",
    maxWidth: 1024,
    minHeight: "100%",
    paddingInline: 16,
    paddingTop: 24,
    width: "100%",
  },
  toast: {
    alignItems: "center",
    backgroundColor: "#fffdf8",
    border: "1px solid #e9e5dc",
    borderRadius: 16,
    boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.08), 0 4px 6px -4px rgb(0 0 0 / 0.08)",
    display: "flex",
    gap: 12,
    paddingBlock: 12,
    paddingInline: 16,
  },
  toastTitle: { color: "#1d1c1a", flex: 1, fontSize: 13, fontWeight: 600 },
});

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
      <div {...stylex.props(styles.root)}>
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

        <div {...stylex.props(styles.main)}>
          <div {...stylex.props(styles.content)}>
            <div {...stylex.props(styles.scrollArea)}>
              <div
                {...stylex.props(styles.messages)}
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

      <ToastStack
        render={(toast) => (
          <Toast.Content {...stylex.props(styles.toast)}>
            <Toast.Title {...stylex.props(styles.toastTitle)}>{toast.title as string}</Toast.Title>
          </Toast.Content>
        )}
      />
    </>
  );
};
