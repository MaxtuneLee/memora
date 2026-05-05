import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

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
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-memora-text-subtle)]">
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
                    <span className="text-[var(--color-memora-text-subtle)]">last completed</span>
                    : {formatTime(worker.lastCompletedAt)}
                  </div>
                  <div>
                    <span className="text-[var(--color-memora-text-subtle)]">families</span>:{" "}
                    {getFamilySummary(worker)}
                  </div>
                </div>
                <div className="mt-3 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-memora-text-subtle)]">
                      Loaded Runtimes
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

  const chatPool = snapshot.pools.chat;
  const asrPool = snapshot.pools.asr;
  const activeWorkers = useMemo(() => {
    return [...chatPool.workers, ...asrPool.workers].filter((worker) => worker.currentRequestId);
  }, [asrPool.workers, chatPool.workers]);

  if (!IS_DEV) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-[90] flex max-h-[calc(100dvh-2rem)] w-[min(28rem,calc(100vw-2rem))] flex-col items-end">
      {!open ? (
        <button
          type="button"
          className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-[var(--color-memora-border)] bg-[color-mix(in_srgb,var(--color-memora-surface)_90%,white)] px-3 py-2 text-xs font-medium text-[var(--color-memora-text-strong)] shadow-[0_18px_45px_-30px_rgba(34,33,29,0.35)] backdrop-blur"
          onClick={() => setOpen(true)}
        >
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--color-memora-text-subtle)]">
            Local Model Devtools
          </span>
          <span className="rounded-full bg-[#879a4f]/15 px-2 py-0.5 text-[10px] text-[#516127]">
            {chatPool.workerCount} chat workers
          </span>
        </button>
      ) : (
        <aside className="pointer-events-auto flex max-h-full w-full flex-col overflow-hidden rounded-[1.6rem] border border-[var(--color-memora-border)] bg-[color-mix(in_srgb,var(--color-memora-surface)_94%,white)] shadow-[0_28px_80px_-44px_rgba(34,33,29,0.42)] backdrop-blur">
          <div className="flex items-start justify-between gap-4 border-b border-[var(--color-memora-border)] px-4 py-3">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-memora-text-subtle)]">
                Local Model Devtools
              </p>
              <p className="mt-1 text-sm font-semibold text-[var(--color-memora-text-strong)]">
                Worker residency and runtime stacking
              </p>
              <p className="mt-1 text-xs text-[var(--color-memora-text-muted)]">
                Route {currentPath} · {activeWorkers.length} active workers
              </p>
            </div>
            <button
              type="button"
              className="rounded-full border border-[var(--color-memora-border)] px-2.5 py-1 text-xs text-[var(--color-memora-text-muted)] transition hover:text-[var(--color-memora-text-strong)]"
              onClick={() => setOpen(false)}
            >
              Hide
            </button>
          </div>
          <div className="space-y-4 overflow-auto px-4 py-4">
            <section className="rounded-2xl border border-[var(--color-memora-border)] bg-[var(--color-memora-surface)]/75 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-memora-text-subtle)]">
                    Browser Memory
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
          </div>
        </aside>
      )}
    </div>
  );
};
