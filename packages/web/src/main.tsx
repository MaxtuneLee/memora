import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { migrateLiveStoreStorageFormat } from "./lib/livestore/storageFormatMigration";

if (import.meta.env.DEV) {
  const diagnostics = new BroadcastChannel("memora-livestore-worker-diagnostics");
  diagnostics.addEventListener("message", (event: MessageEvent<unknown>) => {
    console.error("LiveStore worker diagnostic", event.data);
  });
}

if (import.meta.env.DEV && import.meta.env.VITE_ENABLE_REACT_SCAN === "true") {
  void import("react-scan").then(({ scan }) => {
    scan({ enabled: true });
  });
}

async function bootstrap(): Promise<void> {
  const rootElement = document.getElementById("root");
  if (rootElement === null) throw new Error("Missing application root element");

  try {
    const migration = await migrateLiveStoreStorageFormat();
    if (migration.migrated) {
      console.info(`Migrated ${migration.eventCount} LiveStore events from storage format 4 to 6.`);
    }
  } catch (error) {
    console.error("LiveStore storage migration failed", error);
    rootElement.textContent =
      "Local data migration failed. Close other Memora tabs, then reload this page.";
    return;
  }

  const [{ RouterProvider }, { router }] = await Promise.all([
    import("react-router"),
    import("./app/router"),
  ]);

  createRoot(rootElement).render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  );
}

void bootstrap();
