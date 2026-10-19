// Host-side limits on what a sandboxed widget frame can ask for. The frame is untrusted, so none
// of these can live only in the runner page.

const MIN_WIDGET_HEIGHT = 1;
export const MAX_WIDGET_HEIGHT = 4000;
export const MAX_PROMPT_LENGTH = 20_000;
const MAX_LINK_LENGTH = 2048;

export const clampWidgetHeight = (height: number): number => {
  if (!Number.isFinite(height)) {
    return MIN_WIDGET_HEIGHT;
  }
  return Math.min(MAX_WIDGET_HEIGHT, Math.max(MIN_WIDGET_HEIGHT, Math.round(height)));
};

// Only links a person would expect a widget to open. Anything else (javascript:, data:, blob:,
// file:) is dropped rather than handed to window.open.
export const normalizeWidgetLink = (url: string): string | null => {
  const trimmed = url.trim();
  if (!trimmed || trimmed.length > MAX_LINK_LENGTH) {
    return null;
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : null;
  } catch {
    return null;
  }
};

export interface TokenBucket {
  take: () => boolean;
}

export const createTokenBucket = ({
  capacity,
  refillPerSecond,
  now = () => performance.now(),
}: {
  capacity: number;
  refillPerSecond: number;
  now?: () => number;
}): TokenBucket => {
  let tokens = capacity;
  let last = now();
  return {
    take: () => {
      const current = now();
      tokens = Math.min(capacity, tokens + ((current - last) / 1000) * refillPerSecond);
      last = current;
      if (tokens < 1) {
        return false;
      }
      tokens -= 1;
      return true;
    },
  };
};

export interface ActionLimiters {
  sendPrompt: TokenBucket;
  openLink: TokenBucket;
  writeData: TokenBucket;
  anyMessage: TokenBucket;
}

// Per-action budgets for one widget instance. A widget that sends more than this is not doing
// anything a person asked for, so excess calls are dropped.
export const createActionLimiters = (now?: () => number): ActionLimiters => ({
  sendPrompt: createTokenBucket({ capacity: 3, refillPerSecond: 0.5, now }),
  openLink: createTokenBucket({ capacity: 3, refillPerSecond: 0.5, now }),
  writeData: createTokenBucket({ capacity: 10, refillPerSecond: 5, now }),
  // Every message counts here. A frame that exhausts it is flooding the host and gets torn down.
  anyMessage: createTokenBucket({ capacity: 400, refillPerSecond: 200, now }),
});

// What the widget's own String(x) would give for the values its calls expect. Anything else
// (objects, null, undefined) becomes an empty string instead of "[object Object]".
export const toWidgetText = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }
  return typeof value === "number" || typeof value === "boolean" || typeof value === "bigint"
    ? String(value)
    : "";
};
