import { useCallback, useMemo, useRef } from "react";

import type {
  ChatWidget,
  ChatWidgetPhase,
  ShowWidgetArguments,
} from "@/lib/chat/showWidget";
import {
  parsePartialShowWidgetArguments,
  sanitizeShowWidgetArguments,
} from "@/lib/chat/showWidget";
import {
  clearShowWidgetDebug,
  updateShowWidgetDebug,
} from "@/lib/chat/showWidgetDebug";

import type { ChatMessage } from "./types";

const areWidgetsEqual = (left: ChatWidget, right: ChatWidget): boolean => {
  if (
    left.toolCallId !== right.toolCallId ||
    left.title !== right.title ||
    left.widgetCode !== right.widgetCode ||
    left.phase !== right.phase ||
    left.errorMessage !== right.errorMessage ||
    left.loadingMessages.length !== right.loadingMessages.length
  ) {
    return false;
  }

  return left.loadingMessages.every((message, index) => {
    return message === right.loadingMessages[index];
  });
};

interface ParsedShowWidgetSnapshot {
  title: string;
  loadingMessages: string[];
  widgetCode: string;
}

const areParsedShowWidgetSnapshotsEqual = (
  left: ParsedShowWidgetSnapshot | null,
  right: ParsedShowWidgetSnapshot | null,
): boolean => {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  if (
    left.title !== right.title ||
    left.widgetCode !== right.widgetCode ||
    left.loadingMessages.length !== right.loadingMessages.length
  ) {
    return false;
  }

  return left.loadingMessages.every((message, index) => {
    return message === right.loadingMessages[index];
  });
};

const toParsedShowWidgetSnapshot = (
  rawArgsBuffer: string,
): ParsedShowWidgetSnapshot | null => {
  const partialArguments = parsePartialShowWidgetArguments(rawArgsBuffer);
  if (!partialArguments) {
    return null;
  }

  return {
    title: partialArguments.title ?? "",
    loadingMessages: partialArguments.loading_messages ?? [],
    widgetCode: partialArguments.widget_code ?? "",
  };
};

export interface ShowWidgetBufferController {
  clearBufferedWidgetState: () => void;
  flushBufferedWidget: (
    toolCallId: string,
    options?: {
      phase?: ChatWidgetPhase;
      errorMessage?: string;
      debugEvent?: {
        type: string;
        summary: string;
        details?: Record<string, unknown>;
      };
    },
  ) => void;
  flushAllBufferedWidgets: () => void;
  startWidgetToolCall: (messageId: string, toolCallId: string) => void;
  appendWidgetArgsDelta: (toolCallId: string, delta: string) => void;
  completeWidgetToolCall: (toolCallId: string, argumentsValue: unknown) => void;
}

