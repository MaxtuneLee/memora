import type { WriteWidgetDataResult } from "@/lib/widgets/widgetDataFile";

import { MAX_PROMPT_LENGTH, normalizeWidgetLink, type ActionLimiters } from "./limits";
import { HOST_MESSAGE, RUNNER_MESSAGE, type HostMessage, type RunnerMessage } from "./protocol";

type MessageOf<Type extends RunnerMessage["type"]> = Extract<RunnerMessage, { type: Type }>;

export interface RunnerMessageHandlers {
  onSendPrompt?: (text: string) => void;
  onOpenLink?: (url: string) => void;
  onWriteData?: (name: string, content: string) => Promise<WriteWidgetDataResult>;
  onRunResult?: (message: MessageOf<typeof RUNNER_MESSAGE.runResult>) => void;
  onRunnerError?: (message: MessageOf<typeof RUNNER_MESSAGE.error>) => void;
}

// What the router needs from the host hook: where replies go, the per-action budgets, the
// caller's handlers, and the lifecycle callbacks for messages that change the hook's own state.
export interface RunnerRouterContext {
  post: (message: HostMessage) => void;
  limiters: ActionLimiters;
  getHandlers: () => RunnerMessageHandlers;
  onBoot: () => void;
  onPong: (seq: number) => void;
  onReady: () => void;
  onResize: (height: number, hasContent: boolean) => void;
}

const routeSendPrompt = (context: RunnerRouterContext, text: string): void => {
  const clipped = text.slice(0, MAX_PROMPT_LENGTH);
  if (clipped.trim() && context.limiters.sendPrompt.take()) {
    context.getHandlers().onSendPrompt?.(clipped);
  }
};

const routeOpenLink = (context: RunnerRouterContext, link: string): void => {
  const url = normalizeWidgetLink(link);
  if (url && context.limiters.openLink.take()) {
    context.getHandlers().onOpenLink?.(url);
  }
};

const routeWriteData = (
  context: RunnerRouterContext,
  { requestId, name, content }: MessageOf<typeof RUNNER_MESSAGE.writeData>,
): void => {
  const respond = (result: WriteWidgetDataResult): void => {
    context.post({
      type: HOST_MESSAGE.writeDataResult,
      requestId,
      ok: result.ok,
      error: result.ok ? undefined : result.error,
    });
  };
  const write = context.getHandlers().onWriteData;
  if (!context.limiters.writeData.take()) {
    respond({ ok: false, error: "Too many writes. Try again in a moment." });
  } else if (!write) {
    respond({ ok: false, error: "This widget cannot write data." });
  } else {
    write(name, content).then(respond, (error: unknown) => {
      respond({ ok: false, error: error instanceof Error ? error.message : "Write failed." });
    });
  }
};

// Acts on one parsed message from the frame. The flood check and the sender check happen before
// this, in the host hook.
export const routeRunnerMessage = (context: RunnerRouterContext, message: RunnerMessage): void => {
  switch (message.type) {
    case RUNNER_MESSAGE.boot:
      return context.onBoot();
    case RUNNER_MESSAGE.pong:
      return context.onPong(message.seq);
    case RUNNER_MESSAGE.ready:
      return context.onReady();
    case RUNNER_MESSAGE.resize:
      return context.onResize(message.height, message.hasContent);
    case RUNNER_MESSAGE.error:
      return context.getHandlers().onRunnerError?.(message);
    case RUNNER_MESSAGE.runResult:
      return context.getHandlers().onRunResult?.(message);
    case RUNNER_MESSAGE.sendPrompt:
      return routeSendPrompt(context, message.text);
    case RUNNER_MESSAGE.openLink:
      return routeOpenLink(context, message.url);
    case RUNNER_MESSAGE.writeData:
      return routeWriteData(context, message);
  }
};
