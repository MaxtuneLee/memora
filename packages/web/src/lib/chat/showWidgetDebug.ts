const IS_DEV = import.meta.env.DEV;
const MAX_DEBUG_EVENTS = 40;

export interface ShowWidgetDebugEvent {
  at: number;
  type: string;
  summary: string;
  details?: Record<string, unknown>;
}

export interface ShowWidgetDebugState {
  toolCallId: string;
  argsBuffer: string;
  latestDelta: string;
  widgetCode: string;
  phase: string;
  events: ShowWidgetDebugEvent[];
}

const listeners = new Set<() => void>();
const debugStore = new Map<string, ShowWidgetDebugState>();

const createEmptyState = (toolCallId: string): ShowWidgetDebugState => ({
  toolCallId,
  argsBuffer: "",
  latestDelta: "",
  widgetCode: "",
  phase: "idle",
  events: [],
});

const NO_ID_STATE = createEmptyState("");

const emitChange = () => {
  listeners.forEach((listener) => {
    listener();
  });
};

const toPreview = (value: string): string => {
  return value.length > 240 ? `${value.slice(0, 240)}...` : value;
};

const appendEvent = (
  events: ShowWidgetDebugEvent[],
  event?: Omit<ShowWidgetDebugEvent, "at">,
): ShowWidgetDebugEvent[] => {
  if (!event) {
    return events;
  }

  return [...events, { ...event, at: Date.now() }].slice(-MAX_DEBUG_EVENTS);
};

export const getShowWidgetDebugState = (toolCallId: string): ShowWidgetDebugState => {
  if (!toolCallId) {
    return NO_ID_STATE;
  }

  // useSyncExternalStore needs a stable snapshot: a fresh object per call loops forever (React
  // #185). In production nothing ever writes debugStore, so cache the empty state on first read.
  // ponytail: one small object per widget stays for the session in prod; clear it if that matters.
  let state = debugStore.get(toolCallId);
  if (!state) {
    state = createEmptyState(toolCallId);
    debugStore.set(toolCallId, state);
  }
  return state;
};

export const subscribeShowWidgetDebug = (listener: () => void): (() => void) => {
  if (!IS_DEV) {
    return () => {};
  }

  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const updateShowWidgetDebug = (
  toolCallId: string,
  patch: Partial<Omit<ShowWidgetDebugState, "toolCallId" | "events">>,
  event?: Omit<ShowWidgetDebugEvent, "at">,
): void => {
  if (!IS_DEV || !toolCallId) {
    return;
  }

  const currentState = getShowWidgetDebugState(toolCallId);
  const nextState: ShowWidgetDebugState = {
    ...currentState,
    ...patch,
    toolCallId,
    events: appendEvent(currentState.events, event),
  };

  debugStore.set(toolCallId, nextState);
  emitChange();

  if (event) {
    console.debug("[show_widget]", {
      toolCallId,
      type: event.type,
      summary: event.summary,
      ...(patch.phase !== undefined ? { phase: patch.phase } : {}),
      ...(patch.argsBuffer !== undefined
        ? {
            argsBufferLength: patch.argsBuffer.length,
            argsBufferPreview: toPreview(patch.argsBuffer),
          }
        : {}),
      ...(patch.latestDelta !== undefined
        ? {
            latestDeltaLength: patch.latestDelta.length,
            latestDeltaPreview: toPreview(patch.latestDelta),
          }
        : {}),
      ...(patch.widgetCode !== undefined
        ? {
            widgetCodeLength: patch.widgetCode.length,
            widgetCodePreview: toPreview(patch.widgetCode),
          }
        : {}),
      ...(event.details ? { details: event.details } : {}),
    });
  }
};

export const clearShowWidgetDebug = (toolCallId: string): void => {
  if (!IS_DEV || !toolCallId) {
    return;
  }

  if (debugStore.delete(toolCallId)) {
    emitChange();
  }
};
