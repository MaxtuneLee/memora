import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import * as stylex from "@stylexjs/stylex";
import { motion, useReducedMotion, type Transition } from "motion/react";
import {
  ArrowSquareOutIcon,
  ClockCounterClockwiseIcon,
  NotePencilIcon,
  XIcon,
} from "@phosphor-icons/react";

import { ChatPageView } from "@/components/chat/chatPage/ChatPageView";
import { useChatController } from "@/components/chat/chatPage/useChatController";
import { ConfirmDialog } from "@/components/desktop/ConfirmDialog";
import type { ChatMessageQuote } from "@/hooks/chat/useAgent";
import { createDocumentPromptSegment, createDocumentTools } from "@/lib/chat/tools/documentTools";
import { tokens } from "../../styles/stylex.stylex";

const SIDEBAR_WIDTH = 420;
// iOS-style drawer curve.
const PANEL_TRANSITION: Transition = { duration: 0.32, ease: [0.32, 0.72, 0, 1] };
const REDUCED_PANEL_TRANSITION: Transition = { duration: 0.2, ease: "easeOut" };
// Long selections are sent whole; this only bounds what the input box previews.
const SELECTION_PREVIEW_LENGTH = 280;

const styles = stylex.create({
  // The panel's width opens from zero, so on wide screens the note beside it narrows with it.
  root: {
    boxShadow: { default: tokens.shadowLarge, "@media (min-width: 1024px)": "none" },
    flexShrink: 0,
    height: "100dvh",
    maxWidth: "100vw",
    overflow: "hidden",
    position: { default: "fixed", "@media (min-width: 1024px)": "sticky" },
    right: { default: 0, "@media (min-width: 1024px)": "auto" },
    top: 0,
    zIndex: { default: 40, "@media (min-width: 1024px)": 1 },
  },
  // Fixed width inside the opening frame, so the chat never reflows while it slides in.
  panel: {
    backgroundColor: tokens.shell,
    borderLeftColor: tokens.border,
    borderLeftStyle: "solid",
    borderLeftWidth: 1,
    display: "flex",
    flexDirection: "column",
    height: "100%",
    width: {
      default: `min(100vw, ${SIDEBAR_WIDTH}px)`,
      "@media (min-width: 1024px)": SIDEBAR_WIDTH,
    },
  },
  chat: { flex: 1, minHeight: 0, position: "relative" },
  header: {
    borderBottomColor: tokens.borderSoft,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    display: "flex",
    flexDirection: "column",
    gap: 8,
    paddingBlock: 10,
    paddingInline: 12,
  },
  headerRow: { alignItems: "center", display: "flex", gap: 4 },
  titleBlock: { flex: 1, minWidth: 0, paddingInlineStart: 4 },
  title: {
    color: tokens.textStrong,
    fontSize: "0.9375rem",
    fontWeight: 600,
    lineHeight: "1.25rem",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  subtitle: {
    color: tokens.textSoft,
    fontSize: "0.75rem",
    lineHeight: "1rem",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  iconButton: {
    alignItems: "center",
    backgroundColor: { default: "transparent", ":hover": tokens.hover },
    borderRadius: 8,
    color: { default: tokens.textMuted, ":hover": tokens.text },
    display: "flex",
    flexShrink: 0,
    height: 32,
    justifyContent: "center",
    width: 32,
    ":disabled": { cursor: "not-allowed", opacity: 0.4 },
    ":focus-visible": { outline: `2px solid ${tokens.focusRing}`, outlineOffset: 1 },
  },
  iconButtonActive: { backgroundColor: tokens.hover, color: tokens.text },
  reviewBar: {
    alignItems: "center",
    backgroundColor: tokens.surfaceMuted,
    borderRadius: 10,
    color: tokens.text,
    display: "flex",
    fontSize: "0.8125rem",
    gap: 6,
    paddingBlock: 5,
    paddingInlineEnd: 5,
    paddingInlineStart: 10,
  },
  reviewText: { flex: 1 },
  textButton: {
    backgroundColor: { default: "transparent", ":hover": tokens.hover },
    borderRadius: 8,
    color: tokens.text,
    fontSize: "0.8125rem",
    fontWeight: 500,
    paddingBlock: 4,
    paddingInline: 8,
  },
  history: {
    backgroundColor: tokens.shell,
    display: "flex",
    flexDirection: "column",
    gap: 2,
    inset: 0,
    overflowY: "auto",
    padding: 8,
    position: "absolute",
    zIndex: 20,
  },
  historyItem: {
    backgroundColor: { default: "transparent", ":hover": tokens.hover },
    borderRadius: 8,
    display: "flex",
    flexDirection: "column",
    gap: 2,
    paddingBlock: 8,
    paddingInline: 10,
    textAlign: "left",
    width: "100%",
    ":disabled": { cursor: "not-allowed", opacity: 0.5 },
  },
  historyItemActive: { backgroundColor: tokens.selected },
  historyTitle: {
    color: tokens.textStrong,
    fontSize: "0.8125rem",
    fontWeight: 500,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  historyPreview: {
    color: tokens.textSoft,
    fontSize: "0.75rem",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  historyEmpty: { color: tokens.textSoft, fontSize: "0.8125rem", padding: 10 },
});

// Schemas only: the app-wide tool host runs the document tools against the open note.
const DOCUMENT_TOOL_SCHEMAS = createDocumentTools({
  applyText: () => undefined,
  fileName: "",
  getText: () => "",
});

interface DocumentChatSidebarProps {
  fileName: string;
  initialSessionId: string | null;
  onActiveSessionChange: (sessionId: string) => void;
  selectionText: string | null;
  onClearSelection: () => void;
  pendingChangeCount: number;
  onAcceptAllChanges: () => void;
  onRejectAllChanges: () => void;
  onClose: () => void;
}

export function DocumentChatSidebar({
  fileName,
  initialSessionId,
  onActiveSessionChange,
  selectionText,
  onClearSelection,
  pendingChangeCount,
  onAcceptAllChanges,
  onRejectAllChanges,
  onClose,
}: DocumentChatSidebarProps) {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion() ?? false;
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const quoteRef = useRef<ChatMessageQuote | null>(null);
  useLayoutEffect(() => {
    quoteRef.current = selectionText
      ? { label: `Selection from ${fileName}`, text: selectionText }
      : null;
  });

  const extraPromptSegments = useMemo(() => [createDocumentPromptSegment(fileName)], [fileName]);
  const getTurnQuote = useCallback(() => quoteRef.current, []);
  const { viewProps, apiKeyPromptOpen, closeApiKeyPrompt, confirmApiKeyPrompt } = useChatController(
    {
      syncWithUrl: false,
      initialSessionId,
      onActiveSessionChange,
      extraPromptSegments,
      extraTools: DOCUMENT_TOOL_SCHEMAS,
      getTurnQuote,
      onTurnSent: onClearSelection,
    },
  );

  const activeSession = viewProps.sessions.find(
    (session) => session.id === viewProps.activeSessionId,
  );
  const selectionPreview =
    selectionText && selectionText.length > SELECTION_PREVIEW_LENGTH
      ? `${selectionText.slice(0, SELECTION_PREVIEW_LENGTH)}…`
      : selectionText;

  const header = (
    <div {...stylex.props(styles.header)}>
      <div {...stylex.props(styles.headerRow)}>
        <div {...stylex.props(styles.titleBlock)}>
          <div {...stylex.props(styles.title)}>{activeSession?.title ?? "Chat"}</div>
          <div {...stylex.props(styles.subtitle)} title={fileName}>
            {fileName}
          </div>
        </div>
        <button
          type="button"
          aria-label="Chat history"
          aria-pressed={isHistoryOpen}
          title="Chat history"
          onClick={() => setIsHistoryOpen((open) => !open)}
          {...stylex.props(styles.iconButton, isHistoryOpen && styles.iconButtonActive)}
        >
          <ClockCounterClockwiseIcon size={18} />
        </button>
        <button
          type="button"
          aria-label="New chat"
          title="New chat"
          disabled={!viewProps.sessionsReady || viewProps.isPreparingTurn}
          onClick={() => {
            setIsHistoryOpen(false);
            viewProps.onCreateSession();
          }}
          {...stylex.props(styles.iconButton)}
        >
          <NotePencilIcon size={18} />
        </button>
        <button
          type="button"
          aria-label="Open in Chat"
          title="Open in Chat"
          disabled={!viewProps.activeSessionId}
          onClick={() => {
            void navigate(`/chat?session=${encodeURIComponent(viewProps.activeSessionId)}`);
          }}
          {...stylex.props(styles.iconButton)}
        >
          <ArrowSquareOutIcon size={18} />
        </button>
        <button
          type="button"
          aria-label="Close chat"
          title="Close chat"
          onClick={onClose}
          {...stylex.props(styles.iconButton)}
        >
          <XIcon size={18} />
        </button>
      </div>
      {pendingChangeCount > 0 ? (
        <div {...stylex.props(styles.reviewBar)} role="status">
          <span {...stylex.props(styles.reviewText)}>
            {pendingChangeCount} suggested {pendingChangeCount === 1 ? "change" : "changes"} in the
            note
          </span>
          <button type="button" onClick={onRejectAllChanges} {...stylex.props(styles.textButton)}>
            Reject all
          </button>
          <button type="button" onClick={onAcceptAllChanges} {...stylex.props(styles.textButton)}>
            Accept all
          </button>
        </div>
      ) : null}
    </div>
  );

  // Reduced motion keeps a fade and drops the width change.
  const closedState = reduceMotion
    ? { opacity: 0, width: SIDEBAR_WIDTH }
    : { opacity: 1, width: 0 };

  return (
    <motion.aside
      aria-label="Chat about this note"
      data-testid="document-chat-sidebar"
      {...stylex.props(styles.root)}
      initial={closedState}
      animate={{ opacity: 1, width: SIDEBAR_WIDTH }}
      exit={closedState}
      transition={reduceMotion ? REDUCED_PANEL_TRANSITION : PANEL_TRANSITION}
    >
      <div {...stylex.props(styles.panel)}>
        <ConfirmDialog
          isOpen={apiKeyPromptOpen}
          title="Add an API key to start chatting"
          description="Chat runs on a cloud model. Add a provider and its API key in Settings. Your key stays on this device."
          confirmLabel="Add API key"
          cancelLabel="Not now"
          onConfirm={confirmApiKeyPrompt}
          onCancel={closeApiKeyPrompt}
        />
        {header}
        <div {...stylex.props(styles.chat)}>
          <ChatPageView
            {...viewProps}
            variant="sidebar"
            composerPanelProps={{
              ...viewProps.composerPanelProps,
              placeholder: "Ask about this note...",
              contextChip: selectionPreview
                ? {
                    label: "Selected text",
                    preview: selectionPreview,
                    onRemove: onClearSelection,
                  }
                : null,
            }}
          />
          {isHistoryOpen ? (
            <div {...stylex.props(styles.history)} role="list" aria-label="Chat history">
              {viewProps.sessions.length === 0 ? (
                <p {...stylex.props(styles.historyEmpty)}>No chats yet.</p>
              ) : (
                viewProps.sessions.map((session) => (
                  <button
                    key={session.id}
                    type="button"
                    role="listitem"
                    disabled={viewProps.isHistoryPanelBusy}
                    onClick={() => {
                      viewProps.onSelectSession(session.id);
                      setIsHistoryOpen(false);
                    }}
                    {...stylex.props(
                      styles.historyItem,
                      session.id === viewProps.activeSessionId && styles.historyItemActive,
                    )}
                  >
                    <span {...stylex.props(styles.historyTitle)}>{session.title}</span>
                    {session.preview ? (
                      <span {...stylex.props(styles.historyPreview)}>{session.preview}</span>
                    ) : null}
                  </button>
                ))
              )}
            </div>
          ) : null}
        </div>
      </div>
    </motion.aside>
  );
}
