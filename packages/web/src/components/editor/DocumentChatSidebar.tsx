import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import * as stylex from "@stylexjs/stylex";
import {
  ArrowCounterClockwiseIcon,
  ArrowUpIcon,
  NotePencilIcon,
  StopIcon,
  XIcon,
} from "@phosphor-icons/react";

import { ChatMessage } from "@/components/chat/ChatMessage";
import { StatusBar } from "@/components/chat/StatusBar";
import { ToolWriteApprovalDialog } from "@/components/chat/ToolWriteApprovalDialog";
import { useChatModelConfig } from "@/components/chat/chatPage/useChatModelConfig";
import { useAgent } from "@/hooks/chat/useAgent";
import { useSettingsDialog } from "@/hooks/settings/useSettingsDialog";
import { createChatTools, SYSTEM_PROMPT } from "@/lib/chat/tools";
import { chatProvidersQuery$ } from "@/lib/chat/queries";
import { createDocumentPromptSegment, createDocumentTools } from "@/lib/chat/tools/documentTools";
import { settingsDocumentQuery$ } from "@/lib/settings/queries";
import { BUILT_IN_SKILLS_PROMPT } from "@/lib/skills/builtInSkills";
import type { provider as ProviderRow } from "@/livestore/provider";
import type { setting } from "@/livestore/setting";
import { useAppStore } from "@/livestore/store";
import { tokens } from "../../styles/stylex.stylex";

const SIDEBAR_WIDTH = 400;
const FOLLOW_BOTTOM_THRESHOLD_PX = 48;

const SUGGESTIONS = [
  "Summarize this note",
  "Fix spelling and grammar",
  "Add a table of contents",
] as const;

