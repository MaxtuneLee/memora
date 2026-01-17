import AppLayout from "./layouts/AppLayout";
import { makePersistedAdapter } from "@livestore/adapter-web";
import LiveStoreSharedWorker from "@livestore/adapter-web/shared-worker?sharedworker";
import { LiveStoreProvider } from "@livestore/react";
import LiveStoreWorker from "@/workers/livestore.worker?worker";
import { schema } from "@/livestore/schema";
import { unstable_batchedUpdates as batchUpdates } from "react-dom";

const adapter = makePersistedAdapter({
  storage: { type: "opfs" },
  worker: LiveStoreWorker,
  sharedWorker: LiveStoreSharedWorker,
});

export default function App() {
  return (
    <LiveStoreProvider
      schema={schema}
      adapter={adapter}
      renderLoading={(_) => <div>Loading LiveStore ({_.stage})...</div>}
      batchUpdates={batchUpdates}
      storeId={"main"}
      syncPayload={{ authToken: "insecure-token-change-me" }}
    >
      <AppLayout />
    </LiveStoreProvider>
  );
}
