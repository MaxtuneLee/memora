import type { AgentEvent, TokenUsage } from "@memora/ai-core";

import { SHOW_WIDGET_TOOL_NAME } from "@/lib/chat/showWidget";

import type { DevAgentLogger } from "./logger";
import type {
  AgentStatus,
  ThinkingStep,
} from "./types";
import type { ShowWidgetBufferController } from "./useShowWidgetBuffer";
import type { ChatMessage } from "./types";

const areStatusEqual = (left: AgentStatus, right: AgentStatus): boolean => {
  const leftToolName = "toolName" in left ? left.toolName : undefined;
  const rightToolName = "toolName" in right ? right.toolName : undefined;
  return left.type === right.type && leftToolName === rightToolName;
};

interface CreateAgentEventHandlerOptions {
  streamingId: string;
  addStep: (step: ThinkingStep) => void;
  updateStep: (id: string, updates: Partial<ThinkingStep>) => void;
  appendStepText: (id: string, delta: string) => void;
  addChildStep: (parentId: string, child: ThinkingStep) => void;
  setStatus: (
    updater:
      | AgentStatus
      | ((previous: AgentStatus) => AgentStatus),
  ) => void;
  setThinkingCollapsed: (value: boolean) => void;
  setError: (error: Error | null) => void;
  setIterationLimitPrompt: (value: { iterations: number } | null) => void;
  updateMessageById: (
    messageId: string,
    updater: (message: ChatMessage) => ChatMessage,
  ) => void;
  parseIterationLimit: (error: Error) => number | null;
  widgetBuffer: ShowWidgetBufferController;
  reasoningStepIdRef: { current: string };
  searchStepIdRef: { current: string };
  widgetStartedRef: { current: boolean };
  streamedTextRef: { current: string };
  usageRef: { current?: TokenUsage };
  logger: DevAgentLogger;
  removeEmptyBubble: () => void;
}

