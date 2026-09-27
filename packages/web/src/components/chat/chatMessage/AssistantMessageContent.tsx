import { FileTextIcon } from "@phosphor-icons/react";
import { motion } from "motion/react";
import { Link } from "react-router";
import { Streamdown, type Components } from "streamdown";
import * as stylex from "@stylexjs/stylex";
import "streamdown/styles.css";
import "katex/dist/katex.min.css";

import { ChatWidget } from "@/components/chat/ChatWidget";
import { ThinkingPanel } from "@/components/chat/ThinkingPanel";
import type { AgentStatus, ThinkingStep } from "@/hooks/chat/useAgent";
import {
  MEMORA_STREAMDOWN_CLASS_NAME,
  MEMORA_STREAMDOWN_CONTROLS,
  MEMORA_STREAMDOWN_PLUGINS,
  MEMORA_STREAMDOWN_THEME,
} from "@/lib/streamdown";
import { buildCitedMarkdown, MEMORA_CITE_TAG } from "@/lib/chat/memoraJump";
import { getDocumentEditorHref } from "@/lib/editor/editableTextDocument";
import { tokens } from "../../../styles/stylex.stylex";

import { CitationMarker } from "./CitationMarker";
import type { ChatMessageData } from "./types";

const styles = stylex.create({
  widgetList: { display: "flex", flexDirection: "column", gap: 12 },
  content: { display: "flex", flexDirection: "column", gap: 12 },
  contentWithWidgets: { marginTop: 12 },
  fileList: { display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 },
  fileCard: {
    alignItems: "center",
    backgroundColor: { default: tokens.surfaceMuted, ":hover": tokens.card },
    border: `1px solid ${tokens.border}`,
    borderRadius: 12,
    display: "flex",
    gap: 10,
    maxWidth: "100%",
    paddingBlock: 8,
    paddingInline: 12,
    textDecoration: "none",
    transition: "background-color 150ms",
  },
  fileIcon: { color: tokens.textMuted, flexShrink: 0, height: 18, width: 18 },
  fileText: { display: "flex", flexDirection: "column", minWidth: 0 },
  fileName: {
    color: tokens.textStrong,
    fontSize: 13,
    fontWeight: 500,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  fileAction: { color: tokens.textMuted, fontSize: 11 },
  loading: { alignItems: "center", display: "flex", gap: 4, paddingBlock: 2 },
  loadingDot: { backgroundColor: tokens.textSoft, borderRadius: 9999, height: 6, width: 6 },
  tokenUsage: {
    borderTop: `1px solid ${tokens.border}`,
    color: tokens.textSoft,
    fontSize: 11,
    fontWeight: 500,
    marginTop: 12,
    paddingTop: 8,
  },
});

const STREAMDOWN_ANIMATION = {
  animation: "blurIn",
  sep: "word",
  duration: 0.5,
  easing: "ease-in-out",
} as const;

const CITE_ALLOWED_TAGS = { [MEMORA_CITE_TAG]: ["index"] };

const formatTokenUsage = (usage: ChatMessageData["usage"]): string | null => {
  if (!usage) {
    return null;
  }

  const parts = [
    usage.inputTokens !== undefined ? `In ${usage.inputTokens}` : null,
    usage.outputTokens !== undefined ? `Out ${usage.outputTokens}` : null,
    usage.totalTokens !== undefined ? `Total ${usage.totalTokens}` : null,
  ].filter((value): value is string => value !== null);

  return parts.length > 0 ? parts.join(" · ") : null;
};

export function AssistantMessageContent({
  message,
  isStreaming,
  thinkingSteps,
  status,
  thinkingCollapsed,
  onToggleThinking,
  onSendWidgetPrompt,
}: {
  message: ChatMessageData;
  isStreaming: boolean;
  thinkingSteps?: ThinkingStep[];
  status?: AgentStatus;
  thinkingCollapsed?: boolean;
  onToggleThinking?: () => void;
  onSendWidgetPrompt?: (text: string) => Promise<void> | void;
}) {
  const liveThinkingSteps = thinkingSteps && thinkingSteps.length > 0 ? thinkingSteps : undefined;
  const persistedThinkingSteps =
    message.thinkingSteps && message.thinkingSteps.length > 0 ? message.thinkingSteps : undefined;
  const visibleThinkingSteps = liveThinkingSteps ?? persistedThinkingSteps;
  const visibleStatus = liveThinkingSteps && status ? status : { type: "idle" as const };
  const canToggleThinking = Boolean(liveThinkingSteps && onToggleThinking);
  const { markdown, citations } = buildCitedMarkdown(message.content);
  const components: Components = {
    [MEMORA_CITE_TAG]: ({ index }) => {
      const number = Number(index);
      const moments = citations[number - 1];
      return moments ? <CitationMarker index={number} moments={moments} /> : null;
    },
  };
  const hasStreamingSpinner =
    isStreaming &&
    thinkingSteps &&
    thinkingSteps.length === 0 &&
    !markdown &&
    (!message.widgets || message.widgets.length === 0);
  const tokenUsageText = formatTokenUsage(message.usage);

  return (
    <>
      {visibleThinkingSteps && (
        <ThinkingPanel
          steps={visibleThinkingSteps}
          status={visibleStatus}
          collapsed={canToggleThinking ? thinkingCollapsed : undefined}
          onToggle={canToggleThinking ? onToggleThinking : undefined}
        />
      )}
      {message.widgets && message.widgets.length > 0 && (
        <div {...stylex.props(styles.widgetList)}>
          {message.widgets.map((widget) => (
            <ChatWidget key={widget.toolCallId} widget={widget} onSendPrompt={onSendWidgetPrompt} />
          ))}
        </div>
      )}
      {markdown ? (
        <div
          {...stylex.props(
            styles.content,
            message.widgets && message.widgets.length > 0 && styles.contentWithWidgets,
          )}
        >
          <Streamdown
            className={MEMORA_STREAMDOWN_CLASS_NAME}
            animated={STREAMDOWN_ANIMATION}
            isAnimating={isStreaming}
            controls={MEMORA_STREAMDOWN_CONTROLS}
            plugins={MEMORA_STREAMDOWN_PLUGINS}
            shikiTheme={MEMORA_STREAMDOWN_THEME}
            allowedTags={CITE_ALLOWED_TAGS}
            components={components}
          >
            {markdown}
          </Streamdown>
        </div>
      ) : hasStreamingSpinner ? (
        <div {...stylex.props(styles.loading)}>
          {[0, 1, 2].map((index) => (
            <motion.div
              key={index}
              {...stylex.props(styles.loadingDot)}
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{
                duration: 1.2,
                repeat: Infinity,
                delay: index * 0.2,
              }}
            />
          ))}
        </div>
      ) : null}
      {message.files && message.files.length > 0 && (
        <div {...stylex.props(styles.fileList)}>
          {message.files.map((file) => (
            <Link
              key={file.fileId}
              to={getDocumentEditorHref(file.fileId)}
              {...stylex.props(styles.fileCard)}
            >
              <FileTextIcon className={stylex.props(styles.fileIcon).className} />
              <span {...stylex.props(styles.fileText)}>
                <span {...stylex.props(styles.fileName)}>{file.name}</span>
                <span {...stylex.props(styles.fileAction)}>
                  {file.action === "created" ? "Created" : "Edited"}
                </span>
              </span>
            </Link>
          ))}
        </div>
      )}
      {tokenUsageText && <div {...stylex.props(styles.tokenUsage)}>{tokenUsageText}</div>}
    </>
  );
}
