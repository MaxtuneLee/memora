import {
  type CSSProperties,
  type PointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import * as stylex from "@stylexjs/stylex";

import {
  getLocalModelDebugSnapshot,
  subscribeLocalModelDebugSnapshot,
  type LocalModelPoolDebugState,
  type LocalModelWorkerDebugState,
} from "@/lib/local-model/devtools";
import { tokens } from "../../styles/stylex.stylex";

const IS_DEV = import.meta.env.DEV;

interface BrowserMemorySnapshot {
  source: "uasm" | "heap" | "unavailable";
  bytes: number | null;
  totalBytes: number | null;
  limitBytes: number | null;
  capturedAt: number | null;
}

interface UserAgentSpecificMemoryResult {
  bytes: number;
}

interface PerformanceWithMemory extends Performance {
  memory?: {
    usedJSHeapSize: number;
    totalJSHeapSize: number;
    jsHeapSizeLimit: number;
  };
  measureUserAgentSpecificMemory?: () => Promise<UserAgentSpecificMemoryResult>;
}

const POLL_INTERVAL_MS = 3_000;
const EDGE_SNAP_DISTANCE = 42;
const CORNER_SNAP_DISTANCE = 84;
const FLOATING_INSET = 16;

type Corner = "top-left" | "top-right" | "bottom-left" | "bottom-right";
type Edge = "top" | "right" | "bottom" | "left";
type FloatingPosition =
  | { mode: "corner"; corner: Corner }
  | { mode: "edge"; corner: Corner; edge: Edge };

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  moved: boolean;
}

const DEFAULT_POSITION: FloatingPosition = { mode: "corner", corner: "bottom-right" };

