import { makePersistedAdapter } from "@livestore/adapter-web";
import LiveStoreSharedWorker from "@livestore/adapter-web/shared-worker?sharedworker";
import { LiveStoreProvider } from "@livestore/react";
import { StrictMode } from "react";
import { unstable_batchedUpdates as batchUpdates } from "react-dom";
import { createRoot } from "react-dom/client";
import { LiveStoreDevtoolsPanel, type LiveStoreDevtoolsPanelProps } from "@memora/livestore-devtool";
import LiveStoreLoadingScreen from "@/app/components/LiveStoreLoadingScreen";
import { createLiveStoreLoadingStatus } from "@/app/liveStoreLoadingStatus";
import { schema } from "@/livestore/schema";
import LiveStoreWorker from "@/workers/livestore.worker?worker";
import "@/index.css";

const adapter = makePersistedAdapter({
  storage: { type: "opfs" },
  worker: LiveStoreWorker,
  sharedWorker: LiveStoreSharedWorker,
});

export function renderLiveStoreDevtools(
  rootElement: HTMLElement,
  props: LiveStoreDevtoolsPanelProps = {},
) {
  createRoot(rootElement).render(
    <StrictMode>
      <LiveStoreProvider
        schema={schema}
        adapter={adapter}
        renderLoading={(status) => (
          <LiveStoreLoadingScreen status={createLiveStoreLoadingStatus(status)} />
        )}
        batchUpdates={batchUpdates}
        storeId={"main"}
        syncPayload={{ authToken: "insecure-token-change-me" }}
      >
        <LiveStoreDevtoolsPanel {...props} />
      </LiveStoreProvider>
    </StrictMode>,
  );
}
