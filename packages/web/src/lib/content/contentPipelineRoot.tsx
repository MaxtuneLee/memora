import { useStore } from "@livestore/react";
import { createContext, useCallback, useContext, useMemo, useRef, type ReactNode } from "react";

import { modelWorkerFactory } from "@/lib/model-worker";
import { BackgroundTaskQueue, createBackgroundTaskQueue } from "@/lib/background-tasks";
import { createContentTaskHandlers } from "./contentTaskHandlers";

interface ContentPipelineContextValue {
  reindexFile: (fileId: string) => Promise<void>;
  getTasks: () => ReturnType<BackgroundTaskQueue["getTasks"]>;
}

const ContentPipelineContext = createContext<ContentPipelineContextValue | null>(null);

export const useContentPipeline = (): ContentPipelineContextValue => {
  const value = useContext(ContentPipelineContext);
  if (!value) throw new Error("useContentPipeline must be used inside ContentPipelineRoot");
  return value;
};

export function ContentPipelineRoot({ children }: { children: ReactNode }) {
  const { store } = useStore();
  const queue = useMemo(() => createBackgroundTaskQueue(), []);
  const started = useRef(false);
  const handlers = useMemo(
    () => createContentTaskHandlers({ store, vectorDb: modelWorkerFactory.vectorDb }),
    [store],
  );

  const ensureStarted = useCallback(async () => {
    if (started.current) return;
    handlers.forEach((handler) => queue.registry.register(handler));
    await queue.start();
    started.current = true;
  }, [handlers, queue]);

  const reindexFile = useCallback(
    async (fileId: string) => {
      await ensureStarted();
      await queue.cancel(
        (task) =>
          task.kind === "content.extract" &&
          (task.payload as { fileId?: string }).fileId === fileId,
      );
      await queue.enqueue({
        kind: "content.extract",
        payload: { fileId },
        dedupeKey: `manual-extract:${fileId}:${Date.now()}`,
        priority: "user",
        resourceGroup: "document-parser",
      });
    },
    [ensureStarted, queue],
  );

  const value = useMemo<ContentPipelineContextValue>(
    () => ({ reindexFile, getTasks: () => queue.getTasks() }),
    [queue, reindexFile],
  );

  return <ContentPipelineContext.Provider value={value}>{children}</ContentPipelineContext.Provider>;
}