const styles = stylex.create({
  sectionStack: { display: "flex", flexDirection: "column", gap: "0.75rem" },
  rowBetween: {
    alignItems: "center",
    display: "flex",
    gap: "0.75rem",
    justifyContent: "space-between",
  },
  rowStart: { alignItems: "flex-start" },
  label: { color: tokens.textMuted, fontSize: "0.75rem", fontWeight: 500 },
  sublabel: { color: tokens.textMuted, fontSize: "0.75rem" },
  workerList: { display: "flex", flexDirection: "column", gap: "0.5rem" },
  workerCard: {
    backgroundColor: `color-mix(in srgb,${tokens.surface} 90%,white)`,
    borderColor: tokens.border,
    borderRadius: "1rem",
    borderStyle: "solid",
    borderWidth: 1,
    padding: "0.75rem",
  },
  workerTitle: { color: tokens.textStrong, fontSize: "0.875rem", fontWeight: 600 },
  status: {
    borderRadius: "9999px",
    fontFamily: "monospace",
    fontSize: "0.625rem",
    letterSpacing: "0.12em",
    paddingBlock: "0.125rem",
    paddingInline: "0.5rem",
    textTransform: "uppercase",
  },
  statusActive: { backgroundColor: tokens.selected, color: tokens.oliveText },
  statusIdle: { backgroundColor: tokens.surfaceMuted, color: tokens.textMuted },
  detailGrid: {
    color: tokens.textMuted,
    display: "grid",
    fontSize: "0.6875rem",
    gap: "0.5rem",
    gridTemplateColumns: {
      default: "minmax(0,1fr)",
      "@media (min-width: 640px)": "repeat(2,minmax(0,1fr))",
    },
    marginTop: "0.75rem",
  },
  subtle: { color: tokens.textSoft },
  runtimes: { display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "0.75rem" },
  resident: {
    borderRadius: "9999px",
    fontSize: "0.625rem",
    fontWeight: 500,
    paddingBlock: "0.125rem",
    paddingInline: "0.5rem",
  },
  residentMulti: { backgroundColor: tokens.warningSurface, color: tokens.warningText },
  residentSingle: { backgroundColor: tokens.successSurface, color: tokens.successText },
  runtimeList: { display: "flex", flexDirection: "column", gap: "0.375rem" },
  runtime: {
    backgroundColor: tokens.surfaceSoft,
    borderColor: tokens.border,
    borderRadius: "0.75rem",
    borderStyle: "solid",
    borderWidth: 1,
    color: tokens.textMuted,
    fontSize: "0.6875rem",
    paddingBlock: "0.5rem",
    paddingInline: "0.75rem",
  },
  runtimeName: { color: tokens.textStrong, fontWeight: 500 },
  runtimeTime: {
    color: tokens.textSoft,
    fontFamily: "monospace",
    fontSize: "0.625rem",
  },
  runtimeId: {
    color: tokens.textMuted,
    marginTop: "0.25rem",
    overflowWrap: "anywhere",
  },
  empty: { color: tokens.textMuted, fontSize: "0.6875rem" },
  emptyWorkers: {
    backgroundColor: `color-mix(in srgb,${tokens.surface} 75%,transparent)`,
    borderColor: tokens.border,
    borderRadius: "1rem",
    borderStyle: "dashed",
    borderWidth: 1,
    color: tokens.textMuted,
    fontSize: "0.6875rem",
    paddingBlock: "1rem",
    paddingInline: "0.75rem",
  },
  floatingRoot: {
    display: "flex",
    flexDirection: "column",
    maxHeight: "calc(100dvh - 2rem)",
    pointerEvents: "none",
    position: "fixed",
    zIndex: 90,
  },
  floatingOpen: { width: "min(28rem,calc(100vw - 2rem))" },
  floatingClosed: { width: "auto" },
  widget: {
    alignItems: "center",
    backdropFilter: "blur(8px)",
    backgroundColor: {
      default: `color-mix(in srgb,${tokens.surface} 94%,white)`,
      ":hover": tokens.surface,
    },
    borderColor: {
      default: tokens.border,
      ":hover": tokens.oliveSoft,
    },
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: "0 18px 45px -30px rgb(0 0 0 / 0.35)",
    color: tokens.textStrong,
    display: "inline-flex",
    fontSize: "0.75rem",
    fontWeight: 500,
    gap: "0.5rem",
    justifyContent: "center",
    pointerEvents: "auto",
    touchAction: "none",
    transition: "border-color 200ms, background-color 200ms, box-shadow 200ms, transform 200ms",
  },
  dragging: { cursor: "grabbing", boxShadow: "0 18px 45px -24px rgb(0 0 0 / 0.5)" },
  draggable: { cursor: "grab" },
  widgetCorner: { borderRadius: "1rem", paddingBlock: "0.5rem", paddingInline: "0.625rem" },
  widgetTop: {
    borderRadius: "0 0 0.75rem 0.75rem",
    paddingBlock: "0.5rem",
    paddingInline: "0.75rem",
  },
  widgetBottom: {
    borderRadius: "0.75rem 0.75rem 0 0",
    paddingBlock: "0.5rem",
    paddingInline: "0.75rem",
  },
  widgetLeft: {
    borderRadius: "0 0.75rem 0.75rem 0",
    paddingBlock: "0.75rem",
    paddingInline: "0.5rem",
  },
  widgetRight: {
    borderRadius: "0.75rem 0 0 0.75rem",
    paddingBlock: "0.75rem",
    paddingInline: "0.5rem",
  },
  dotFrame: {
    alignItems: "center",
    backgroundColor: `color-mix(in srgb,${tokens.olive} 16%,transparent)`,
    borderRadius: "0.375rem",
    color: tokens.olive,
    display: "grid",
    height: "1.25rem",
    justifyItems: "center",
    width: "1.25rem",
  },
  dot: {
    backgroundColor: "currentColor",
    borderRadius: "9999px",
    height: "0.375rem",
    width: "0.375rem",
  },
  workerCount: {
    color: tokens.textMuted,
    fontSize: "0.6875rem",
    fontVariantNumeric: "tabular-nums",
  },
  panel: {
    backdropFilter: "blur(8px)",
    backgroundColor: `color-mix(in srgb,${tokens.surface} 94%,white)`,
    borderColor: tokens.border,
    borderRadius: "1.6rem",
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: "0 28px 80px -44px rgb(0 0 0 / 0.42)",
    display: "flex",
    flexDirection: "column",
    maxHeight: "100%",
    overflow: "hidden",
    pointerEvents: "auto",
    width: "100%",
  },
  panelHeader: {
    alignItems: "flex-start",
    borderBottomColor: tokens.border,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    display: "flex",
    gap: "1rem",
    justifyContent: "space-between",
    paddingBlock: "0.75rem",
    paddingInline: "1rem",
  },
  headerCopy: { minWidth: 0 },
  titleRow: { alignItems: "center", display: "flex", gap: "0.5rem" },
  titleIcon: {
    alignItems: "center",
    backgroundColor: `color-mix(in srgb,${tokens.olive} 16%,transparent)`,
    borderRadius: "0.5rem",
    color: tokens.olive,
    display: "grid",
    flexShrink: 0,
    height: "1.5rem",
    justifyItems: "center",
    width: "1.5rem",
  },
  titleDot: {
    backgroundColor: "currentColor",
    borderRadius: "9999px",
    height: "0.5rem",
    width: "0.5rem",
  },
  title: {
    color: tokens.textStrong,
    fontSize: "0.875rem",
    fontWeight: 600,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  countBadge: {
    backgroundColor: `color-mix(in srgb,${tokens.olive} 14%,transparent)`,
    borderRadius: "9999px",
    color: tokens.olive,
    flexShrink: 0,
    fontSize: "0.625rem",
    fontVariantNumeric: "tabular-nums",
    paddingBlock: "0.125rem",
    paddingInline: "0.5rem",
  },
  path: {
    color: tokens.textMuted,
    fontSize: "0.75rem",
    marginTop: "0.25rem",
    overflow: "hidden",
    paddingLeft: "2rem",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  close: {
    borderColor: {
      default: tokens.border,
      ":hover": tokens.oliveSoft,
    },
    borderRadius: "9999px",
    borderStyle: "solid",
    borderWidth: 1,
    color: {
      default: tokens.textMuted,
      ":hover": tokens.textStrong,
    },
    flexShrink: 0,
    fontSize: "0.75rem",
    paddingBlock: "0.25rem",
    paddingInline: "0.625rem",
    transition: "border-color 150ms, color 150ms",
  },
  panelBody: {
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
    overflow: "auto",
    padding: "1rem",
  },
  memoryCard: {
    backgroundColor: `color-mix(in srgb,${tokens.surface} 75%,transparent)`,
    borderColor: tokens.border,
    borderRadius: "1rem",
    borderStyle: "solid",
    borderWidth: 1,
    padding: "0.75rem",
  },
  memoryValue: { color: tokens.textStrong, fontSize: "0.875rem", fontWeight: 600 },
});

const getCorner = (clientX: number, clientY: number): Corner => {
  const horizontal = clientX < window.innerWidth / 2 ? "left" : "right";
  const vertical = clientY < window.innerHeight / 2 ? "top" : "bottom";
  return `${vertical}-${horizontal}`;
};

const getSnapPosition = (clientX: number, clientY: number): FloatingPosition => {
  const distances = {
    top: clientY,
    right: window.innerWidth - clientX,
    bottom: window.innerHeight - clientY,
    left: clientX,
  } satisfies Record<Edge, number>;
  const edge = (Object.keys(distances) as Edge[]).reduce((nearest, candidate) =>
    distances[candidate] < distances[nearest] ? candidate : nearest,
  );

  const horizontalEdge = clientX < window.innerWidth / 2 ? "left" : "right";
  const verticalEdge = clientY < window.innerHeight / 2 ? "top" : "bottom";
  if (
    distances[horizontalEdge] <= CORNER_SNAP_DISTANCE &&
    distances[verticalEdge] <= CORNER_SNAP_DISTANCE
  ) {
    return { mode: "corner", corner: getCorner(clientX, clientY) };
  }

  if (distances[edge] <= EDGE_SNAP_DISTANCE) {
    return { mode: "edge", edge, corner: getCorner(clientX, clientY) };
  }

  return { mode: "corner", corner: getCorner(clientX, clientY) };
};

const getPositionStyle = (
  position: FloatingPosition,
  isDragging: boolean,
  dragPoint: { x: number; y: number } | null,
): CSSProperties => {
  if (isDragging && dragPoint) {
    return {
      left: dragPoint.x,
      top: dragPoint.y,
      transform: "translate(-50%, -50%)",
    };
  }

  if (position.mode === "edge") {
    if (position.edge === "top" || position.edge === "bottom") {
      return {
        left: "50%",
        [position.edge]: 0,
        transform: "translateX(-50%)",
      };
    }

    return {
      top: "50%",
      [position.edge]: 0,
      transform: "translateY(-50%)",
    };
  }

  const [vertical, horizontal] = position.corner.split("-") as ["top" | "bottom", "left" | "right"];
  return { [vertical]: FLOATING_INSET, [horizontal]: FLOATING_INSET };
};

const formatBytes = (value: number | null): string => {
  if (!Number.isFinite(value ?? NaN) || value === null) {
    return "Unavailable";
  }

  const units = ["B", "KB", "MB", "GB"];
  let index = 0;
  let current = value;
  while (current >= 1024 && index < units.length - 1) {
    current /= 1024;
    index += 1;
  }

  const digits = current >= 100 || index === 0 ? 0 : current >= 10 ? 1 : 2;
  return `${current.toFixed(digits)} ${units[index]}`;
};

const formatTime = (timestamp: number | null): string => {
  if (!timestamp) return "Never";
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
};

const getFamilySummary = (worker: LocalModelWorkerDebugState): string => {
  const families = Array.from(new Set(worker.loadedRuntimes.map((runtime) => runtime.family)));
  if (families.length === 0) {
    return "None";
  }
  return families.join(", ");
};

const getCurrentTaskLabel = (worker: LocalModelWorkerDebugState): string => {
  if (!worker.currentRequestId || !worker.currentTaskKind) {
    return "Idle";
  }

  return `${worker.currentTaskKind} · ${worker.currentModelId ?? "unknown model"}`;
};

const useBrowserMemory = (): BrowserMemorySnapshot => {
  const [snapshot, setSnapshot] = useState<BrowserMemorySnapshot>({
    source: "unavailable",
    bytes: null,
    totalBytes: null,
    limitBytes: null,
    capturedAt: null,
  });

  useEffect(() => {
    if (!IS_DEV) {
      return;
    }

    let cancelled = false;

    const sampleMemory = async () => {
      const perf = performance as PerformanceWithMemory;
      try {
        if (typeof perf.measureUserAgentSpecificMemory === "function") {
          const result = await perf.measureUserAgentSpecificMemory();
          if (cancelled) return;
          setSnapshot({
            source: "uasm",
            bytes: result.bytes,
            totalBytes: null,
            limitBytes: null,
            capturedAt: Date.now(),
          });
          return;
        }
      } catch {
        // Fall back to heap metrics below.
      }

      if (perf.memory) {
        if (cancelled) return;
        setSnapshot({
          source: "heap",
          bytes: perf.memory.usedJSHeapSize,
          totalBytes: perf.memory.totalJSHeapSize,
          limitBytes: perf.memory.jsHeapSizeLimit,
          capturedAt: Date.now(),
        });
        return;
      }

      if (!cancelled) {
        setSnapshot({
          source: "unavailable",
          bytes: null,
          totalBytes: null,
          limitBytes: null,
          capturedAt: Date.now(),
        });
      }
    };

    void sampleMemory();
    const intervalId = window.setInterval(() => {
      void sampleMemory();
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  return snapshot;
};

const PoolSection = ({ pool }: { pool: LocalModelPoolDebugState }) => {
  return (
    <section {...stylex.props(styles.sectionStack)}>
      <div {...stylex.props(styles.rowBetween)}>
        <div>
          <p {...stylex.props(styles.label)}>{pool.pool} pool</p>
          <p {...stylex.props(styles.sublabel)}>
            {pool.workerCount} workers · {pool.activeRequestCount} active
          </p>
        </div>
      </div>
      <div {...stylex.props(styles.workerList)}>
        {pool.workers.length > 0 ? (
          pool.workers.map((worker) => {
            const loadedFamilies = Array.from(
              new Set(worker.loadedRuntimes.map((runtime) => runtime.family)),
            );
            const hasMultiFamilyRuntime = loadedFamilies.length > 1;

            return (
              <div key={`${pool.pool}-${worker.id}`} {...stylex.props(styles.workerCard)}>
                <div {...stylex.props(styles.rowBetween, styles.rowStart)}>
                  <div>
                    <p {...stylex.props(styles.workerTitle)}>Worker {worker.id}</p>
                    <p {...stylex.props(styles.sublabel)}>{getCurrentTaskLabel(worker)}</p>
                  </div>
                  <span
                    {...stylex.props(
                      styles.status,
                      worker.currentRequestId ? styles.statusActive : styles.statusIdle,
                    )}
                  >
                    {worker.currentStatus ?? "idle"}
                  </span>
                </div>
                <div {...stylex.props(styles.detailGrid)}>
                  <div>
                    <span {...stylex.props(styles.subtle)}>request</span>:{" "}
                    {worker.currentRequestId ?? "none"}
                  </div>
                  <div>
                    <span {...stylex.props(styles.subtle)}>model</span>:{" "}
                    {worker.currentModelId ?? "none"}
                  </div>
                  <div>
                    <span {...stylex.props(styles.subtle)}>active since</span>:{" "}
                    {formatTime(worker.activeSince)}
                  </div>
                  <div>
                    <span {...stylex.props(styles.subtle)}>last event</span>:{" "}
                    {formatTime(worker.lastEventAt)}
                  </div>
                  <div>
                    <span {...stylex.props(styles.subtle)}>last completed</span>:{" "}
                    {formatTime(worker.lastCompletedAt)}
                  </div>
                  <div>
                    <span {...stylex.props(styles.subtle)}>families</span>:{" "}
                    {getFamilySummary(worker)}
                  </div>
                </div>
                <div {...stylex.props(styles.runtimes)}>
                  <div {...stylex.props(styles.rowBetween)}>
                    <p {...stylex.props(styles.label)}>Loaded runtimes</p>
                    <span
                      {...stylex.props(
                        styles.resident,
                        hasMultiFamilyRuntime ? styles.residentMulti : styles.residentSingle,
                      )}
                    >
                      {hasMultiFamilyRuntime ? "multi-family resident" : "single-family resident"}
                    </span>
                  </div>
                  {worker.loadedRuntimes.length > 0 ? (
                    <div {...stylex.props(styles.runtimeList)}>
                      {worker.loadedRuntimes.map((runtime) => (
                        <div
                          key={`${worker.id}-${runtime.family}-${runtime.modelId}-${runtime.adapter}`}
                          {...stylex.props(styles.runtime)}
                        >
                          <div {...stylex.props(styles.rowBetween)}>
                            <span {...stylex.props(styles.runtimeName)}>
                              {runtime.family} / {runtime.adapter}
                            </span>
                            <span {...stylex.props(styles.runtimeTime)}>
                              {formatTime(runtime.loadedAt)}
                            </span>
                          </div>
                          <p {...stylex.props(styles.runtimeId)}>{runtime.modelId}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p {...stylex.props(styles.empty)}>
                      No runtime has been loaded in this worker yet.
                    </p>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <div {...stylex.props(styles.emptyWorkers)}>No workers created yet.</div>
        )}
      </div>
    </section>
  );
};

export const LocalModelDevtoolsPanel = ({ currentPath }: { currentPath: string }) => {
  const snapshot = useSyncExternalStore(
    subscribeLocalModelDebugSnapshot,
    getLocalModelDebugSnapshot,
    getLocalModelDebugSnapshot,
  );
  const memory = useBrowserMemory();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<FloatingPosition>(DEFAULT_POSITION);
  const [isDragging, setIsDragging] = useState(false);
  const [dragPoint, setDragPoint] = useState<{ x: number; y: number } | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const draggedRef = useRef(false);

  const chatPool = snapshot.pools.chat;
  const asrPool = snapshot.pools.asr;
  const embeddingPool = snapshot.pools.embedding;
  const formulaPool = snapshot.pools.formula;
  const activeWorkers = useMemo(() => {
    return [
      ...chatPool.workers,
      ...asrPool.workers,
      ...embeddingPool.workers,
      ...formulaPool.workers,
    ].filter((worker) => worker.currentRequestId);
  }, [asrPool.workers, chatPool.workers, embeddingPool.workers, formulaPool.workers]);

  const workerCount =
    chatPool.workerCount +
    asrPool.workerCount +
    embeddingPool.workerCount +
    formulaPool.workerCount;

  const handleWidgetPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) {
      return;
    }

    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsDragging(true);
    setDragPoint({ x: event.clientX, y: event.clientY });
  };

  const handleWidgetPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    const movedDistance = Math.hypot(
      event.clientX - dragState.startX,
      event.clientY - dragState.startY,
    );
    if (movedDistance > 6) {
      dragState.moved = true;
    }

    setDragPoint({ x: event.clientX, y: event.clientY });
  };

  const finishWidgetDrag = (event: PointerEvent<HTMLButtonElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (dragState.moved) {
      draggedRef.current = true;
      setPosition(getSnapPosition(event.clientX, event.clientY));
    }

    dragStateRef.current = null;
    setIsDragging(false);
    setDragPoint(null);
  };

  const handleWidgetClick = () => {
    if (draggedRef.current) {
      draggedRef.current = false;
      return;
    }

    if (position.mode === "edge") {
      setPosition({ mode: "corner", corner: position.corner });
      return;
    }

    setOpen(true);
  };

  if (!IS_DEV) {
    return null;
  }

  const widgetPositionStyle =
    position.mode !== "edge"
      ? styles.widgetCorner
      : position.edge === "top"
        ? styles.widgetTop
        : position.edge === "bottom"
          ? styles.widgetBottom
          : position.edge === "left"
            ? styles.widgetLeft
            : styles.widgetRight;

  return (
    <div
      {...stylex.props(styles.floatingRoot, open ? styles.floatingOpen : styles.floatingClosed)}
      style={getPositionStyle(position, isDragging, dragPoint)}
    >
      {!open ? (
        <button
          type="button"
          {...stylex.props(
            styles.widget,
            isDragging ? styles.dragging : styles.draggable,
            widgetPositionStyle,
          )}
          aria-label={
            position.mode === "edge"
              ? "Restore local model devtools widget"
              : "Open local model devtools"
          }
          title={
            position.mode === "edge"
              ? "Restore local model devtools"
              : "Drag to move or open local model devtools"
          }
          onClick={handleWidgetClick}
          onPointerDown={handleWidgetPointerDown}
          onPointerMove={handleWidgetPointerMove}
          onPointerUp={finishWidgetDrag}
          onPointerCancel={finishWidgetDrag}
        >
          <span {...stylex.props(styles.dotFrame)}>
            <span {...stylex.props(styles.dot)} />
          </span>
          <span {...stylex.props(styles.workerCount)}>{workerCount}</span>
        </button>
      ) : (
        <aside {...stylex.props(styles.panel)}>
          <div {...stylex.props(styles.panelHeader)}>
            <div {...stylex.props(styles.headerCopy)}>
              <div {...stylex.props(styles.titleRow)}>
                <span {...stylex.props(styles.titleIcon)}>
                  <span {...stylex.props(styles.titleDot)} />
                </span>
                <p {...stylex.props(styles.title)}>Local model devtools</p>
                <span {...stylex.props(styles.countBadge)}>{workerCount} workers</span>
              </div>
              <p {...stylex.props(styles.path)}>
                {currentPath} · {activeWorkers.length} active
              </p>
            </div>
            <button
              type="button"
              className={stylex.props(styles.close).className}
              aria-label="Hide local model devtools"
              onClick={() => setOpen(false)}
            >
              Close
            </button>
          </div>
          <div {...stylex.props(styles.panelBody)}>
            <section {...stylex.props(styles.memoryCard)}>
              <div {...stylex.props(styles.rowBetween)}>
                <div>
                  <p {...stylex.props(styles.label)}>Browser memory</p>
                  <p {...stylex.props(styles.memoryValue)}>{formatBytes(memory.bytes)}</p>
                </div>
                <span {...stylex.props(styles.status, styles.statusIdle)}>{memory.source}</span>
              </div>
              <div {...stylex.props(styles.detailGrid)}>
                <div>
                  <span {...stylex.props(styles.subtle)}>captured</span>:{" "}
                  {formatTime(memory.capturedAt)}
                </div>
                <div>
                  <span {...stylex.props(styles.subtle)}>total heap</span>:{" "}
                  {formatBytes(memory.totalBytes)}
                </div>
                <div>
                  <span {...stylex.props(styles.subtle)}>heap limit</span>:{" "}
                  {formatBytes(memory.limitBytes)}
                </div>
                <div>
                  <span {...stylex.props(styles.subtle)}>updated</span>:{" "}
                  {formatTime(snapshot.updatedAt)}
                </div>
              </div>
            </section>
            <PoolSection pool={chatPool} />
            <PoolSection pool={asrPool} />
            <PoolSection pool={embeddingPool} />
            <PoolSection pool={formulaPool} />
          </div>
        </aside>
      )}
    </div>
  );
};
