import {
  type CSSProperties,
  type PointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import {
  getLocalModelDebugSnapshot,
  subscribeLocalModelDebugSnapshot,
  type LocalModelPoolDebugState,
  type LocalModelWorkerDebugState,
} from "@/lib/local-model/devtools";

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

const getEdgeButtonClassName = (position: FloatingPosition): string => {
  if (position.mode !== "edge") {
    return "rounded-2xl px-2.5 py-2";
  }

  if (position.edge === "top") {
    return "rounded-b-xl px-3 py-2";
  }
  if (position.edge === "bottom") {
    return "rounded-t-xl px-3 py-2";
  }
  if (position.edge === "left") {
    return "rounded-r-xl px-2 py-3";
  }
  return "rounded-l-xl px-2 py-3";
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
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-[var(--color-memora-text-muted)]">
            {pool.pool} pool
          </p>
          <p className="text-xs text-[var(--color-memora-text-muted)]">
            {pool.workerCount} workers · {pool.activeRequestCount} active
          </p>
        </div>
      </div>
      <div className="space-y-2">
        {pool.workers.length > 0 ? (
          pool.workers.map((worker) => {
            const loadedFamilies = Array.from(
              new Set(worker.loadedRuntimes.map((runtime) => runtime.family)),
            );
            const hasMultiFamilyRuntime = loadedFamilies.length > 1;

            return (
              <div
                key={`${pool.pool}-${worker.id}`}
                className="rounded-2xl border border-[var(--color-memora-border)] bg-[color-mix(in_srgb,var(--color-memora-surface)_90%,white)] p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[var(--color-memora-text-strong)]">
                      Worker {worker.id}
                    </p>
                    <p className="text-xs text-[var(--color-memora-text-muted)]">
                      {getCurrentTaskLabel(worker)}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] ${
                      worker.currentRequestId
                        ? "bg-[#879a4f]/15 text-[#516127]"
                        : "bg-zinc-200/70 text-zinc-600"
                    }`}
                  >
                    {worker.currentStatus ?? "idle"}
                  </span>
                </div>
                <div className="mt-3 grid gap-2 text-[11px] text-[var(--color-memora-text-muted)] sm:grid-cols-2">
                  <div>
                    <span className="text-[var(--color-memora-text-subtle)]">request</span>:{" "}
                    {worker.currentRequestId ?? "none"}
                  </div>
                  <div>
                    <span className="text-[var(--color-memora-text-subtle)]">model</span>:{" "}
                    {worker.currentModelId ?? "none"}
                  </div>
                  <div>
                    <span className="text-[var(--color-memora-text-subtle)]">active since</span>:{" "}
                    {formatTime(worker.activeSince)}
                  </div>
                  <div>
                    <span className="text-[var(--color-memora-text-subtle)]">last event</span>:{" "}
                    {formatTime(worker.lastEventAt)}
                  </div>
                  <div>
                    <span className="text-[var(--color-memora-text-subtle)]">last completed</span>:{" "}
                    {formatTime(worker.lastCompletedAt)}
                  </div>
                  <div>
                    <span className="text-[var(--color-memora-text-subtle)]">families</span>:{" "}
                    {getFamilySummary(worker)}
                  </div>
                </div>
                <div className="mt-3 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-medium text-[var(--color-memora-text-muted)]">
                      Loaded runtimes
                    </p>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        hasMultiFamilyRuntime
                          ? "bg-amber-100 text-amber-700"
                          : "bg-emerald-100 text-emerald-700"
                      }`}
                    >
                      {hasMultiFamilyRuntime ? "multi-family resident" : "single-family resident"}
                    </span>
                  </div>
                  {worker.loadedRuntimes.length > 0 ? (
                    <div className="space-y-1.5">
                      {worker.loadedRuntimes.map((runtime) => (
                        <div
                          key={`${worker.id}-${runtime.family}-${runtime.modelId}-${runtime.adapter}`}
                          className="rounded-xl border border-[var(--color-memora-border)] bg-white/65 px-3 py-2 text-[11px] text-[var(--color-memora-text-muted)]"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-medium text-[var(--color-memora-text-strong)]">
                              {runtime.family} / {runtime.adapter}
                            </span>
                            <span className="font-mono text-[10px] text-[var(--color-memora-text-subtle)]">
                              {formatTime(runtime.loadedAt)}
                            </span>
                          </div>
                          <p className="mt-1 break-all text-[var(--color-memora-text-muted)]">
                            {runtime.modelId}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-[var(--color-memora-text-muted)]">
                      No runtime has been loaded in this worker yet.
                    </p>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <div className="rounded-2xl border border-dashed border-[var(--color-memora-border)] bg-[var(--color-memora-surface)]/75 px-3 py-4 text-[11px] text-[var(--color-memora-text-muted)]">
            No workers created yet.
          </div>
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

  return (
    <div
      className={`pointer-events-none fixed z-[90] flex max-h-[calc(100dvh-2rem)] flex-col ${
        open ? "w-[min(28rem,calc(100vw-2rem))]" : "w-auto"
      }`}
      style={getPositionStyle(position, isDragging, dragPoint)}
    >
      {!open ? (
        <button
          type="button"
          className={`pointer-events-auto inline-flex items-center justify-center gap-2 border border-[var(--color-memora-border)] bg-[color-mix(in_srgb,var(--color-memora-surface)_94%,white)] text-xs font-medium text-[var(--color-memora-text-strong)] shadow-[0_18px_45px_-30px_rgba(34,33,29,0.35)] backdrop-blur transition-[border-color,background-color,box-shadow,transform] duration-200 ease-out hover:border-[var(--color-memora-olive-soft)] hover:bg-[var(--color-memora-surface)] ${
            isDragging
              ? "cursor-grabbing shadow-[0_18px_45px_-24px_rgba(34,33,29,0.5)]"
              : "cursor-grab"
          } touch-none ${getEdgeButtonClassName(position)}`}
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
          <span className="grid size-5 place-items-center rounded-md bg-[color-mix(in_srgb,var(--color-memora-olive)_16%,transparent)] text-[var(--color-memora-olive)]">
            <span className="size-1.5 rounded-full bg-current" />
          </span>
          <span className="tabular-nums text-[11px] text-[var(--color-memora-text-muted)]">
            {workerCount}
          </span>
        </button>
      ) : (
        <aside className="pointer-events-auto flex max-h-full w-full flex-col overflow-hidden rounded-[1.6rem] border border-[var(--color-memora-border)] bg-[color-mix(in_srgb,var(--color-memora-surface)_94%,white)] shadow-[0_28px_80px_-44px_rgba(34,33,29,0.42)] backdrop-blur">
          <div className="flex items-start justify-between gap-4 border-b border-[var(--color-memora-border)] px-4 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="grid size-6 shrink-0 place-items-center rounded-lg bg-[color-mix(in_srgb,var(--color-memora-olive)_16%,transparent)] text-[var(--color-memora-olive)]">
                  <span className="size-2 rounded-full bg-current" />
                </span>
                <p className="truncate text-sm font-semibold text-[var(--color-memora-text-strong)]">
                  Local model devtools
                </p>
                <span className="shrink-0 rounded-full bg-[color-mix(in_srgb,var(--color-memora-olive)_14%,transparent)] px-2 py-0.5 text-[10px] tabular-nums text-[var(--color-memora-olive)]">
                  {workerCount} workers
                </span>
              </div>
              <p className="mt-1 truncate pl-8 text-xs text-[var(--color-memora-text-muted)]">
                {currentPath} · {activeWorkers.length} active
              </p>
            </div>
            <button
              type="button"
              className="shrink-0 rounded-full border border-[var(--color-memora-border)] px-2.5 py-1 text-xs text-[var(--color-memora-text-muted)] transition hover:border-[var(--color-memora-olive-soft)] hover:text-[var(--color-memora-text-strong)]"
              aria-label="Hide local model devtools"
              onClick={() => setOpen(false)}
            >
              Close
            </button>
          </div>
          <div className="space-y-4 overflow-auto px-4 py-4">
            <section className="rounded-2xl border border-[var(--color-memora-border)] bg-[var(--color-memora-surface)]/75 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-medium text-[var(--color-memora-text-muted)]">
                    Browser memory
                  </p>
                  <p className="text-sm font-semibold text-[var(--color-memora-text-strong)]">
                    {formatBytes(memory.bytes)}
                  </p>
                </div>
                <span className="rounded-full bg-zinc-200/70 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-zinc-600">
                  {memory.source}
                </span>
              </div>
              <div className="mt-3 grid gap-2 text-[11px] text-[var(--color-memora-text-muted)] sm:grid-cols-2">
                <div>
                  <span className="text-[var(--color-memora-text-subtle)]">captured</span>:{" "}
                  {formatTime(memory.capturedAt)}
                </div>
                <div>
                  <span className="text-[var(--color-memora-text-subtle)]">total heap</span>:{" "}
                  {formatBytes(memory.totalBytes)}
                </div>
                <div>
                  <span className="text-[var(--color-memora-text-subtle)]">heap limit</span>:{" "}
                  {formatBytes(memory.limitBytes)}
                </div>
                <div>
                  <span className="text-[var(--color-memora-text-subtle)]">updated</span>:{" "}
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
