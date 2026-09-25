import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";

import "@web/index.css";
import "./site.css";
import { applyDocumentTheme } from "@web/lib/theme/documentTheme";
import { startAutoHideScrollbars } from "@web/lib/ui/autoHideScrollbars";
import { App } from "./App";
import { containDemoScrolling } from "./lib/containScroll";
import { initialTheme } from "./lib/theme";

// Same theme classes the app applies, so embedded components get their real colors. The
// header toggle takes over from here (see lib/theme).
applyDocumentTheme(initialTheme());

containDemoScrolling();
// The app's thin overlay scrollbars (styled in @web/index.css) instead of the native ones.
startAutoHideScrollbars();

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root");

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
