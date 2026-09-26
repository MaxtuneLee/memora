import { useCallback, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  toPiTool,
  type AgentConfig,
  type AgentMessage,
  type ToolDefinition,
} from "@memora/ai-core";
import { command, getSnapshot, subscribe } from "@/lib/agent-runtime/client";
import { EMPTY_REFERENCE_SCOPE } from "@/lib/chat/tools/shared";
import { normalizeTurnInput, toAgentHistoryMessages } from "./useAgent/input";
import type { ChatMessage, UseAgentOptions, UseAgentReturn } from "./useAgent/types";
export type { AgentStatus, ChatMessage, ChatTurnInput, ThinkingStep } from "./useAgent/types";

export const useAgent = (options: UseAgentOptions): UseAgentReturn => {
  const { sessionId } = options;
  const snapshot = useSyncExternalStore(
    useCallback(
      (listener) =>
        sessionId === "bootstrap"
          ? () => {}
          : subscribe(sessionId, listener, options.sessionStorage),
      [sessionId, options.sessionStorage],
    ),
    useCallback(() => getSnapshot(sessionId), [sessionId]),
  );
  const [localError, setLocalError] = useState<{ sessionId: string; error: Error } | null>(null);
  const [dismissedIteration, setDismissedIteration] = useState<number | null>(null);
  const reportError = useCallback(
    (error: unknown) => {
      setLocalError({
        sessionId,
        error: error instanceof Error ? error : new Error(String(error)),
      });
    },
    [sessionId],
  );
  // Callers pass a fresh options object every render; read the latest at call time so `send` stays stable.
  const optionsRef = useRef(options);
  useLayoutEffect(() => {
    optionsRef.current = options;
  });
  const send = useCallback<UseAgentReturn["send"]>(
    async (input, turnOptions) => {
      const options = optionsRef.current;
      setLocalError(null);
      setDismissedIteration(null);
      try {
        if (!options.providerConfig)
          throw new Error("Select a configured provider and model before sending a message.");
        const normalized = normalizeTurnInput(input);
        const id = turnOptions?.existingUserMessage?.id ?? crypto.randomUUID();
        const agentInput: AgentMessage = {
          id,
          role: "user",
          createdAt: Date.now(),
          content: [
            ...(normalized.text ? [{ type: "text" as const, text: normalized.text }] : []),
            ...normalized.images.map((image) => ({
              type: "image" as const,
              mimeType: image.attachment.mimeType,
              data: image.data,
            })),
          ],
        };
        const message: ChatMessage = turnOptions?.existingUserMessage ?? {
          id,
          role: "user",
          content: turnOptions?.userMessageContent ?? normalized.text,
          attachments: normalized.images.map((image) => image.attachment),
        };
        // Capture page-derived scope and configuration before the first asynchronous boundary.
        const scope = structuredClone(options.getReferenceScope?.() ?? EMPTY_REFERENCE_SCOPE);
        const provider = structuredClone(options.providerConfig);
        const prompts = await Promise.all(
          (options.promptSegments ?? []).map(async (segment) => ({
            ...segment,
            content:
              typeof segment.content === "function" ? await segment.content() : segment.content,
          })),
        );
        await command({
          type: "submit",
          sessionId,
          storage: options.sessionStorage,
          submission: {
            id: crypto.randomUUID(),
            input: agentInput,
            message,
            mode: turnOptions?.mode ?? options.deliveryMode ?? "pending",
            provider,
            config: { ...options.config, id: `memora-chat:${sessionId}` } as AgentConfig,
            prompts,
            scope,
            tools: (options.tools ?? []).map((tool) => {
              const value = toPiTool(tool as ToolDefinition);
              return {
                name: value.name,
                description: value.description,
                parameters: value.parameters as Record<string, unknown>,
              };
            }),
          },
        });
      } catch (error) {
        reportError(error);
        throw error;
      }
    },
    [sessionId, reportError],
  );
  const abort = useCallback(() => {
    const runId = getSnapshot(sessionId).activeRunId;
    if (runId) void command({ type: "abort", sessionId, runId }).catch(reportError);
  }, [sessionId, reportError]);
  const reset = useCallback<UseAgentReturn["reset"]>(
    async (next) => {
      await command({
        type: "reset",
        sessionId,
        messages: next?.messages ?? [],
        history: toAgentHistoryMessages(next?.contextMessages ?? next?.messages ?? []),
        replayFrom: next?.replayFrom,
      });
      setLocalError(null);
    },
    [sessionId],
  );
  const updateMessage = useCallback<UseAgentReturn["updateMessage"]>(
    (id, updater) => {
      const message = getSnapshot(sessionId).messages.find((item) => item.id === id);
      if (message)
        void command({ type: "patch-message", sessionId, message: updater(message) }).catch(
          reportError,
        );
    },
    [sessionId, reportError],
  );
  const resolveWriteApproval = useCallback<UseAgentReturn["resolveWriteApproval"]>(
    (decision) => {
      const approval = getSnapshot(sessionId).approval;
      if (approval)
        void command({ type: "approval", sessionId, approvalId: approval.id, decision }).catch(
          reportError,
        );
    },
    [sessionId, reportError],
  );
  return {
    messages: snapshot.messages,
    pendingMessages: snapshot.pending.map(({ id, text }) => ({ id, text })),
    pendingWriteApproval: snapshot.approval?.request ?? null,
    resolveWriteApproval,
    isStreaming: Boolean(snapshot.activeRunId),
    status: snapshot.status,
    thinkingSteps: snapshot.thinkingSteps,
    thinkingCollapsed: snapshot.thinkingCollapsed,
    iterationLimitPrompt:
      snapshot.iterations && dismissedIteration !== snapshot.revision
        ? { iterations: snapshot.iterations }
        : null,
    error:
      localError?.sessionId === sessionId
        ? localError.error
        : snapshot.error
          ? new Error(snapshot.error)
          : null,
    send,
    abort,
    reset,
    updateMessage,
    continueAfterIterationLimit: () =>
      send("Continue from where you left off and finish the request."),
    dismissIterationLimitPrompt: () => setDismissedIteration(snapshot.revision),
    saveMemory: async (key, value) => {
      const adapter = options.persistence;
      if (!adapter) throw new Error("Memory storage is unavailable.");
      const memory =
        (await adapter.load<Record<string, unknown>>(options.config.id ?? sessionId, "memory")) ??
        {};
      await adapter.save(options.config.id ?? sessionId, "memory", { ...memory, [key]: value });
    },
    loadMemory: async <T>(key: string) => {
      const memory = await options.persistence?.load<Record<string, unknown>>(
        options.config.id ?? sessionId,
        "memory",
      );
      return (memory?.[key] as T | undefined) ?? null;
    },
  };
};