export const createAgentEventHandler = ({
  streamingId,
  addStep,
  updateStep,
  appendStepText,
  addChildStep,
  setStatus,
  setThinkingCollapsed,
  setError,
  setIterationLimitPrompt,
  updateMessageById,
  parseIterationLimit,
  widgetBuffer,
  reasoningStepIdRef,
  searchStepIdRef,
  widgetStartedRef,
  streamedTextRef,
  usageRef,
  logger,
  removeEmptyBubble,
}: CreateAgentEventHandlerOptions) => {
  return (event: AgentEvent): void => {
    switch (event.type) {
      case "status": {
        if (event.status === "in_progress") {
          setStatus((previous) => {
            const nextStatus: AgentStatus = { type: "thinking" };
            return areStatusEqual(previous, nextStatus)
              ? previous
              : nextStatus;
          });
        }
        logger.logEvent({ type: event.type, status: event.status });
        break;
      }

      case "reasoning-delta": {
        if (!reasoningStepIdRef.current) {
          const id = crypto.randomUUID();
          reasoningStepIdRef.current = id;
          addStep({
            id,
            type: "reasoning",
            text: event.delta,
            status: "in_progress",
          });
          setStatus({ type: "thinking" });
        } else {
          appendStepText(reasoningStepIdRef.current, event.delta);
        }
        break;
      }

      case "reasoning-done": {
        logger.logEvent({ type: event.type, content: event.text });
        if (reasoningStepIdRef.current) {
          updateStep(reasoningStepIdRef.current, {
            text: event.text,
            status: "done",
          });
          reasoningStepIdRef.current = "";
        }
        break;
      }

      case "usage": {
        usageRef.current = event.usage;
        logger.logEvent({ type: event.type, usage: event.usage });
        break;
      }

      case "web-search": {
        if (event.status === "in_progress" || event.status === "searching") {
          if (!searchStepIdRef.current) {
            const id = crypto.randomUUID();
            searchStepIdRef.current = id;
            addStep({
              id,
              type: "web-search",
              text: "",
              status: "in_progress",
              children: [],
            });
          }
          setStatus({ type: "searching" });
          logger.logEvent({ type: event.type, status: event.status });
        } else if (event.status === "completed") {
          if (searchStepIdRef.current) {
            updateStep(searchStepIdRef.current, { status: "done" });
            searchStepIdRef.current = "";
          }
          setStatus({ type: "thinking" });
          logger.logEvent({ type: event.type, status: event.status });
        }
        break;
      }

      case "output-item-added": {
        if (event.itemType === "web_search_call") {
          if (!searchStepIdRef.current) {
            const id = crypto.randomUUID();
            searchStepIdRef.current = id;
            addStep({
              id,
              type: "web-search",
              text: "",
              status: "in_progress",
              children: [],
            });
          }
          setStatus({ type: "searching" });
          logger.logEvent({ type: event.type, status: "searching" });
        }
        break;
      }

      case "output-item-done": {
        if (event.itemType === "web_search_call" && searchStepIdRef.current) {
          const queries = (event.item as { queries?: string[] }).queries ?? [];
          const results =
            (
              event.item as {
                results?: Array<{ title?: string; url?: string }>;
              }
            ).results ?? [];
          updateStep(searchStepIdRef.current, {
            text: queries.join(", "),
            status: "done",
          });

          for (const result of results) {
            addChildStep(searchStepIdRef.current, {
              id: crypto.randomUUID(),
              type: "web-search",
              text: result.title ?? result.url ?? "",
              status: "done",
            });
          }

          searchStepIdRef.current = "";
          setStatus({ type: "thinking" });
          logger.logEvent({
            type: event.type,
            queries,
            resultsCount: results.length,
            content: results.map((result) => result.title ?? result.url ?? ""),
          });
        }
        break;
      }

      case "text-delta": {
        if (!streamedTextRef.current) {
          logger.logEvent({ type: event.type, status: "generating" });
        }
        setStatus((previous) => {
          const nextStatus: AgentStatus = { type: "generating" };
          return areStatusEqual(previous, nextStatus) ? previous : nextStatus;
        });
        if (!streamedTextRef.current) {
          setThinkingCollapsed(true);
        }
        streamedTextRef.current += event.delta;
        const text = streamedTextRef.current;
        updateMessageById(streamingId, (message) => {
          if (message.content === text) {
            return message;
          }
          return {
            ...message,
            content: text,
          };
        });
        break;
      }

      case "tool-call-start": {
        setStatus({ type: "tool-calling", toolName: event.toolCall.name });
        addStep({
          id: event.toolCall.id,
          type: "tool-call",
          text: event.toolCall.name,
          status: "in_progress",
        });
        logger.logEvent({
          type: event.type,
          toolName: event.toolCall.name,
          toolCallId: event.toolCall.id,
        });
        if (event.toolCall.name === SHOW_WIDGET_TOOL_NAME) {
          widgetStartedRef.current = true;
          widgetBuffer.startWidgetToolCall(streamingId, event.toolCall.id);
        }
        break;
      }

      case "tool-call-args-delta": {
        widgetBuffer.appendWidgetArgsDelta(event.toolCallId, event.delta);
        break;
      }

      case "tool-result": {
        setStatus({ type: "tool-running", toolName: event.toolCall.name });
        logger.logEvent({
          type: event.type,
          toolName: event.toolCall.name,
          toolCallId: event.toolCall.id,
          isError: event.isError,
          toolResult: event.result,
        });
        if (event.toolCall.name === SHOW_WIDGET_TOOL_NAME) {
          const errorMessage =
            event.isError && typeof event.result === "string"
              ? event.result
              : event.isError
                ? "show_widget failed."
                : undefined;
          widgetBuffer.flushBufferedWidget(event.toolCall.id, {
            phase: event.isError ? "error" : "ready",
            ...(errorMessage ? { errorMessage } : {}),
            debugEvent: {
              type: "tool-result",
              summary: event.isError
                ? "show_widget returned an error"
                : "show_widget finished successfully",
              details: {
                isError: event.isError,
                resultPreview:
                  typeof event.result === "string"
                    ? event.result.slice(0, 240)
                    : event.result,
              },
            },
          });
        }
        break;
      }

      case "tool-call-complete": {
        updateStep(event.toolCall.id, { status: "done" });
        setStatus({ type: "thinking" });
        logger.logEvent({
          type: event.type,
          toolName: event.toolCall.name,
          toolCallId: event.toolCall.id,
        });
        if (event.toolCall.name === SHOW_WIDGET_TOOL_NAME) {
          widgetBuffer.completeWidgetToolCall(
            event.toolCall.id,
            event.toolCall.arguments,
          );
        }
        break;
      }

      case "error": {
        widgetBuffer.flushAllBufferedWidgets();
        const iterations = parseIterationLimit(event.error);
        if (iterations !== null) {
          setIterationLimitPrompt({ iterations });
          setError(null);
          setStatus({ type: "idle" });
        } else {
          setError(event.error);
          setStatus({ type: "error" });
        }
        logger.logEvent({
          type: event.type,
          errorMessage: event.error.message,
        });
        removeEmptyBubble();
        break;
      }

      case "done": {
        usageRef.current = event.usage;
        updateMessageById(streamingId, (message) => {
          const nextContent =
            event.message.content
              .filter(
                (content): content is { type: "text"; text: string } =>
                  content.type === "text",
              )
              .map((content) => content.text)
              .join("") || streamedTextRef.current;
          const nextUsage = event.usage;
          const usageUnchanged =
            message.usage?.inputTokens === nextUsage?.inputTokens &&
            message.usage?.outputTokens === nextUsage?.outputTokens &&
            message.usage?.totalTokens === nextUsage?.totalTokens;

          if (message.content === nextContent && usageUnchanged) {
            return message;
          }

          return {
            ...message,
            content: nextContent,
            ...(nextUsage ? { usage: nextUsage } : {}),
          };
        });
        logger.logEvent({ type: event.type, usage: event.usage });
        break;
      }
    }
  };
};
