import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

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
