import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App";

const container = document.querySelector<HTMLDivElement>("#app");

if (container === null) {
  throw new Error("Missing #app container");
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
