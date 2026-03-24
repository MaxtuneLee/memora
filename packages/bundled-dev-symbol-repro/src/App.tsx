import { makePersistedAdapter } from "@livestore/adapter-web";
import LiveStoreSharedWorker from "@livestore/adapter-web/shared-worker?sharedworker";
import { LiveStoreProvider } from "@livestore/react";
import { unstable_batchedUpdates as batchUpdates } from "react-dom";

import LiveStoreWorker from "./livestore.worker?worker";
import { schema } from "./schema";

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
      batchUpdates={batchUpdates}
      renderLoading={() => <div>Loading store...</div>}
      storeId={"main"}
    >
      <div>Store mounted</div>
    </LiveStoreProvider>
  );
}