export const useShowWidgetBuffer = (
  updateMessageById: (
    messageId: string,
    updater: (message: ChatMessage) => ChatMessage,
  ) => void,
): ShowWidgetBufferController => {
  const rawWidgetArgsBufferByToolCallIdRef = useRef(new Map<string, string>());
  const scheduledWidgetFrameByToolCallIdRef = useRef(new Map<string, number>());
  const latestParsedWidgetSnapshotByToolCallIdRef = useRef(
    new Map<string, ParsedShowWidgetSnapshot | null>(),
  );
  const streamingMessageIdByToolCallIdRef = useRef(new Map<string, string>());
  const latestWidgetDeltaByToolCallIdRef = useRef(new Map<string, string>());

  const upsertWidget = useCallback(
    (
      messageId: string,
      toolCallId: string,
      updater: (widget: ChatWidget | undefined) => ChatWidget,
    ) => {
      updateMessageById(messageId, (message) => {
        const currentWidgets = message.widgets ?? [];
        const widgetIndex = currentWidgets.findIndex((widget) => {
          return widget.toolCallId === toolCallId;
        });
        const currentWidget =
          widgetIndex >= 0 ? currentWidgets[widgetIndex] : undefined;
        const nextWidget = updater(currentWidget);
        if (currentWidget && areWidgetsEqual(currentWidget, nextWidget)) {
          return message;
        }

        const widgets = [...currentWidgets];
        if (widgetIndex >= 0) {
          widgets[widgetIndex] = nextWidget;
        } else {
          widgets.push(nextWidget);
        }

        return {
          ...message,
          widgets,
        };
      });
    },
    [updateMessageById],
  );

  const cancelScheduledWidgetFlush = useCallback((toolCallId: string) => {
    const frameId = scheduledWidgetFrameByToolCallIdRef.current.get(toolCallId);
    if (frameId === undefined) {
      return;
    }

    window.cancelAnimationFrame(frameId);
    scheduledWidgetFrameByToolCallIdRef.current.delete(toolCallId);
  }, []);

  const clearBufferedWidgetState = useCallback(() => {
    scheduledWidgetFrameByToolCallIdRef.current.forEach((frameId) => {
      window.cancelAnimationFrame(frameId);
    });
    scheduledWidgetFrameByToolCallIdRef.current = new Map();
    rawWidgetArgsBufferByToolCallIdRef.current = new Map();
    latestParsedWidgetSnapshotByToolCallIdRef.current = new Map();
    streamingMessageIdByToolCallIdRef.current = new Map();
    latestWidgetDeltaByToolCallIdRef.current = new Map();
  }, []);

  const flushBufferedWidget = useCallback(
    (
      toolCallId: string,
      options?: {
        phase?: ChatWidgetPhase;
        errorMessage?: string;
        debugEvent?: {
          type: string;
          summary: string;
          details?: Record<string, unknown>;
        };
      },
    ) => {
      cancelScheduledWidgetFlush(toolCallId);

      const messageId = streamingMessageIdByToolCallIdRef.current.get(toolCallId);
      const rawArgsBuffer =
        rawWidgetArgsBufferByToolCallIdRef.current.get(toolCallId) ?? "";
      const latestDelta =
        latestWidgetDeltaByToolCallIdRef.current.get(toolCallId) ?? "";
      const nextSnapshot = toParsedShowWidgetSnapshot(rawArgsBuffer);
      const previousSnapshot =
        latestParsedWidgetSnapshotByToolCallIdRef.current.get(toolCallId) ?? null;

      if (nextSnapshot) {
        latestParsedWidgetSnapshotByToolCallIdRef.current.set(
          toolCallId,
          nextSnapshot,
        );
      }

      updateShowWidgetDebug(
        toolCallId,
        {
          argsBuffer: rawArgsBuffer,
          latestDelta,
          ...(nextSnapshot ? { widgetCode: nextSnapshot.widgetCode } : {}),
          ...(options?.phase ? { phase: options.phase } : {}),
        },
        options?.debugEvent
          ? {
              type: options.debugEvent.type,
              summary: options.debugEvent.summary,
              details: {
                bufferLength: rawArgsBuffer.length,
                latestDeltaLength: latestDelta.length,
                parsed: Boolean(nextSnapshot),
                widgetCodeLength: nextSnapshot?.widgetCode.length ?? null,
                ...options.debugEvent.details,
              },
            }
          : {
              type: "tool-call-args-flush",
              summary: nextSnapshot
                ? "Committed buffered show_widget snapshot"
                : "Buffered show_widget snapshot not yet parseable",
              details: {
                bufferLength: rawArgsBuffer.length,
                latestDeltaLength: latestDelta.length,
                parsed: Boolean(nextSnapshot),
                widgetCodeLength: nextSnapshot?.widgetCode.length ?? null,
              },
            },
      );

      if (!messageId) {
        return;
      }

      const shouldApplySnapshot =
        nextSnapshot !== null &&
        !areParsedShowWidgetSnapshotsEqual(previousSnapshot, nextSnapshot);
      const shouldApplyPatch =
        options?.phase !== undefined || options?.errorMessage !== undefined;
      if (!shouldApplySnapshot && !shouldApplyPatch) {
        return;
      }

      upsertWidget(messageId, toolCallId, (currentWidget) => {
        const fallbackSnapshot = nextSnapshot ?? previousSnapshot;
        return {
          toolCallId,
          title: fallbackSnapshot?.title ?? currentWidget?.title ?? "",
          loadingMessages:
            fallbackSnapshot?.loadingMessages ??
            currentWidget?.loadingMessages ??
            [],
          widgetCode:
            fallbackSnapshot?.widgetCode ?? currentWidget?.widgetCode ?? "",
          phase: options?.phase ?? currentWidget?.phase ?? "streaming",
          ...(options?.errorMessage !== undefined
            ? { errorMessage: options.errorMessage }
            : currentWidget?.errorMessage
              ? { errorMessage: currentWidget.errorMessage }
              : {}),
        };
      });
    },
    [cancelScheduledWidgetFlush, upsertWidget],
  );

  const flushAllBufferedWidgets = useCallback(() => {
    for (const toolCallId of streamingMessageIdByToolCallIdRef.current.keys()) {
      flushBufferedWidget(toolCallId, {
        debugEvent: {
          type: "tool-call-args-flush-all",
          summary: "Flushed buffered show_widget snapshot during cleanup",
        },
      });
    }
  }, [flushBufferedWidget]);

  const scheduleBufferedWidgetFlush = useCallback(
    (toolCallId: string) => {
      if (scheduledWidgetFrameByToolCallIdRef.current.has(toolCallId)) {
        return;
      }

      const frameId = window.requestAnimationFrame(() => {
        scheduledWidgetFrameByToolCallIdRef.current.delete(toolCallId);
        flushBufferedWidget(toolCallId);
      });
      scheduledWidgetFrameByToolCallIdRef.current.set(toolCallId, frameId);
    },
    [flushBufferedWidget],
  );

  const startWidgetToolCall = useCallback(
    (messageId: string, toolCallId: string) => {
      rawWidgetArgsBufferByToolCallIdRef.current.set(toolCallId, "");
      latestParsedWidgetSnapshotByToolCallIdRef.current.set(toolCallId, null);
      streamingMessageIdByToolCallIdRef.current.set(toolCallId, messageId);
      latestWidgetDeltaByToolCallIdRef.current.set(toolCallId, "");
      clearShowWidgetDebug(toolCallId);
      updateShowWidgetDebug(
        toolCallId,
        {
          argsBuffer: "",
          latestDelta: "",
          widgetCode: "",
          phase: "streaming",
        },
        {
          type: "tool-call-start",
          summary: "show_widget started",
          details: {
            assistantMessageId: messageId,
          },
        },
      );
      upsertWidget(messageId, toolCallId, (currentWidget) => ({
        toolCallId,
        title: currentWidget?.title ?? "",
        loadingMessages: currentWidget?.loadingMessages ?? [],
        widgetCode: currentWidget?.widgetCode ?? "",
        phase: currentWidget?.phase ?? "streaming",
        ...(currentWidget?.errorMessage
          ? { errorMessage: currentWidget.errorMessage }
          : {}),
      }));
    },
    [upsertWidget],
  );

  const appendWidgetArgsDelta = useCallback(
    (toolCallId: string, delta: string) => {
      const previousBuffer =
        rawWidgetArgsBufferByToolCallIdRef.current.get(toolCallId);
      if (previousBuffer === undefined) {
        return;
      }

      rawWidgetArgsBufferByToolCallIdRef.current.set(
        toolCallId,
        `${previousBuffer}${delta}`,
      );
      latestWidgetDeltaByToolCallIdRef.current.set(toolCallId, delta);
      scheduleBufferedWidgetFlush(toolCallId);
    },
    [scheduleBufferedWidgetFlush],
  );

  const completeWidgetToolCall = useCallback(
    (toolCallId: string, argumentsValue: unknown) => {
      const completeArguments = sanitizeShowWidgetArguments(
        argumentsValue as Partial<Record<keyof ShowWidgetArguments, unknown>>,
      );
      rawWidgetArgsBufferByToolCallIdRef.current.set(
        toolCallId,
        JSON.stringify({
          i_have_seen_read_me: completeArguments.i_have_seen_read_me ?? true,
          title: completeArguments.title ?? "",
          loading_messages: completeArguments.loading_messages ?? [],
          widget_code: completeArguments.widget_code ?? "",
        }),
      );
      flushBufferedWidget(toolCallId, {
        phase: "streaming",
        debugEvent: {
          type: "tool-call-complete",
          summary: "show_widget arguments completed",
          details: {
            title: completeArguments.title ?? "",
            loadingMessagesCount:
              completeArguments.loading_messages?.length ?? 0,
            widgetCodeLength: completeArguments.widget_code?.length ?? 0,
          },
        },
      });
    },
    [flushBufferedWidget],
  );

  return useMemo(() => {
    return {
      clearBufferedWidgetState,
      flushBufferedWidget,
      flushAllBufferedWidgets,
      startWidgetToolCall,
      appendWidgetArgsDelta,
      completeWidgetToolCall,
    };
  }, [
    appendWidgetArgsDelta,
    clearBufferedWidgetState,
    completeWidgetToolCall,
    flushAllBufferedWidgets,
    flushBufferedWidget,
    startWidgetToolCall,
  ]);
};
