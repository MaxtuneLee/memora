import AppLayout from "./layouts/AppLayout";
import { StoreRegistryProvider } from "@livestore/react";
import { Suspense } from "react";
import LiveStoreLoadingScreen from "./components/LiveStoreLoadingScreen";
import { ContentPipelineRoot } from "@/lib/content/contentPipelineRoot";
import {
  appStoreRegistry,
  useLiveStoreLoadingStatus,
} from "@/livestore/store";

function LiveStoreFallback() {
  const status = useLiveStoreLoadingStatus();
  return <LiveStoreLoadingScreen status={status} />;
}

export default function App() {
  return (
    <StoreRegistryProvider storeRegistry={appStoreRegistry}>
      <Suspense fallback={<LiveStoreFallback />}>
        <ContentPipelineRoot>
          <AppLayout />
        </ContentPipelineRoot>
      </Suspense>
    </StoreRegistryProvider>
  );
}
