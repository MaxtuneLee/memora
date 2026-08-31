import { StoreRegistryProvider } from "@livestore/react";
import { StrictMode, Suspense, useCallback } from "react";
import { createRoot } from "react-dom/client";
import {
  LiveStoreDevtoolsPanel,
  type LiveStoreDevtoolsPanelProps,
} from "@memora/livestore-devtool";
import LiveStoreLoadingScreen from "@/app/components/LiveStoreLoadingScreen";
import { appStoreRegistry, useAppStore, useLiveStoreLoadingStatus } from "@/livestore/store";
import { migrateLiveStoreStorageFormat } from "@/lib/livestore/storageFormatMigration";
import "@/index.css";

type DevtoolsRenderProps = Omit<LiveStoreDevtoolsPanelProps, "querySql" | "executeSql">;

function LiveStoreFallback() {
  const status = useLiveStoreLoadingStatus();
  return <LiveStoreLoadingScreen status={status} />;
}

function DevtoolsPanel(props: DevtoolsRenderProps) {
  const store = useAppStore();
  const querySql = useCallback((query: string) => store.query({ query, bindValues: {} }), [store]);
  const executeSql = useCallback(
    (query: string) => {
      const internalStore = store as unknown as {
        sqliteDbWrapper?: {
          execute: (
            statement: string,
            bindValues?: Record<string, unknown>,
          ) => {
            durationMs: number;
          };
        };
      };
      const result = internalStore.sqliteDbWrapper?.execute(query, {});
      if (!result) {
        throw new Error(
          "Write queries are unavailable because the sqlite executor is not exposed.",
        );
      }
      return result;
    },
    [store],
  );

  return <LiveStoreDevtoolsPanel {...props} querySql={querySql} executeSql={executeSql} />;
}

export function renderLiveStoreDevtools(rootElement: HTMLElement, props: DevtoolsRenderProps = {}) {
  void migrateLiveStoreStorageFormat()
    .then(() => {
      createRoot(rootElement).render(
        <StrictMode>
          <StoreRegistryProvider storeRegistry={appStoreRegistry}>
            <Suspense fallback={<LiveStoreFallback />}>
              <DevtoolsPanel {...props} />
            </Suspense>
          </StoreRegistryProvider>
        </StrictMode>,
      );
    })
    .catch((error: unknown) => {
      console.error("LiveStore storage migration failed", error);
      rootElement.textContent =
        "Local data migration failed. Close other Memora tabs, then reload this page.";
    });
}
