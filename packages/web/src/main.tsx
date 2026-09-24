import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

import { hasWebAssembly } from "./lib/device/browserSupport";
import { isMobileDevice } from "./lib/device/isMobileDevice";
import { applyDocumentTheme } from "./lib/theme/documentTheme";
import { startAutoHideScrollbars } from "./lib/ui/autoHideScrollbars";

// index.html resolved the first-frame theme; add the matching StyleX theme before React renders.
applyDocumentTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
startAutoHideScrollbars();

if (import.meta.env.DEV) {
  const diagnostics = new BroadcastChannel("memora-livestore-worker-diagnostics");
  diagnostics.addEventListener("message", (event: MessageEvent<unknown>) => {
    console.error("LiveStore worker diagnostic", event.data);
  });
}

if (import.meta.env.DEV) {
  void import("react-scan").then(({ scan }) => {
    scan({ enabled: true });
  });
}

async function bootstrap(): Promise<void> {
  const rootElement = document.getElementById("root");
  if (rootElement === null) throw new Error("Missing application root element");

  const unsupported = isMobileDevice(navigator.userAgent, navigator.maxTouchPoints)
    ? {
        title: "Open Memora on a computer",
        description:
          "Memora doesn't support phones or tablets yet. Visit this page on a computer to use it.",
      }
    : hasWebAssembly()
      ? null
      : {
          title: "Your browser can't run Memora",
          description:
            "Memora needs WebAssembly to run on your device. Update your browser, or open Memora in the latest Chrome or Edge.",
        };
  if (unsupported) {
    const { default: UnsupportedScreen } = await import("./app/components/UnsupportedScreen");
    createRoot(rootElement).render(<UnsupportedScreen {...unsupported} />);
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

void bootstrap().catch((error: unknown) => {
  console.error("Failed to start application", error);
  const rootElement = document.getElementById("root");
  if (rootElement) {
    rootElement.textContent =
      "Something went wrong while loading the app. Please refresh the page.";
  }
});