const styles = stylex.create({
  root: {
    backgroundColor: tokens.surface,
    borderLeftColor: tokens.border,
    borderLeftStyle: "solid",
    borderLeftWidth: 1,
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
    height: "100dvh",
    minWidth: 0,
    position: { default: "fixed", "@media (min-width: 1024px)": "sticky" },
    right: { default: 0, "@media (min-width: 1024px)": "auto" },
    top: 0,
    width: {
      default: `min(100vw, ${SIDEBAR_WIDTH}px)`,
      "@media (min-width: 1024px)": SIDEBAR_WIDTH,
    },
    zIndex: { default: 40, "@media (min-width: 1024px)": 1 },
    boxShadow: { default: tokens.shadowLarge, "@media (min-width: 1024px)": "none" },
  },
  header: {
    alignItems: "center",
    borderBottomColor: tokens.borderSoft,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    display: "flex",
    gap: 8,
    paddingBlock: 10,
    paddingInline: 16,
  },
  titleBlock: { flex: 1, minWidth: 0 },
  title: {
    color: tokens.textStrong,
    fontSize: "0.9375rem",
    fontWeight: 600,
    lineHeight: "1.25rem",
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
  messages: {
    display: "flex",
    flex: 1,
    flexDirection: "column",
    gap: 16,
    minHeight: 0,
    overflowY: "auto",
    paddingBlock: 16,
    paddingInline: 16,
  },
  empty: {
    color: tokens.textMuted,
    display: "flex",
    flexDirection: "column",
    fontSize: "0.875rem",
    gap: 12,
    lineHeight: "1.25rem",
    marginBlock: "auto",
  },
  suggestions: { display: "flex", flexDirection: "column", gap: 8 },
  suggestion: {
    backgroundColor: { default: tokens.surfaceSoft, ":hover": tokens.hover },
    borderColor: tokens.borderSoft,
    borderRadius: 10,
    borderStyle: "solid",
    borderWidth: 1,
    color: tokens.text,
    fontSize: "0.8125rem",
    paddingBlock: 8,
    paddingInline: 12,
    textAlign: "left",
    ":disabled": { cursor: "not-allowed", opacity: 0.5 },
  },
  notice: {
    borderRadius: 10,
    fontSize: "0.8125rem",
    lineHeight: "1.25rem",
    paddingBlock: 8,
    paddingInline: 12,
  },
  error: {
    backgroundColor: tokens.dangerSurface,
    borderColor: tokens.dangerBorder,
    borderStyle: "solid",
    borderWidth: 1,
    color: tokens.dangerText,
  },
  info: {
    backgroundColor: tokens.infoSurface,
    borderColor: tokens.infoBorder,
    borderStyle: "solid",
    borderWidth: 1,
    color: tokens.infoText,
  },
  footer: {
    borderTopColor: tokens.borderSoft,
    borderTopStyle: "solid",
    borderTopWidth: 1,
    display: "flex",
    flexDirection: "column",
    gap: 8,
    padding: 12,
  },
  undoBar: {
    alignItems: "center",
    backgroundColor: tokens.surfaceMuted,
    borderRadius: 10,
    color: tokens.text,
    display: "flex",
    fontSize: "0.8125rem",
    gap: 8,
    paddingBlock: 6,
    paddingInlineEnd: 6,
    paddingInlineStart: 12,
  },
  undoText: { flex: 1 },
  textButton: {
    alignItems: "center",
    backgroundColor: { default: "transparent", ":hover": tokens.hover },
    borderRadius: 8,
    color: tokens.text,
    display: "inline-flex",
    fontSize: "0.8125rem",
    fontWeight: 500,
    gap: 4,
    paddingBlock: 4,
    paddingInline: 8,
  },
  composer: {
    alignItems: "flex-end",
    backgroundColor: tokens.canvas,
    borderColor: { default: tokens.border, ":focus-within": tokens.borderStrong },
    borderRadius: 14,
    borderStyle: "solid",
    borderWidth: 1,
    display: "flex",
    gap: 8,
    padding: 8,
  },
  textarea: {
    backgroundColor: "transparent",
    color: tokens.text,
    flex: 1,
    fontSize: "0.875rem",
    lineHeight: "1.25rem",
    maxHeight: 200,
    minHeight: 40,
    outline: "none",
    paddingBlock: 10,
    paddingInline: 6,
    resize: "none",
    "::placeholder": { color: tokens.textSoft },
  },
  sendButton: {
    alignItems: "center",
    backgroundColor: tokens.primaryBackground,
    borderRadius: 10,
    color: tokens.primaryText,
    display: "flex",
    flexShrink: 0,
    height: 34,
    justifyContent: "center",
    width: 34,
    ":disabled": { cursor: "not-allowed", opacity: 0.4 },
    ":focus-visible": { outline: `2px solid ${tokens.focusRing}`, outlineOffset: 2 },
  },
});

interface DocumentChatSidebarProps {
  fileName: string;
  sessionId: string;
  canUndoEdit: boolean;
  onUndoEdit: () => void;
  onKeepEdit: () => void;
  onTurnStart: () => void;
  onClose: () => void;
}

// Schemas only: the app-wide tool host runs the document tools against the open editor.
const DOCUMENT_TOOL_SCHEMAS = createDocumentTools({
  applyText: () => undefined,
  fileName: "",
  getText: () => "",
});

export function DocumentChatSidebar({
  fileName,
  sessionId,
  canUndoEdit,
  onUndoEdit,
  onKeepEdit,
  onTurnStart,
  onClose,
}: DocumentChatSidebarProps) {
  const store = useAppStore();
  const settings = store.useQuery(settingsDocumentQuery$) as setting;
  const providers = store.useQuery(chatProvidersQuery$) as ProviderRow[];
  const { openSettings } = useSettingsDialog();
  const [input, setInput] = useState("");
  const [isComposing, setIsComposing] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const isFollowingRef = useRef(true);

  const { agentConfig, providerConfig, isConfigured } = useChatModelConfig({
    providers,
    settings,
    activeSessionId: sessionId,
  });
  const tools = useMemo(() => [...createChatTools(store), ...DOCUMENT_TOOL_SCHEMAS], [store]);
  const promptSegments = useMemo(
    () => [SYSTEM_PROMPT, BUILT_IN_SKILLS_PROMPT, createDocumentPromptSegment(fileName)],
    [fileName],
  );

  const {
    messages,
    isStreaming,
    status,
    thinkingSteps,
    thinkingCollapsed,
    error,
    pendingWriteApproval,
    resolveWriteApproval,
    send,
    abort,
    reset,
  } = useAgent({
    sessionId,
    sessionStorage: "memory",
    config: agentConfig,
    providerConfig,
    deliveryMode: "pending",
    promptSegments,
    tools,
  });

  const lastAssistantId = useMemo(() => {
    return messages.findLast((message) => message.role === "assistant")?.id;
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!input && inputRef.current) {
      inputRef.current.style.height = "";
    }
  }, [input]);

  useEffect(() => {
    const scrollArea = scrollAreaRef.current;
    if (scrollArea && isFollowingRef.current) {
      scrollArea.scrollTop = scrollArea.scrollHeight;
    }
  }, [messages, thinkingSteps, status]);

  const submit = useCallback(
    (text: string): void => {
      const trimmed = text.trim();
      if (!trimmed || isStreaming) {
        return;
      }
      if (!isConfigured) {
        openSettings("ai-provider");
        return;
      }

      onTurnStart();
      isFollowingRef.current = true;
      setInput("");
      void send(trimmed).catch(() => {
        // The agent hook reports the error below the messages.
        setInput((current) => current || trimmed);
      });
    },
    [isConfigured, isStreaming, onTurnStart, openSettings, send],
  );

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key !== "Enter" || event.shiftKey || isComposing || event.nativeEvent.isComposing) {
      return;
    }
    event.preventDefault();
    submit(input);
  };

  const handleNewChat = useCallback((): void => {
    if (isStreaming) {
      return;
    }
    void reset().then(() => inputRef.current?.focus());
  }, [isStreaming, reset]);

  return (
    <aside
      aria-label="Chat about this note"
      {...stylex.props(styles.root)}
      data-testid="document-chat-sidebar"
    >
      <header {...stylex.props(styles.header)}>
        <div {...stylex.props(styles.titleBlock)}>
          <div {...stylex.props(styles.title)}>Chat</div>
          <div {...stylex.props(styles.subtitle)} title={fileName}>
            {fileName}
          </div>
        </div>
        <button
          type="button"
          aria-label="New chat"
          title="New chat"
          disabled={isStreaming || messages.length === 0}
          onClick={handleNewChat}
          {...stylex.props(styles.iconButton)}
        >
          <NotePencilIcon size={18} />
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
      </header>

      <div
        ref={scrollAreaRef}
        {...stylex.props(styles.messages)}
        onScroll={(event) => {
          const element = event.currentTarget;
          isFollowingRef.current =
            element.scrollHeight - element.scrollTop - element.clientHeight <=
            FOLLOW_BOTTOM_THRESHOLD_PX;
        }}
      >
        {messages.length === 0 ? (
          <div {...stylex.props(styles.empty)}>
            <p>
              Ask about this note, or ask for changes. Edits go straight into the note, and you can
              undo them.
            </p>
            <div {...stylex.props(styles.suggestions)}>
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  disabled={isStreaming}
                  onClick={() => submit(suggestion)}
                  {...stylex.props(styles.suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((message) => {
            const isCurrentAssistant = message.id === lastAssistantId;
            return (
              <ChatMessage
                key={message.id}
                message={message}
                isStreaming={isStreaming && isCurrentAssistant}
                thinkingSteps={isCurrentAssistant ? thinkingSteps : undefined}
                status={isCurrentAssistant ? status : undefined}
                thinkingCollapsed={isCurrentAssistant ? thinkingCollapsed : undefined}
                onSendWidgetPrompt={submit}
                actionsDisabled={isStreaming}
              />
            );
          })
        )}
        {error ? <div {...stylex.props(styles.notice, styles.error)}>{error.message}</div> : null}
      </div>

      <div {...stylex.props(styles.footer)}>
        {isStreaming ? <StatusBar status={status} /> : null}
        {canUndoEdit ? (
          <div {...stylex.props(styles.undoBar)} role="status">
            <span {...stylex.props(styles.undoText)}>Chat edited this note.</span>
            <button type="button" onClick={onUndoEdit} {...stylex.props(styles.textButton)}>
              <ArrowCounterClockwiseIcon size={14} />
              Undo
            </button>
            <button type="button" onClick={onKeepEdit} {...stylex.props(styles.textButton)}>
              Keep
            </button>
          </div>
        ) : null}
        {!isConfigured ? (
          <div {...stylex.props(styles.notice, styles.info)}>
            Chat needs a cloud model.{" "}
            <button
              type="button"
              onClick={() => openSettings("ai-provider")}
              {...stylex.props(styles.textButton)}
            >
              Add an API key
            </button>
          </div>
        ) : null}
        <div {...stylex.props(styles.composer)}>
          <textarea
            ref={inputRef}
            aria-label="Message"
            rows={1}
            value={input}
            placeholder="Ask about this note…"
            onChange={(event) => {
              setInput(event.currentTarget.value);
              const element = event.currentTarget;
              element.style.height = "auto";
              element.style.height = `${element.scrollHeight}px`;
            }}
            onKeyDown={handleKeyDown}
            onCompositionStart={() => setIsComposing(true)}
            onCompositionEnd={() => setIsComposing(false)}
            {...stylex.props(styles.textarea)}
          />
          {isStreaming ? (
            <button
              type="button"
              aria-label="Stop"
              title="Stop"
              onClick={abort}
              {...stylex.props(styles.sendButton)}
            >
              <StopIcon size={16} weight="fill" />
            </button>
          ) : (
            <button
              type="button"
              aria-label="Send"
              title="Send"
              disabled={!input.trim()}
              onClick={() => submit(input)}
              {...stylex.props(styles.sendButton)}
            >
              <ArrowUpIcon size={16} weight="bold" />
            </button>
          )}
        </div>
      </div>

      <ToolWriteApprovalDialog
        request={pendingWriteApproval}
        onAllowOnce={() => resolveWriteApproval("allow_once")}
        onAllowSession={() => resolveWriteApproval("allow_session")}
        onDeny={() => resolveWriteApproval("deny")}
      />
    </aside>
  );
}
